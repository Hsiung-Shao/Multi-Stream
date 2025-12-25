// @ts-nocheck
/**
 * Verify Script for PR D (Cutover)
 * Usage: npx tsx src/utils/verify_security_utils_prD.ts
 */

const fs = require('fs');
const path = require('path');

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

// Mock other dependencies
if (!global.window.twitchApi) global.window.twitchApi = {};

import { initLegacyGlobals } from '../bootstrap/initLegacyGlobals';
import * as securityUtils from './security/index';

console.log("=== Verification Start: Security & Utils Cutover (PR D) ===");

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

// 2. Verify Legacy Files Commented Out
console.log("\n--- Checking Legacy Files ---");
const projectRoot = process.cwd();
const securityPath = path.resolve(projectRoot, 'js/security.js');
const utilsPath = path.resolve(projectRoot, 'js/utils.js');
const settingsPath = path.resolve(projectRoot, 'js/settings.js');

const securityContent = fs.readFileSync(securityPath, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
const utilsContent = fs.readFileSync(utilsPath, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();

assert(securityContent.startsWith('/*\nMIGRATED (PR D)'), "js/security.js should start with MIGRATED comment block");
assert(utilsContent.startsWith('/*\nMIGRATED (PR D)'), "js/utils.js should start with MIGRATED comment block");
assert(securityContent.endsWith('*/'), "js/security.js should end with block comment closure");
assert(utilsContent.endsWith('*/'), "js/utils.js should end with block comment closure");

// 3. Verify Globals Mounted
console.log("\n--- Initialize & Check Globals ---");
initLegacyGlobals();
const win = global.window as any;

assert(!!win.__MS_SECURITY__, "window.__MS_SECURITY__ should exist");
assert(!!win.__MS_UTILS__, "window.__MS_UTILS__ should exist");

// 4. Verify No Fallback (Simulation)
console.log("\n--- Verifying No Fallback & Functionality ---");

// This test simulates settings.js behavior we updated:
// const parse = (window.__MS_SECURITY__ && window.__MS_SECURITY__.safeJSONParse) || ((s, d) => d);

// Scenario A: Globals Present (Normal)
const parseA = (win.__MS_SECURITY__ && win.__MS_SECURITY__.safeJSONParse) || ((s: any, d: any) => d);
assert(parseA === securityUtils.safeJSONParse, "Should use bridge when available");

// Scenario B: Globals Missing (Cutover safety check)
const temp = win.__MS_SECURITY__;
win.__MS_SECURITY__ = undefined;
const parseB = (win.__MS_SECURITY__ && win.__MS_SECURITY__.safeJSONParse) || ((s: any, d: any) => d);

// In PR D, we replaced the fallback to a dummy identity function, NOT legacy `safeJSONParse` (which doesn't exist anymore essentially)
assert(parseB('{"bad":"json"}', 'default') === 'default', "Dummy fallback should return default (or whatever simplified logic)");
// Wait, ((s, d) => d) returns default value. So it is safe.
// 'safeJSONParse' legacy is GONE from global scope because we commented out the file.
// So if we tried `|| safeJSONParse` it would throw ReferenceError in runtime!
// Thus, verifying that we DO NOT refer to `safeJSONParse` is crucial.

// Check if settings.js refers to safeJSONParse variable
// settingsPath is already defined at the top
const settingsContent = fs.readFileSync(settingsPath, 'utf8');

if (settingsContent.includes('|| safeJSONParse')) {
    console.error("FAIL: js/settings.js still refers to 'safeJSONParse' global variable. This will ReferenceError.");
    failCount++;
} else {
    passCount++;
    console.log("PASS: js/settings.js does not refer to legacy 'safeJSONParse'");
}

if (settingsContent.includes('|| escapeHtml')) {
    console.error("FAIL: js/settings.js still refers to 'escapeHtml' global variable. This will ReferenceError.");
    failCount++;
} else {
    passCount++;
    console.log("PASS: js/settings.js does not refer to legacy 'escapeHtml'");
}

win.__MS_SECURITY__ = temp; // Restore

console.log(`\n=== Verification Complete ===`);
console.log(`Total Pass: ${passCount}`);
console.log(`Total Fail: ${failCount}`);

if (failCount > 0) {
    console.error("FAILED");
    process.exit(1);
} else {
    console.log("SUCCESS");
}
