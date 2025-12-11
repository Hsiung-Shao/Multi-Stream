// 布局工具函數 - 將舊的 layout.js 邏輯轉換為 React 友好版本

export type LayoutType = 1 | 2 | 3 | 4 | 5 | 6 | 9;

export interface LayoutStyle {
  left: string;
  top: string;
  width: string;
  height: string;
  position?: 'absolute' | 'relative';
}

/**
 * 根據布局類型和索引計算每個串流的樣式
 */
export function calculateLayoutStyles(
  layoutType: LayoutType,
  index: number,
  totalCount: number
): LayoutStyle {
  const baseStyle: LayoutStyle = {
    left: '0',
    top: '0',
    width: '100%',
    height: '100%',
    position: 'absolute'
  };

  if (layoutType === 1 || totalCount === 1) {
    // 單一畫面
    return {
      ...baseStyle,
      left: '0',
      top: '0',
      width: '100%',
      height: '100%'
    };
  } else if (layoutType === 2) {
    // 左右分割
    return {
      ...baseStyle,
      width: `${100 / totalCount}%`,
      height: '100%',
      left: `${(100 / totalCount) * index}%`,
      top: '0'
    };
  } else if (layoutType === 3) {
    // 上下分割
    return {
      ...baseStyle,
      height: `${100 / totalCount}%`,
      width: '100%',
      top: `${(100 / totalCount) * index}%`,
      left: '0'
    };
  } else if (layoutType === 4) {
    // 四宮格
    const col = index % 2;
    const row = Math.floor(index / 2);
    return {
      ...baseStyle,
      width: '50%',
      height: '50%',
      left: `${col * 50}%`,
      top: `${row * 50}%`
    };
  } else if (layoutType === 5) {
    // 上大下三布局
    if (index === 0) {
      return {
        ...baseStyle,
        width: '100%',
        height: '75%',
        left: '0',
        top: '0'
      };
    } else if (index <= 3) {
      const bottomIndex = index - 1;
      return {
        ...baseStyle,
        width: '33.33%',
        height: '25%',
        left: `${bottomIndex * 33.33}%`,
        top: '75%'
      };
    } else {
      // 如果有多於 4 個串流，後續的串流也放在下方，繼續排列
      const bottomIndex = (index - 1) % 3;
      const row = Math.floor((index - 1) / 3);
      return {
        ...baseStyle,
        width: '33.33%',
        height: '25%',
        left: `${bottomIndex * 33.33}%`,
        top: `${75 + row * 25}%`
      };
    }
  } else if (layoutType === 6) {
    // 2×3 網格
    const cols = 3;
    const rows = Math.ceil(totalCount / cols);
    const col = index % cols;
    const row = Math.floor(index / cols);
    return {
      ...baseStyle,
      width: `${100 / cols}%`,
      height: `${100 / rows}%`,
      left: `${(100 / cols) * col}%`,
      top: `${(100 / rows) * row}%`
    };
  } else if (layoutType === 9) {
    // 3×3 網格
    const cols = 3;
    const rows = Math.ceil(totalCount / cols);
    const col = index % cols;
    const row = Math.floor(index / cols);
    return {
      ...baseStyle,
      width: `${100 / cols}%`,
      height: `${100 / rows}%`,
      left: `${(100 / cols) * col}%`,
      top: `${(100 / rows) * row}%`
    };
  }

  return baseStyle;
}

/**
 * 獲取布局的最大容量（能顯示多少個串流）
 */
export function getLayoutCapacity(layoutType: LayoutType): number {
  switch (layoutType) {
    case 1:
      return 1; // 單一畫面只能顯示1個
    case 2:
    case 3:
      return Infinity; // 左右/上下分割可以無限擴展
    case 4:
      return 4; // 四宮格最多4個
    case 5:
      return Infinity; // 上大下三可以無限擴展（下方會繼續排列）
    case 6:
      return Infinity; // 2×3 網格可以無限擴展
    case 9:
      return Infinity; // 3×3 網格可以無限擴展
    default:
      return 1;
  }
}

/**
 * 檢查串流數量是否超過布局容量
 */
export function isLayoutOverCapacity(layoutType: LayoutType, streamCount: number): boolean {
  const capacity = getLayoutCapacity(layoutType);
  if (capacity === Infinity) {
    return false; // 無限容量，永遠不會超過
  }
  return streamCount > capacity;
}

/**
 * 根據串流數量和視窗大小自動選擇最適合的布局
 */
export function autoSelectLayout(count: number): LayoutType {
  if (count === 0) return 1;
  
  const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;
  const aspectRatio = windowWidth / windowHeight;
  
  if (count === 1) {
    return 1; // 單一畫面
  } else if (count === 2) {
    return aspectRatio > 1.2 ? 2 : 3; // 寬螢幕用左右，高螢幕用上下
  } else if (count === 3) {
    return aspectRatio > 1.3 ? 2 : 3;
  } else if (count === 4) {
    return 4; // 四宮格
  } else if (count <= 6) {
    return 6; // 2×3 網格
  } else if (count <= 9) {
    return 9; // 3×3 網格
  } else {
    return 9; // 超過9個也使用3×3網格
  }
}

/**
 * 調整聊天室布局以適應整體布局
 */
export function adjustChatLayoutForLayoutType(
  layoutType: LayoutType,
  boxWidth: number
): {
  chatWidth: string;
  chatHeight: string;
  isHorizontal: boolean;
} {
  if (layoutType === 1 || layoutType === 2) {
    // 單一畫面或左右分割：聊天室在右側（水平排列）
    return {
      chatWidth: '300px',
      chatHeight: '100%',
      isHorizontal: true
    };
  } else if (layoutType === 3) {
    // 上下分割：聊天室在下方（垂直排列）
    return {
      chatWidth: '100%',
      chatHeight: '250px',
      isHorizontal: false
    };
  } else if (layoutType === 4) {
    // 四宮格：根據視窗寬度決定
    if (boxWidth > 600) {
      return {
        chatWidth: '250px',
        chatHeight: '100%',
        isHorizontal: true
      };
    } else {
      return {
        chatWidth: '100%',
        chatHeight: '200px',
        isHorizontal: false
      };
    }
  } else if (layoutType === 5) {
    // 上大下三布局
    if (boxWidth > 400) {
      return {
        chatWidth: '300px',
        chatHeight: '100%',
        isHorizontal: true
      };
    } else {
      return {
        chatWidth: '100%',
        chatHeight: '150px',
        isHorizontal: false
      };
    }
  } else if (layoutType === 6 || layoutType === 9) {
    // 網格布局：視窗很小，使用垂直排列
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;
    const chatHeight = Math.max(80, Math.min(150, viewportHeight * 0.12));
    return {
      chatWidth: '100%',
      chatHeight: `${chatHeight}px`,
      isHorizontal: false
    };
  }

  // 默認
  return {
    chatWidth: '300px',
    chatHeight: '100%',
    isHorizontal: true
  };
}

