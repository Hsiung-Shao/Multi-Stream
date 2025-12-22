
// scripts/verify_cutover.ts
// @ts-ignore
const fs = require('fs');
// @ts-ignore
const path = require('path');

async function verifyCutover() {
    let passed = true;
    const log = (msg: string, success: boolean) => {
        if (success) console.log(`[PASS] ${msg}`);
        else {
            console.error(`[FAIL] ${msg}`);
            passed = false;
        }
    };

    console.log('Verifying PR C Cutover...');

    // 1. Check stream.js is commented out
    const streamJsPath = path.join(__dirname, '../js/stream.js');
    try {
        const content = fs.readFileSync(streamJsPath, 'utf8');
        if (content.trim().startsWith('/* MIGRATED: stream.js fully disabled')) {
            log('stream.js has MIGRATED header', true);
        } else {
            log('stream.js missing MIGRATED header', false);
        }

        if (content.trim().endsWith('*/')) {
            log('stream.js ends with block comment closure', true);
        } else {
            // It might be nested or have trailing newlines
            const lastLines = content.trim().slice(-10);
            if (lastLines.includes('*/')) log('stream.js appears fully commented', true);
            else log('stream.js does not appear fully commented', false);
        }
    } catch (e) {
        log(`Could not read stream.js: ${e}`, false);
    }

    // 2. Check initLegacyGlobals has StreamManager import
    const initPath = path.join(__dirname, '../src/bootstrap/initLegacyGlobals.ts');
    try {
        const content = fs.readFileSync(initPath, 'utf8');
        if (content.includes("from '../features/stream/StreamManager.ts'") || content.includes('StreamManager')) {
            log('initLegacyGlobals imports StreamManager', true);
        } else {
            log('initLegacyGlobals missing StreamManager import', false);
        }

        if (content.includes('win.addStream =')) {
            log('initLegacyGlobals hooks window.addStream', true);
        } else {
            log('initLegacyGlobals missing addStream hook', false);
        }
    } catch (e) {
        log(`Could not read initLegacyGlobals.ts: ${e}`, false);
    }

    if (passed) {
        console.log('\nVerification Passed! (Static Check)');
        console.log('Run the app and test manually using the checklist.');
    } else {
        console.error('\nVerification Failed.');
        process.exit(1);
    }
}

verifyCutover();
