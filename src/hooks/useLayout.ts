import { useState, useEffect, useCallback, useRef } from 'react';
import { LayoutType, autoSelectLayout, isLayoutOverCapacity } from '../utils/layoutUtils';

/**
 * 布局管理 Hook
 * 管理當前布局類型、用戶選擇的布局，以及自動布局邏輯
 * 
 * 邏輯規則：
 * 1. 進入網頁後加入第一個串流開始自動調整布局，直到用戶選擇了特定布局
 * 2. 關閉串流 -> 呼叫自動布局（但只有在沒有用戶選擇時）
 * 3. 在用戶選擇布局前 -> 自動布局
 * 4. 串流數量達到選擇的布局上限時 -> 自動布局
 * 5. 用戶選擇布局 -> 根據布局調整並維持（除非超過容量）
 */
export function useLayout(streamCount: number) {
  const [selectedLayout, setSelectedLayout] = useState<LayoutType | null>(null);
  const [userSelectedLayout, setUserSelectedLayout] = useState<LayoutType | null>(null);
  const previousStreamCountRef = useRef<number>(0);

  // 從 localStorage 恢復布局設置
  useEffect(() => {
    const savedLayout = localStorage.getItem('currentLayout');
    if (savedLayout) {
      const layout = parseInt(savedLayout) as LayoutType;
      if ([1, 2, 3, 4, 5, 6, 9].includes(layout)) {
        setUserSelectedLayout(layout);
        setSelectedLayout(layout);
      }
    }
  }, []);

  // 處理布局邏輯
  useEffect(() => {
    // 如果沒有串流，不處理布局
    if (streamCount === 0) {
      previousStreamCountRef.current = 0;
      return;
    }

    // 情況1: 用戶已選擇布局
    if (userSelectedLayout !== null) {
      // 檢查是否超過容量
      if (isLayoutOverCapacity(userSelectedLayout, streamCount)) {
        // 超過容量，自動切換到合適的布局
        const autoLayout = autoSelectLayout(streamCount);
        setSelectedLayout(autoLayout);
        // 清除用戶選擇，因為當前布局已不適用
        setUserSelectedLayout(null);
        localStorage.removeItem('currentLayout');
      } else {
        // 在容量內，維持用戶選擇的布局
        setSelectedLayout(userSelectedLayout);
      }
    } 
    // 情況2: 用戶未選擇布局，或串流數量變化（添加或移除）
    else {
      // 自動選擇布局
      const autoLayout = autoSelectLayout(streamCount);
      setSelectedLayout(autoLayout);
    }

    previousStreamCountRef.current = streamCount;
  }, [streamCount, userSelectedLayout]);

  // 用戶手動選擇布局
  const handleLayoutChange = useCallback((layoutType: LayoutType, isUserSelection: boolean = true) => {
    if (isUserSelection) {
      // 用戶明確選擇布局
      setUserSelectedLayout(layoutType);
      setSelectedLayout(layoutType);
      localStorage.setItem('currentLayout', String(layoutType));
    } else {
      // 系統自動選擇（不保存為用戶選擇）
      setSelectedLayout(layoutType);
    }
  }, []);

  // 獲取當前有效的布局類型
  const currentLayout = selectedLayout || (streamCount > 0 ? autoSelectLayout(streamCount) : 1);

  return {
    currentLayout,
    selectedLayout,
    userSelectedLayout,
    setLayout: handleLayoutChange
  };
}

