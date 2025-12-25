const fs = require('fs');
const path = require('path');

const TARGET_FILE = path.join(__dirname, '../index.html');

// List of legacy scripts to disable
const LEGACY_SCRIPTS = [
    'js/utils.js',
    'js/security.js',
    'js/main.js',
    'js/settings.js',
    'js/twitch-api.js',
    'js/chat.js',
    'js/volume.js',
    'js/control-panel.js',
    'js/promotion.js',
    'js/ms-identity-ga4.js',
    'config.js'
];

function detectAndDisableLegacy() {
    if (!fs.existsSync(TARGET_FILE)) {
        console.error('❌ Error: index.html not found at', TARGET_FILE);
        process.exit(1);
    }

    let content = fs.readFileSync(TARGET_FILE, 'utf8');
    let hasChanges = false;
    let disabledCount = 0;

    console.log('🔍 Scanning index.html for legacy scripts...');

    LEGACY_SCRIPTS.forEach(script => {
        // Regex to match active script tags pointing to the legacy file
        // Handles optional "defer", "async", and different quote styles
        // Matches: <script ... src="/js/file.js" ...></script>
        // Note: We escape the dot in .js

        // Pattern explanation:
        // <script           : Start of tag
        // [^>]*             : Any attributes (non-greedy)
        // src=["']/?        : src attribute start, optional leading slash
        // ${script}         : The legacy filename
        // ["']              : End of src attribute
        // [^>]*>            : Rest of opening tag
        // \s*               : Optional whitespace
        // <\/script>        : Closing tag
        const pattern = new RegExp(`<script[^>]*src=["']\/?${script.replace('.', '\\.')}["'][^>]*>\\s*<\\/script>`, 'gi');

        if (pattern.test(content)) {
            // Replace with commented out version, BUT check if already commented
            content = content.replace(pattern, (match, offset, string) => {
                // Check 10 chars before and after for comment markers
                const before = string.slice(Math.max(0, offset - 10), offset);
                const after = string.slice(offset + match.length, offset + match.length + 10);

                // If surrounded by <!-- and -->, skip
                if (/<!--\s*$/.test(before) && /^\s*-->/.test(after)) {
                    // console.log(`ℹ️  Script ${script} is already commented out.`);
                    return match;
                }

                console.log(`⚠️  Found active legacy script: ${script}`);
                hasChanges = true;
                disabledCount++;
                return `<!-- ${match} -->`;
            });
        }
    });

    if (hasChanges) {
        fs.writeFileSync(TARGET_FILE, content, 'utf8');
        console.log(`✅ Automatically disabled ${disabledCount} legacy script(s).`);
        console.log(`✅ Updated index.html`);
    } else {
        console.log('✨ No active legacy scripts found. System is clean.');
    }
}

detectAndDisableLegacy();
