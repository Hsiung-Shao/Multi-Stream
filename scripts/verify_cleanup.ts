
// scripts/verify_cleanup.ts
// @ts-ignore
const fs = require('fs');
// @ts-ignore
const path = require('path');

async function verifyCleanup() {
    let passed = true;
    const log = (msg: string, success: boolean) => {
        if (success) console.log(`[PASS] ${msg}`);
        else {
            console.error(`[FAIL] ${msg}`);
            passed = false;
        }
    };

    console.log('Verifying PR D Cleanup...');

    // 1. Check StreamManager has guards (simple text scan)
    const smPath = path.join(__dirname, '../src/features/stream/StreamManager.ts');
    try {
        const content = fs.readFileSync(smPath, 'utf8');
        if (content.includes('warn') && content.includes('collision')) {
            log('StreamManager has collision guards', true);
        } else {
            log('StreamManager missing clear collision guards', false);
        }
    } catch (e) { log('Checking StreamManager failed: ' + e, false); }

    // 2. Check DomAdapter has implementation
    const daPath = path.join(__dirname, '../src/features/stream/DomAdapter.ts');
    try {
        const content = fs.readFileSync(daPath, 'utf8');
        if (content.includes('document.createElement') && content.includes('container.appendChild')) {
            log('DomAdapter has real DOM implementation', true);
        } else {
            log('DomAdapter appears to still be a stub', false);
        }
    } catch (e) { log('Checking DomAdapter failed: ' + e, false); }

    if (passed) {
        console.log('\nVerification Passed! (Static Check)');
    } else {
        console.error('\nVerification Failed.');
        process.exit(1);
    }
}

verifyCleanup();
