
import { strict as assert } from 'assert';
import { ChatManager } from './src/features/chat/ChatManager';
import { DomAdapter } from './src/features/chat/DomAdapter';
import { YouTubeChatWatchdog } from './src/features/chat/YouTubeChatWatchdog';

// Mock DOM
class MockElement {
    id: string;
    tagName: string;
    src: string = '';
    children: MockElement[] = [];
    isConnected: boolean = true;
    style: any = {};
    innerHTML: string = '';
    classList = {
        add: () => { }, remove: () => { }, contains: () => false
    };

    constructor(tag: string) { this.tagName = tag.toUpperCase(); }
    querySelector(sel: string) {
        if (sel === 'iframe') return this.children.find(c => c.tagName === 'IFRAME');
        return null;
    }
    appendChild(c: MockElement) { this.children.push(c); }
    remove() { this.isConnected = false; }
}

const mockDoc = {
    getElementById: () => null,
    createElement: (tag: string) => new MockElement(tag)
};
(global as any).document = mockDoc;
(global as any).window = { location: { hostname: 'localhost', protocol: 'http:' } };

// Mock Adapter specific
class MockAdapter extends DomAdapter {
    containers = new Map<number, MockElement>();
    getContainer(id: number) {
        if (!this.containers.has(id)) {
            const el = new MockElement('DIV');
            el.id = 'chat' + id;
            this.containers.set(id, el);
        }
        return this.containers.get(id)!;
    }
    createIframe(c: any, url: string) {
        const f = new MockElement('IFRAME');
        f.src = url;
        c.appendChild(f);
        return f as any;
    }
}

async function runTests() {
    console.log('Starting verify_chat_prE.ts (Cleanup Check)...');

    const adapter = new MockAdapter();
    const watchdog = new YouTubeChatWatchdog(adapter);
    const manager = new ChatManager(adapter, undefined, watchdog);

    // Test 1: createChat attaches watchdog
    console.log('Test 1: Create Chat & Watchdog');
    manager.createChat(1, 'youtube', '', 'vid1');
    const container = adapter.getContainer(1);
    const iframe = container.children[0];

    // Access private properties for verification
    const activeMonitors = (watchdog as any).activeMonitors;
    assert.equal(activeMonitors.size, 1, 'Watchdog should be active');
    console.log('[PASS] Watchdog attached');

    // Test 2: destroyChat stops watchdog
    console.log('Test 2: Destroy Chat');
    manager.destroyChat(1);

    assert.equal(activeMonitors.size, 0, 'Watchdog should be stopped after destroy');
    console.log('[PASS] Watchdog stopped');

    // Test 3: destroyChat idempotent / safe on missing
    console.log('Test 3: Double Destroy Safe');
    manager.destroyChat(1); // Should not throw
    console.log('[PASS] Double destroy safe');

    // Test 4: Verify Watchdog internal map cleanup
    assert.equal(activeMonitors.has('iframe-1'), false);

    // Test 5: Re-creation doesn't duplicate watchers
    console.log('Test 5: Re-creation');
    manager.createChat(1, 'youtube', '', 'vid1');
    assert.equal(activeMonitors.size, 1, 'Should have 1 active monitor');
    manager.createChat(1, 'youtube', '', 'vid1'); // Re-create same ID
    assert.equal(activeMonitors.size, 1, 'Should still have 1 active monitor (cleaned up old one)');

    console.log('[PASS] Re-creation clean');

    console.log('All Cleanup checks passed.');
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
