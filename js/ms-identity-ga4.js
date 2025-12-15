/**
 * MultiStream Hub - UUID Identity (Final)
 *
 * Baseline restore rule (as you described):
 * 1) If localStorage has ANY data => skip restore.
 * 2) If localStorage has NO data => check IndexedDB backup:
 *    - if exists => restore
 *    - else => do nothing
 *
 * This script:
 * - Ensures ms_user_uuid always exists (create if missing)
 * - Optionally calls your existing restore flow ONLY when localStorage is empty
 * - Pushes identity to dataLayer for GTM (Scheme A)
 *
 * Safe: does NOT modify your existing IndexedDB schema.
 */
(() => {
    'use strict';
  
    // ====== Config ======
    const CFG = {
      UUID_LS_KEY: 'ms_user_uuid',
  
      // DataLayer / GTM
      DL_EVENT: 'ms_identity_ready',
      DL_USER_KEY: 'ms_user_id',
      DL_APP_KEY: 'ms_app',
      APP_VALUE: 'multistream_hub',
  
      /**
       * Hooks to your existing backup/restore implementation.
       * If you already restore elsewhere (e.g. on app boot), set both to null.
       *
       * Option A (recommended): provide functions on window, e.g.
       *   window.__MS_LOAD_BACKUP__ = async () => {... return backupObjOrNull }
       *   window.__MS_RESTORE_BACKUP__ = (backupObj) => {... writes to localStorage }
       */
      LOAD_BACKUP_FN: '__MS_LOAD_BACKUP__',
      RESTORE_FN: '__MS_RESTORE_BACKUP__',
  
      // Optional: if you want to also embed uuid into your backup payload at save time
      // do it in your backup module (recommended). This script focuses on identity bootstrap.
    };
  
    // ====== Utilities ======
    function hasAnyLocalStorageData() {
      try {
        return localStorage.length > 0;
      } catch {
        return false;
      }
    }
  
    function getUUID() {
      try {
        return localStorage.getItem(CFG.UUID_LS_KEY);
      } catch {
        return null;
      }
    }
  
    function setUUID(uuid) {
      try {
        localStorage.setItem(CFG.UUID_LS_KEY, uuid);
        return true;
      } catch {
        return false;
      }
    }
  
    function safeRandomUUID() {
      if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  
      // Fallback RFC4122 v4-like
      const bytes = globalThis.crypto?.getRandomValues
        ? crypto.getRandomValues(new Uint8Array(16))
        : Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
  
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  
    function pushIdentityToDataLayer(uuid) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: CFG.DL_EVENT,
        [CFG.DL_USER_KEY]: uuid,
        [CFG.DL_APP_KEY]: CFG.APP_VALUE,
      });
  
      // For debugging (safe)
      window.__MS_USER_UUID__ = uuid;
    }
  
    async function maybeRestoreWhenLSIsEmpty() {
      // Your baseline: only restore if localStorage is empty
      if (hasAnyLocalStorageData()) return;
  
      const loadFn = CFG.LOAD_BACKUP_FN ? window[CFG.LOAD_BACKUP_FN] : null;
      const restoreFn = CFG.RESTORE_FN ? window[CFG.RESTORE_FN] : null;
  
      // If hooks not provided, we respect your app boot and do nothing here.
      if (typeof loadFn !== 'function' || typeof restoreFn !== 'function') return;
  
      const backup = await loadFn();
      if (backup) {
        restoreFn(backup);
      }
    }
  
    async function boot() {
      // 1) Respect your baseline restore rule
      await maybeRestoreWhenLSIsEmpty();
  
      // 2) Ensure UUID exists (do NOT depend on restore success)
      let uuid = getUUID();
      if (!uuid) {
        uuid = safeRandomUUID();
        setUUID(uuid);
      }
  
      // 3) Push to dataLayer for GTM
      pushIdentityToDataLayer(uuid);
    }
  
    // Run ASAP but stable
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
      boot();
    }
  })();
  