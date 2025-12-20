/**
 * [MIGRATED] Chat System
 * 
 * This file has been migrated to TypeScript modules in src/features/chat/*.
 * Public API is now exposed via src/bootstrap/initLegacyGlobals.ts
 * 
 * Legacy implementation must not be called anymore.
 * 
 * Migration Status:
 * - Manager: src/features/chat/ChatManager.ts
 * - Watchdog: src/features/chat/YouTubeChatWatchdog.ts
 * - Adapter: src/features/chat/DomAdapter.ts
 * - Builder: src/features/chat/ChatUrlBuilder.ts
 */

/*
// 聊天室功能
// ... (Legacy Code) ...
// 建立聊天室
function createChat(id, platform, channelId, videoId) {
  const chatDiv = document.getElementById('chat' + id);
  if (!chatDiv) {
    return;
  }
  
  const parentDomain = getParentDomain();
  // ...
  // Full file commented out as per strict cutover.
  // ...
}

// ... All legacy functions ...
*/

