---
name: i18n-consistency
description: Ensures translation keys are consistent across all supported locales.
---

# i18n Consistency Skill

Use this skill whenever you modify, add, or delete translation keys in the project. This ensures that `zh-TW` (Source of Truth) stays in sync with `zh-CN`, `en`, `ja`, and `ko`.

## 1. Context & Configuration

- **Source Language:** `zh-TW`
- **Target Languages:** `zh-CN`, `en`, `ja`, `ko`
- **Locales Directory:** `src/i18n/locales/`
- **Structure:** Files are separated by namespace (e.g., `common.ts`, `navbar.ts`).
- **Key Strategy:** The project typically uses flat keys (e.g., `'menu.title': '...'`) or object structure depending on the file. **Check existing patterns in the file.**
- **Important:** `src/i18n/i18n.ts` might have `keySeparator: false`. If so, nested keys won't work standardly; use flat dotted keys if the config demands it, or match the existing file structure exactly.

## 2. strict Workflow for i18n Changes

### Step 1: Analyze

Before editing, list all language files that need to be updated.

- If you add a key to `zh-TW/common.ts`, you **MUST** also update:
  - `zh-CN/common.ts`
  - `en/common.ts`
  - `ja/common.ts`
  - `ko/common.ts`

### Step 2: Implementation (Add/Update)

1. **Edit Source (`zh-TW`)**: Add the new key/value.
2. **Translate & Propagate**:
    - **zh-CN**: Convert traditional to simplified.
    - **en**: Translate to English.
    - **ja**: Translate to Japanese.
    - **ko**: Translate to Korean.
3. **Format Check**:
    - Ensure the key name is **IDENTICAL** across all files.
    - Preserve indentation and sorting if possible.

### Step 3: Verification (Crucial)

If you have made multiple changes, **DO NOT** rely on manual checking alone.

1. Create a temporary script (e.g., `scripts/verify-i18n-temp.js`) to compare keys.
2. The script should:
    - Read keys from `zh-TW` files.
    - Compare against all other locales.
    - Log any missing keys.
3. Run the script and fix any missing keys immediately.
4. Delete the script after verification.

## 3. Reference Script

Use this Node.js logic for verification if needed:

```javascript
const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '../src/i18n/locales');
const sourceLang = 'zh-TW';
const targetLangs = ['en', 'zh-CN', 'ja', 'ko'];

// Helper to extract keys (simple regex approach)
function extractKeys(filePath) {
    if (!fs.existsSync(filePath)) return new Set();
    const content = fs.readFileSync(filePath, 'utf-8');
    const keys = new Set();
    // Match 'key': or "key":
    const regex = /^\s*(['"])(.+?)\1\s*:/gm;
    let match;
    while ((match = regex.exec(content)) !== null) {
        keys.add(match[2]);
    }
    return keys;
}

// ... iteration logic to compare sourceKeys vs targetKeys ...
```
