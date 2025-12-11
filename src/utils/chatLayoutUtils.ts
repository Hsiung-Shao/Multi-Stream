// 聊天室布局工具函數

export type ChatLayoutType = 'none' | 'single' | 'dual' | 'quad';

export interface ChatLayoutConfig {
  type: ChatLayoutType;
  videoAreaWidth: number; // 視頻區域寬度百分比
  chatAreaWidth: number; // 聊天室區域寬度百分比
  grid: {
    rows: number;
    cols: number;
  };
  positionKeys: string[]; // 位置鍵，用於標識每個聊天室面板
}

export const CHAT_LAYOUT_CONFIGS: Record<ChatLayoutType, ChatLayoutConfig> = {
  none: {
    type: 'none',
    videoAreaWidth: 100,
    chatAreaWidth: 0,
    grid: { rows: 0, cols: 0 },
    positionKeys: []
  },
  single: {
    type: 'single',
    videoAreaWidth: 80,
    chatAreaWidth: 20,
    grid: { rows: 1, cols: 1 },
    positionKeys: ['position1']
  },
  dual: {
    type: 'dual',
    videoAreaWidth: 70,
    chatAreaWidth: 30,
    grid: { rows: 1, cols: 2 },
    positionKeys: ['position1', 'position2']
  },
  quad: {
    type: 'quad',
    videoAreaWidth: 70,
    chatAreaWidth: 30,
    grid: { rows: 2, cols: 2 },
    positionKeys: ['position1', 'position2', 'position3', 'position4']
  }
};

/**
 * 獲取聊天室布局配置
 */
export function getChatLayoutConfig(type: ChatLayoutType): ChatLayoutConfig {
  return CHAT_LAYOUT_CONFIGS[type] || CHAT_LAYOUT_CONFIGS.none;
}

