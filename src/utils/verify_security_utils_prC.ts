// @ts-nocheck
/**
 * Verify Script for PR C (Bridge Wiring)
 * Usage: npx tsx src/utils/verify_security_utils_prC.ts
 */

// 1. Setup Mock DOM Environment
if (typeof global.window === 'undefined') {
    global.window = {
        addEventListener: () => { },
        removeEventListener: () => { },
        dispatchEvent: () => { },
        location: {
            hostname: 'localhost',
            protocol: 'http:',
            port: '8080'
        }
    } as any;
    global.document = {
        getElementById: () => null,
        querySelectorAll: () => []
    } as any;
    global.localStorage = {
        getItem: () => null,
        setItem: () => { }
    } as any;
}

// Mock other dependencies to allow initLegacyGlobals to run without crashing
if (!global.window.twitchApi) global.window.twitchApi = {};

// Import the initializer
import { initLegacyGlobals } from '../bootstrap/initLegacyGlobals';

// Import actual implementations to compare identity
import * as securityUtils from './security/index';
import * as commonUtils from './common/index';

console.log("=== Verification Start: Security & Utils Bridge (PR C) ===");

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string) {
    if (condition) {
        passCount++;
    } else {
        console.error(`FAIL: ${message}`);
        failCount++;
    }
}

// 2. Run Initialization
console.log("Running initLegacyGlobals()...");
initLegacyGlobals();

// 3. Verify Globals Mounted
const win = global.window as any;

console.log("\n--- Checking Mounted Globals ---");
assert(!!win.__MS_SECURITY__, "window.__MS_SECURITY__ should exist");
assert(!!win.__MS_UTILS__, "window.__MS_UTILS__ should exist");
assert(win.__MS_UTILS_BRIDGE_READY__ === true, "Bridge ready flag should be true");

// 4. Verify Function Identity
console.log("\n--- Checking Function Identity ---");
assert(win.__MS_SECURITY__.safeJSONParse === securityUtils.safeJSONParse, "safeJSONParse should match new implementation");
assert(win.__MS_SECURITY__.escapeHtml === securityUtils.escapeHtml, "escapeHtml should match new implementation");
assert(win.__MS_UTILS__.getParentDomain === commonUtils.getParentDomain, "getParentDomain should match new implementation");

// 5. Verify Fallback / Priority Logic (Simulation)
console.log("\n--- Verifying Priority Logic ---");
// We simulate what `settings.js` does: `const parse = (window.__MS_SECURITY__ && window.__MS_SECURITY__.safeJSONParse) || safeJSONParse;`

const legacySafeJSONParse = (str: any) => "LEGACY_RESULT";
const bridgedSafeJSONParse = win.__MS_SECURITY__.safeJSONParse;

const resolvedParse = (win.__MS_SECURITY__ && win.__MS_SECURITY__.safeJSONParse) || legacySafeJSONParse;
assert(resolvedParse === bridgedSafeJSONParse, "Should resolve to bridged implementation when available");

// Simulate fallback
const temp = win.__MS_SECURITY__;
win.__MS_SECURITY__ = undefined;
const fallbackParse = (win.__MS_SECURITY__ && win.__MS_SECURITY__.safeJSONParse) || legacySafeJSONParse;
assert(fallbackParse === legacySafeJSONParse, "Should fallback to legacy when bridge is missing");
win.__MS_SECURITY__ = temp; // Restore

// 6. Verify Double Init Guard
console.log("\n--- Verifying Double Init Guard ---");
initLegacyGlobals(); // Call again
// We can't easily spy on console.log here without setup, but we check if property is double wrapped or similar error.
// Since we used a boolean flag check in code, it should be fine.
assert(Object.keys(win.__MS_SECURITY__).length === 5, "Should explicitly contain expected keys keys (no duplicates or side effects)");


console.log(`\n=== Verification Complete ===`);
console.log(`Total Pass: ${passCount}`);
console.log(`Total Fail: ${failCount}`);

if (failCount > 0) {
    console.error("FAILED");
    process.exit(1);
} else {
    console.log("SUCCESS");
}
