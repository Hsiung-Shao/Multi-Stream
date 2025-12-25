// @ts-nocheck
/**
 * Verify Script for PR B (Security + Utils)
 * Usage: npx ts-node --compiler-options '{"module":"commonjs"}' src/utils/verify_security_utils.ts
 */

// Simple Mock for Window/Document
if (typeof global.window === 'undefined') {
    global.window = {
        location: {
            hostname: 'localhost',
            protocol: 'http:',
            port: '8080'
        }
    };
    global.document = {};
}

// Ensure explicit mocks for compatibility if needed
// const { safeJSONParse } = require('./security/safeJson');
// Note: ts-node handles the resolution of .ts files when using require if configured correctly.

const safeJson = require('./security/safeJson');
const html = require('./security/html');
const validators = require('./security/validators');
const url = require('./common/url');
const state = require('./common/state');

const safeJSONParse = safeJson.safeJSONParse;
const escapeHtml = html.escapeHtml;
const validateChannelId = validators.validateChannelId;
const validateVideoId = validators.validateVideoId;
const getParentDomain = url.getParentDomain;
const getTwitchParents = url.getTwitchParents;
const GlobalState = state.GlobalState;
const getIsDraggingStreamBox = state.getIsDraggingStreamBox;
const setIsDraggingStreamBox = state.setIsDraggingStreamBox;

console.log("=== Verification Start: Security & Utils ===");

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
    if (condition) {
        // console.log(`PASS: ${message}`);
        passCount++;
    } else {
        console.error(`FAIL: ${message}`);
        failCount++;
    }
}

function assertEq(actual, expected, message) {
    if (actual === expected || JSON.stringify(actual) === JSON.stringify(expected)) {
        // console.log(`PASS: ${message}`);
        passCount++;
    } else {
        console.error(`FAIL: ${message}. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        failCount++;
    }
}

// 1. safeJSONParse Tests
console.log("\n--- Testing safeJSONParse ---");
assertEq(safeJSONParse('{"a":1}', null), { a: 1 }, "Valid JSON should parse");
assertEq(safeJSONParse('invalid', 'default'), 'default', "Invalid JSON should return default");
assertEq(safeJSONParse(null, 'default'), 'default', "Null input should return default");
assertEq(safeJSONParse(undefined, 'default'), 'default', "Undefined input should return default");
assertEq(safeJSONParse('', 'default'), 'default', "Empty string returns default");
assertEq(safeJSONParse('123', null), 123, "Number string is valid JSON");
assertEq(safeJSONParse('[1,2]', []), [1, 2], "Array string is valid JSON");

// 2. escapeHtml Tests
console.log("\n--- Testing escapeHtml ---");
assertEq(escapeHtml('<script>'), '&lt;script&gt;', "Tags should be escaped");
assertEq(escapeHtml('"quoted"'), '&quot;quoted&quot;', "Double quotes should be escaped");
assertEq(escapeHtml("'single'"), '&#39;single&#39;', "Single quotes should be escaped");
assertEq(escapeHtml('A & B'), 'A &amp; B', "Ampersand should be escaped");
assertEq(escapeHtml(null), '', "Null should return empty string");
assertEq(escapeHtml(undefined), '', "Undefined should return empty string");
assertEq(escapeHtml(123), '123', "Number should be converted to string");

// 3. Validator Tests
console.log("\n--- Testing Validators ---");
// Channel ID
assertEq(validateChannelId('valid_ID-123'), true, "Valid Channel ID");
assertEq(validateChannelId('invalid space'), false, "Channel ID with space is invalid");
assertEq(validateChannelId(''), false, "Empty Channel ID is invalid");
assertEq(validateChannelId('<script>'), false, "Injected tags in ID key are invalid");
assertEq(validateChannelId(null), false, "Null Channel ID is invalid");

// Video ID
assertEq(validateVideoId('video_ID-123'), true, "Valid Video ID");
assertEq(validateVideoId('invalid/path'), false, "Slash in Video ID is invalid");
assertEq(validateVideoId(''), false, "Empty Video ID is invalid");

// 4. Utils Tests (URL & State)
console.log("\n--- Testing Utils ---");

// Test State
assertEq(GlobalState.isDraggingStreamBox, false, "Initial drag state should be false");
assertEq(getIsDraggingStreamBox(), false, "Getter should return false");
setIsDraggingStreamBox(true);
assertEq(GlobalState.isDraggingStreamBox, true, "State update reflected");
assertEq(getIsDraggingStreamBox(), true, "Getter reflects update");
GlobalState.isDraggingStreamBox = false; // Reset

// Test getParentDomain (Mock Environment)
assertEq(getParentDomain(), 'localhost', "Default mock should be localhost");

// Mock file://
global.window.location.protocol = 'file:';
global.window.location.hostname = '';
assertEq(getParentDomain(), 'localhost', "file:// protocol should return localhost");

// Mock standard domain
global.window.location.protocol = 'https:';
global.window.location.hostname = 'example.com';
assertEq(getParentDomain(), 'example.com', "Standard domain should return hostname");

// Test getTwitchParents
assertEq(getTwitchParents(), ['example.com'], "Twitch parents for domain");
global.window.location.hostname = 'localhost';
assertEq(getTwitchParents(), ['localhost'], "Twitch parents for localhost");

console.log(`\n=== Verification Complete ===`);
console.log(`Total Pass: ${passCount}`);
console.log(`Total Fail: ${failCount}`);

if (failCount > 0) {
    console.error("FAILED");
    process.exit(1);
} else {
    console.log("SUCCESS");
}
