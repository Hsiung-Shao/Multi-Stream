
import { strict as assert } from 'assert';
import { ChatManager } from './src/features/chat/ChatManager';
import { DomAdapterContract, RecoveryStrategy, YouTubeWatchdogContract } from './src/features/chat/types';
import { YouTubeChatWatchdog } from './src/features/chat/YouTubeChatWatchdog';

// --- Mocks ---

// Mock DOM Elements
class MockElement {
    id: string = '';
    tagName: string = 'DIV';
    className: string = '';
    style: any = {};
    src: string = '';
    innerHTML: string = '';
    isConnected: boolean = true;
    children: MockElement[] = [];
    listeners: Record<string, Function> = {};
    parentNode: MockElement | null = null;
    classList = {
        add: (c: string) => this.className += ' ' + c,
        remove: (c: string) => this.className = this.className.replace(c, ''),
        contains: (c: string) => this.className.includes(c)
    };

    constructor(tagName: string = 'DIV') { this.tagName = tagName; }

    appendChild(child: MockElement) {
        this.children.push(child);
        child.parentNode = this;
    }

    remove() {
        this.isConnected = false;
        if (this.parentNode) {
            this.parentNode.children = this.parentNode.children.filter(c => c !== this);
        }
    }

    querySelector(selector: string) {
        if (selector === 'iframe') return this.children.find(c => c.tagName === 'IFRAME');
        return null;
    }

    addEventListener(event: string, fn: Function) { this.listeners[event] = fn; }

    // Simulate events
    emit(event: string) {
        if (this.listeners[event]) this.listeners[event]();
        // Also fire onX properties
        if ((this as any)['on' + event]) (this as any)['on' + event]();
    }
}

// Mock Adapter
class MockDomAdapter implements DomAdapterContract {
    containers: Map<number, MockElement> = new Map();

    getContainer(id: number): any {
        if (!this.containers.has(id)) {
            const el = new MockElement('DIV');
            el.id = `chat${id}`;
            this.containers.set(id, el);
        }
        return this.containers.get(id);
    }
    clearContainer(c: any) { c.innerHTML = ''; c.children = []; }
    createIframe(c: any, url: string) {
        const iframe = new MockElement('IFRAME');
        iframe.src = url;
        c.appendChild(iframe);
        return iframe as any;
    }
    createPopoutWindow() { return null; }
    createSeparatedDiv(id: number, content: string) {
        const el = new MockElement('DIV');
        el.innerHTML = content;
        return el as any;
    }
    removeElement(id: string) { /* Mock */ }
    showError(c: any, msg: string, link: boolean) { c.innerHTML = msg; }
    toggleVisibility(id: number, v: boolean) {
        const c = this.getContainer(id);
        if (v) c.classList.remove('hidden'); else c.classList.add('hidden');
    }
    setupResizer() { }
}

// Mock Global Window/Document for UrlBuilder
(global as any).window = {
    location: { hostname: 'localhost', protocol: 'http:' },
    innerWidth: 1024,
    innerHeight: 768
};
(global as any).document = {
    body: new MockElement('BODY'),
    getElementById: () => null,
    createElement: (tag: string) => new MockElement(tag.toUpperCase())
};

// --- Test Suite ---

async function runTests() {
    console.log('Starting verify_chat.ts (Node Mock)...');
    let passed = 0;

    // Setup
    const mockAdapter = new MockDomAdapter();
    const watchdog = new YouTubeChatWatchdog(mockAdapter);

    // Reduce timeouts for testing
    (watchdog as any).loadTimeoutMs = 50;
    (watchdog as any).baseBackoffMs = 10;

    const manager = new ChatManager(mockAdapter, undefined, watchdog);

    // Track events
    const recoveries: RecoveryStrategy[] = [];
    const giveUps: string[] = [];
    watchdog.onRecovering(s => recoveries.push(s));
    watchdog.onGiveUp(r => giveUps.push(r));

    // Test 1: Create Twitch Chat (No Watchdog)
    console.log('\n--- Test 1: Twitch Chat ---');
    manager.createChat(1, 'twitch', 'test_channel', '');
    const container1 = mockAdapter.getContainer(1);
    const iframe1 = container1.children[0];

    assert.ok(iframe1, 'Iframe created');
    assert.ok(iframe1.src.includes('twitch.tv/embed/test_channel'), 'Twitch URL correct');
    // Twitch should NOT have watchdog attached (check internal map if possible, or inference)
    assert.equal((watchdog as any).activeMonitors.size, 0, 'Watchdog should ignore Twitch');
    console.log('[PASS] Twitch creation correct');
    passed++;

    // Test 2: Create YouTube Chat (With Watchdog) & Success Flow
    console.log('\n--- Test 2: YouTube Success ---');
    manager.createChat(2, 'youtube', '', 'test_video');
    const container2 = mockAdapter.getContainer(2);
    const iframe2 = container2.children[0];

    assert.ok(iframe2.src.includes('youtube.com/live_chat'), 'YouTube URL correct');
    assert.equal((watchdog as any).activeMonitors.size, 1, 'Watchdog monitoring YouTube');

    // Simulate Load Success
    iframe2.emit('load');

    // Wait a bit to ensure no timeout fired
    await new Promise(r => setTimeout(r, 60));
    assert.equal(recoveries.length, 0, 'No recovery needed on success');
    console.log('[PASS] YouTube success flow');
    passed++;

    // Test 3: YouTube Timeout & Recovery
    console.log('\n--- Test 3: YouTube Recovery Flow ---');
    manager.createChat(3, 'youtube', '', 'fail_video');
    const container3 = mockAdapter.getContainer(3);
    const iframe3 = container3.children[0];

    // Helper
    const waitFor = async (fn: () => boolean, timeout = 1000) => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (fn()) return;
            await new Promise(r => setTimeout(r, 10));
        }
        throw new Error('Timeout waiting for condition');
    };

    // Wait for 1st recovery signal
    await waitFor(() => recoveries.length >= 1);

    // Wait for Side Effect (Src Change)
    // The recovery action is delayed by backoff (10ms)
    await waitFor(() => {
        const frame = container3.querySelector('iframe');
        return frame && frame.src.includes('t_bust');
    });

    assert.equal(recoveries[0].type, 'reload', 'First strategy should be reload');

    // Wait for 2nd recovery signal
    await waitFor(() => recoveries.length >= 2);

    // Wait for Level 2 Side Effect (Rebuild)
    // Old iframe3 should be removed or new one created.
    // We can check if iframe3 is no longer connected OR strict equality check on child
    await waitFor(() => {
        const frame = container3.querySelector('iframe');
        return frame && frame !== iframe3;
    });

    // const newIframe = container3.children[0]; // Logic check
    assert.equal(recoveries[1].type, 'rebuild', 'Second strategy should be rebuild');

    // Wait for 3rd recovery signal
    await waitFor(() => recoveries.length >= 3);

    // Wait for Give Up
    await waitFor(() => giveUps.length >= 1);

    console.log(`Recoveries triggered: ${recoveries.length}`);
    console.log('[PASS] Recovery flow triggered');
    passed++;

    // Test 4: Give Up UI
    console.log('\n--- Test 4: Give Up UI ---');
    // Check if UI updated
    await waitFor(() => container3.innerHTML.includes('無法載入'));

    assert.ok(container3.innerHTML.includes('無法載入'), 'Fallback UI showed');
    console.log('[PASS] Give up UI correct');
    passed++;

    console.log(`\nVerified ${passed}/4 Scenarios.`);
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
