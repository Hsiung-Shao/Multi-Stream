import { useState, useEffect, useCallback } from 'react';
import { LayoutType, autoSelectLayout } from '../utils/layoutUtils';

/**
 * 布局管理 Hook
 * 管理當前布局類型、用戶選擇的布局，以及自動布局邏輯
 */
export function useLayout(streamCount: number) {
  const [selectedLayout, setSelectedLayout] = useState<LayoutType | null>(null);
  const [userSelectedLayout, setUserSelectedLayout] = useState<LayoutType | null>(null);
  const [userLayoutTimeout, setUserLayoutTimeout] = useState<NodeJS.Timeout | null>(null);

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

  // 自動選擇布局（當沒有用戶選擇時）
  useEffect(() => {
    if (userSelectedLayout === null && streamCount > 0) {
      const autoLayout = autoSelectLayout(streamCount);
      setSelectedLayout(autoLayout);
    }
  }, [streamCount, userSelectedLayout]);

  // 用戶手動選擇布局
  const handleLayoutChange = useCallback((layoutType: LayoutType, isUserSelection: boolean = true) => {
    setSelectedLayout(layoutType);
    
    if (isUserSelection) {
      setUserSelectedLayout(layoutType);
      localStorage.setItem('currentLayout', String(layoutType));
      
      // 清除之前的超時
      if (userLayoutTimeout) {
        clearTimeout(userLayoutTimeout);
      }
      
      // 5秒後清除用戶選擇標記，允許自動布局
      const timeout = setTimeout(() => {
        setUserSelectedLayout(null);
        // 用戶選擇保護已過期，允許自動布局
      }, 5000);
      
      setUserLayoutTimeout(timeout);
    }
  }, [userLayoutTimeout]);

  // 清理超時
  useEffect(() => {
    return () => {
      if (userLayoutTimeout) {
        clearTimeout(userLayoutTimeout);
      }
    };
  }, [userLayoutTimeout]);

  // 獲取當前有效的布局類型
  const currentLayout = selectedLayout || (streamCount > 0 ? autoSelectLayout(streamCount) : 1);

  return {
    currentLayout,
    selectedLayout,
    userSelectedLayout,
    setLayout: handleLayoutChange
  };
}

