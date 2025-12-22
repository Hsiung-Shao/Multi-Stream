
// scripts/verify_stream.ts
import { StreamManager } from '../src/features/stream/StreamManager';
import { StreamPlatform } from '../src/features/stream/types';
import { DomAdapterContract } from '../src/features/stream/DomAdapter';
import { ChatConnector } from '../src/features/stream/ChatConnector';
import { PlayerRegistry } from '../src/features/stream/PlayerRegistry';

// === Mocks ===

class MockDomAdapter implements DomAdapterContract {
    public createdBoxes: number[] = [];

    createStreamBox(id: number): void {
        this.createdBoxes.push(id);
    }
    removeStreamBox(id: number): void {
        this.createdBoxes = this.createdBoxes.filter(x => x !== id);
    }
    addControls(id: number): void { }
    updateLabel(id: number, text: string): void { }
    containerExists(): boolean { return true; }
}

class MockChatConnector extends ChatConnector {
    public createdChats: number[] = [];
    public destroyedChats: number[] = [];

    callCreate(id: number, platform: string, channelId: string | null, videoId: string | null): void {
        this.createdChats.push(id);
    }
    destroy(id: number): void {
        this.destroyedChats.push(id);
    }
}

// Mock Global Window for Chat Connector safety check
(global as any).window = {
    createChat: () => { },
    destroyChat: () => { },
    toggleChat: () => { },
    separateChat: () => { }
};

// === Test Runner ===

async function runTests() {
    console.log('Running Stream Manager Verification...');
    let passed = 0;
    let failed = 0;

    function assert(condition: boolean, msg: string) {
        if (condition) {
            // console.log(`[PASS] ${msg}`);
            passed++;
        } else {
            console.error(`[FAIL] ${msg}`);
            failed++;
        }
    }

    try {
        // Setup
        const mockDom = new MockDomAdapter();
        const mockChat = new MockChatConnector();
        const registry = new PlayerRegistry();

        // Inject Mock Player Factory
        registry.setFactory((id, platform, iden) => {
            return {
                mockId: id,
                platform,
                setVolume: () => { },
                setMuted: () => { },
                destroy: () => { }
            };
        });

        const manager = new StreamManager(mockDom, registry, mockChat);

        // Test 1: addStream Success
        await manager.addStream('twitch.tv/shroud');
        const streams = manager.getStreams();
        assert(streams.length === 1, 'Stream list should have 1 item');
        assert(streams[0].platform === 'twitch', 'Platform should be twitch');
        assert(streams[0].identifier === 'shroud', 'Identifier should be shroud');
        assert(mockDom.createdBoxes.includes(1), 'DOM box created');
        assert(mockChat.createdChats.includes(1), 'Chat created');
        assert(registry.has(1), 'Player registered');

        // Test 2: Dual Add Guard (Registry) - Logic in Manager allows multiple IDs, but Registry prevents same ID overwrite
        // Manager incs ID, so addStream again makes ID 2.
        await manager.addStream('twitch.tv/ninja');
        assert(manager.getStreams().length === 2, 'Stream list should have 2 items');
        assert(registry.has(2), 'Player 2 registered');

        // Test 3: removeStream
        manager.removeStream(1);
        assert(manager.getStreams().length === 1, 'Stream list should have 1 item after remove');
        assert(!registry.has(1), 'Player 1 removed from registry');
        assert(mockDom.createdBoxes.includes(2) && !mockDom.createdBoxes.includes(1), 'DOM box 1 removed');
        assert(mockChat.destroyedChats.includes(1), 'Chat 1 destroyed');

        // Test 4: reloadStream
        // ID 2 exists.
        const oldPlayerInstance = registry.get(2) as any;
        manager.reloadStream(2);
        const newPlayerInstance = registry.get(2) as any;
        assert(registry.has(2), 'Player 2 still exists after reload');
        // Since we return new object in factory, strict eq check:
        // Note: Our registry implementation returns new adapter wrapper.
        assert(oldPlayerInstance !== newPlayerInstance, 'Player instance should be refreshed');

        // Test 5: Volume Control
        manager.setVolume(2, 50);
        assert(manager.getStream(2)?.volume === 50, 'Volume state updated');

        // Test 6: URL Parser Twitch
        await manager.addStream('justin'); // plain login
        const s3 = manager.getStreams().find(s => s.identifier === 'justin');
        assert(!!s3, 'Plain Twitch login parsed');

        // Test 7: URL Parser YouTube
        await manager.addStream('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        const s4 = manager.getStreams().find(s => s.identifier === 'dQw4w9WgXcQ');
        assert(!!s4 && s4.platform === 'youtube', 'YouTube URL parsed');

        // Test 8: clearAll
        manager.clearAll();
        assert(manager.getStreams().length === 0, 'All streams cleared');
        assert(registry.getAllIds().length === 0, 'Registry cleared');
        assert(mockDom.createdBoxes.length === 0, 'All DOM boxes removed');

    } catch (e) {
        console.error('Test crashed:', e);
        failed++;
    }

    console.log(`\nResults: ${passed} PASS, ${failed} FAIL`);
    if (failed > 0) process.exit(1);
}

runTests();
