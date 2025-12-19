# Analytics Migration Analysis (PR A)

## 1. Scope / Non-Goals
**In Scope**:
*   Porting UUID generation and management logic from `js/ms-identity-ga4.js` to TypeScript.
*   Porting GTM DataLayer push logic.
*   Preserving "restore backup if LS empty" hooks behavior.

**Non-Goals**:
*   Modifying `index.html` script tags or order.
*   Changing definitions of "what is a backup" (this module only blindly calls the hooks).
*   Implementing the `__MS_LOAD_BACKUP__` functions themselves (these are expected to be provided by other modules or bridge).

## 2. Current Behavior
The legacy script (`js/ms-identity-ga4.js`) is an IIFE that runs immediately upon loading (or at `DOMContentLoaded` if `document.readyState` is loading).

*   **Logic Flow**:
    1.  **Check Restore**: If `localStorage` is empty (`length === 0`), it looks for global hook `window.__MS_LOAD_BACKUP__`. If found, it awaits it and calls `window.__MS_RESTORE_BACKUP__`.
    2.  **Get/Create UUID**: Checks `localStorage.getItem('ms_user_uuid')`. If missing, generates a random UUID (using `crypto.randomUUID` or fallback) and saves it.
    3.  **Push DataLayer**: Pushes `{ event: 'ms_identity_ready', ms_user_id: UUID, ms_app: 'multistream_hub' }` to `window.dataLayer`.
    4.  **Debug Global**: Sets `window.__MS_USER_UUID__ = uuid`.

## 3. Public Contract
This module does not expose a callable API to other JS modules (it is self-executing). Its "Public Contract" is defined by its side effects.

*   **Storage Keys**:
    *   `ms_user_uuid`: String (UUID v4 format).
*   **DataLayer Events**:
    *   Event Name: `ms_identity_ready`
    *   Payload:
        *   `ms_user_id`: String (The UUID)
        *   `ms_app`: String (`'multistream_hub'`)
*   **External Dependencies (Hooks)**:
    *   `window.__MS_LOAD_BACKUP__`: Function returning Promise<BackupObject | null>.
    *   `window.__MS_RESTORE_BACKUP__`: Function accepting BackupObject.

## 4. Side Effects & Risks
*   **Immediate Execution**: The legacy script runs as soon as it parses (if body loaded) or on DOMContentLoaded.
    *   *Risk*: The new bridge must accept that it might run *after* legacy code if we are not careful during the transition period. However, our migration strategy ensures legacy code is commented out, so the Bridge becomes the *only* executor.
*   **LocalStorage Write**: Writes to LS on every boot if UUID is missing.
*   **DataLayer Push**: Pushes to global array.
    *   *Risk*: Multiple pushes if both systems run (we will use this for verification, then cut over).

## 5. Verification Plan (PR B & C)
The `verify_analytics.ts` script should validate:
1.  **UUID Generation**: Can generate a valid UUID v4 if LS is empty.
2.  **Persistence**: Reads existing UUID from LS if present.
3.  **DataLayer**: Mock `window.dataLayer` and verify the correct object is pushed.
4.  **Hooks Interaction**: Mock `window.__MS_LOAD_BACKUP__` and verify it is called when LS is empty.
5.  **No-Op**: Verify it does *not* call restore hooks if LS is not empty.
