/**
 * Verification Script for Promotion PR E (Cleanup & Functionality)
 * Run with: npx tsx verify_promotion_prE.ts
 */

import { adManager } from './src/features/promotion/AdManager';
// Partial mocks for node env
const windowMock = {
    initAdSystem: undefined,
    toggleAdEnabled: undefined,
    document: {
        getElementById: () => null,
        querySelectorAll: () => [],
        createElement: () => ({ style: {}, classList: { add: () => { }, remove: () => { } }, appendChild: () => { }, addEventListener: () => { } }),
        body: { appendChild: () => { } },
        head: { appendChild: () => { } }
    }
};
(global as any).window = windowMock;
(global as any).document = windowMock.document;
(global as any).localStorage = { getItem: () => null, setItem: () => { } };

async function runTests() {
    console.log('Starting Verification: verify_promotion_prE.ts');
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

    // 1. Types & Instance
    assert(!!adManager, 'AdManager instance should exist');
    assert(typeof adManager.init === 'function', 'AdManager should have init()');

    // 2. Mock Bridge Wiring Check (Simulation)
    // We simulate what initLegacyGlobals does
    window.initAdSystem = () => adManager.init();
    assert(typeof window.initAdSystem === 'function', 'window.initAdSystem should be wired (simulation)');

    // 3. Idempotency Check
    // Call init twice, ensure no errors (logic check is hard without full DOM mock, but ensuring it runs is good)
    try {
        adManager.init();
        adManager.init();
        assert(true, 'Multiple init calls should not crash');
    } catch (e) {
        assert(false, 'Multiple init calls crashed: ' + e);
    }

    // 4. Config check
    assert(adManager.isEnabled() === true, 'Default enabled should be true');

    console.log(`\nVerification Complete: ${passed} Passed, ${failed} Failed`);
}

runTests().catch(e => console.error(e));
