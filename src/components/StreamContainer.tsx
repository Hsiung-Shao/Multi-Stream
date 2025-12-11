import { useEffect, useState } from 'react';
import { StreamBox } from './StreamBox';
import type { StreamData } from '../utils/streamUtils';
import { calculateLayoutStyles, type LayoutType } from '../utils/layoutUtils';

interface StreamContainerProps {
  streams: StreamData[];
  theme: 'light' | 'dark';
  layoutType: LayoutType;
  onRemove: (id: number) => void;
  onReload: (id: number) => void;
  onToggleChat: (id: number) => void;
  onSeparateChat: (id: number) => void;
  onVolumeChange: (id: number, volume: number) => void;
  onStreamDataChange: (id: number, data: Partial<StreamData>) => void;
}

export function StreamContainer({
  streams,
  theme,
  layoutType,
  onRemove,
  onReload,
  onToggleChat,
  onSeparateChat,
  onVolumeChange,
  onStreamDataChange
}: StreamContainerProps) {
  // 同步 streamData 到全局 window.streamData
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (!window.streamData) {
        window.streamData = {};
      }
      
      streams.forEach(stream => {
        window.streamData[stream.id] = stream;
      });
      
      // 清理已移除的串流
      Object.keys(window.streamData).forEach(id => {
        const streamId = parseInt(id);
        if (!streams.find(s => s.id === streamId)) {
          delete window.streamData[streamId];
        }
      });
    }
  }, [streams]);

  // 更新串流順序列表
  useEffect(() => {
    if (typeof (window as any).updateStreamOrderList === 'function') {
      (window as any).updateStreamOrderList();
    }
  }, [streams]);

  // 檢查並調整控制面板狀態
  useEffect(() => {
    if (streams.length > 0 && typeof (window as any).checkAndAdjustControlPanel === 'function') {
      (window as any).checkAndAdjustControlPanel();
    }
  }, [streams.length]);

  // 觸發窗口 resize 事件，讓播放器重新計算尺寸（當布局改變時）
  useEffect(() => {
    if (streams.length === 0) return;

    const timeoutId = setTimeout(() => {
      // 觸發窗口 resize 事件，讓播放器重新計算尺寸
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
      });
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [streams, layoutType]);

  // 獲取 Navbar 高度
  const [navbarHeight, setNavbarHeight] = useState(64);
  
  useEffect(() => {
    const updateNavbarHeight = () => {
      const navbar = document.querySelector('nav');
      if (navbar) {
        setNavbarHeight(navbar.getBoundingClientRect().height);
      }
    };
    
    updateNavbarHeight();
    window.addEventListener('resize', updateNavbarHeight);
    
    return () => {
      window.removeEventListener('resize', updateNavbarHeight);
    };
  }, []);

  return (
    <div 
      id="container" 
      className="stream-container" 
      style={{ 
        position: 'absolute', 
        width: '100%', 
        height: `calc(100vh - ${navbarHeight}px)`,
        top: `${navbarHeight}px`,
        left: '0'
      }}
    >
      {streams.map((stream, index) => {
        const layoutStyle = calculateLayoutStyles(layoutType, index, streams.length);
        
        return (
          <StreamBox
            key={stream.id}
            streamData={stream}
            theme={theme}
            layoutStyle={layoutStyle}
            onRemove={onRemove}
            onReload={onReload}
            onToggleChat={onToggleChat}
            onSeparateChat={onSeparateChat}
            onVolumeChange={onVolumeChange}
          />
        );
      })}
    </div>
  );
}

