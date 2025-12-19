/**
 * Verification Script for Analytics (IdentityManager)
 * Run with: npx tsx verify_analytics.ts
 */

import { IdentityManager } from './src/features/analytics/IdentityManager';

// --- Mocks ---
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => { store[key] = value.toString(); },
        clear: () => { store = {}; },
        get length() { return Object.keys(store).length; },
        // Test helper
        _dump: () => store
    };
})();

const windowMock = {
    dataLayer: [] as any[],
    __MS_USER_UUID__: undefined as string | undefined,
    __MS_LOAD_BACKUP__: undefined as (() => Promise<any>) | undefined,
    __MS_RESTORE_BACKUP__: undefined as ((backup: any) => void) | undefined,
};

const cryptoMock = {
    randomUUID: () => '11111111-2222-4444-8888-ffffffffffff', // Deterministic for test
    getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
        return arr;
    }
};

// Setup Global Environment
(global as any).localStorage = localStorageMock;
(global as any).window = windowMock;
(global as any).globalThis = { crypto: cryptoMock } as any;

// --- Test Runner ---
async function runTests() {
    console.log('Starting Verification: verify_analytics.ts');
    let passed = 0;
    let failed = 0;

    function assert(condition: boolean, msg: string) {
        if (condition) {
            console.log(`[PASS] ${msg}`);
            passed++;
        } else {
            console.error(`[FAIL] ${msg}`);
            failed++;
            process.exitCode = 1;
        }
    }

    // TEST 1: Fresh Init (Generate UUID)
    console.log('\n--- Case 1: Fresh Init ---');
    localStorageMock.clear();
    windowMock.dataLayer = [];
    windowMock.__MS_USER_UUID__ = undefined;

    const manager1 = new IdentityManager();
    const res1 = await manager1.init();

    assert(res1.isNew === true, 'isNew should be true');
    assert(!!res1.uuid, 'UUID should be generated');
    assert(localStorageMock.getItem('ms_user_uuid') === res1.uuid, 'UUID should be in localStorage');
    assert(windowMock.dataLayer.length === 1, 'DataLayer should have 1 event');
    assert(windowMock.dataLayer[0].event === 'ms_identity_ready', 'Event name should match');
    assert(windowMock.dataLayer[0].ms_user_id === res1.uuid, 'Event user_id should match');
    assert(windowMock.__MS_USER_UUID__ === res1.uuid, 'Global debug var set');


    // TEST 2: Existing UUID
    console.log('\n--- Case 2: Existing UUID ---');
    const existingUUID = '55555555-6666-4444-8888-000000000000';
    localStorageMock.setItem('ms_user_uuid', existingUUID);
    windowMock.dataLayer = [];

    const manager2 = new IdentityManager();
    const res2 = await manager2.init();

    assert(res2.isNew === false, 'isNew should be false');
    assert(res2.uuid === existingUUID, 'UUID should match existing');
    assert(windowMock.dataLayer.length === 1, 'DataLayer should have 1 event');
    assert(windowMock.dataLayer[0].ms_user_id === existingUUID, 'Event should use existing UUID');


    // TEST 3: DataLayer missing (Graceful degradation)
    console.log('\n--- Case 3: Missing DataLayer ---');
    // Need to trick the manager, since it inits DL if missing. 
    // We simulate "window exists but dataLayer is undefined initially" - Manager should create it.
    (window as any).dataLayer = undefined;

    const manager3 = new IdentityManager();
    await manager3.init();

    assert(Array.isArray((window as any).dataLayer), 'Manager should init dataLayer if missing');
    assert((window as any).dataLayer.length === 1, 'Should push event after initing DL');


    // TEST 4: Restore Hook
    console.log('\n--- Case 4: Restore Hook ---');
    localStorageMock.clear();
    let restoreCalled = false;
    windowMock.__MS_LOAD_BACKUP__ = async () => ({ some: 'data' });
    windowMock.__MS_RESTORE_BACKUP__ = (data) => { if (data.some === 'data') restoreCalled = true; };

    const manager4 = new IdentityManager();
    const res4 = await manager4.init();

    assert(res4.restoredFromBackup === true, 'restoredFromBackup should be true');
    assert(restoreCalled === true, 'restore func should be called');


    // Summary
    console.log(`\nVerification Complete: ${passed} Passed, ${failed} Failed`);
    if (failed > 0) process.exit(1);
}

runTests().catch(e => {
    console.error('Test Runner Crashed:', e);
    process.exit(1);
});
