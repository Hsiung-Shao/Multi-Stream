
export * from './types';
export * from './DomAdapter';
export * from './ChatUrlBuilder';
export * from './YouTubeChatWatchdog';
export * from './ChatManager';

// Optional: Singleton instance for easier usage in bridge
import { ChatManager } from './ChatManager';
export const chatManager = new ChatManager();
// Note: This instantiation is safe as constructor is side-effect free (just internal wiring).
// It does not touch DOM or Network until methods are called.
