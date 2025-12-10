import { useEffect } from 'react';
import { StreamBox } from './StreamBox';
import type { StreamData } from '../utils/streamUtils';

interface StreamContainerProps {
  streams: StreamData[];
  theme: 'light' | 'dark';
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

  // 自動選擇布局
  useEffect(() => {
    if (streams.length > 0) {
      const chatSidebarFixed = document.getElementById('chat-sidebar-fixed');
      const isFixedLayout = !!chatSidebarFixed;
      
      if (isFixedLayout && typeof (window as any).updateFixedLayoutFramework === 'function') {
        setTimeout(() => {
          (window as any).updateFixedLayoutFramework();
        }, 300);
      } else {
        setTimeout(() => {
          if (typeof (window as any).autoSelectLayout === 'function' && typeof (window as any).setLayout === 'function') {
            const layoutType = (window as any).autoSelectLayout();
            (window as any).setLayout(layoutType);
          }
        }, 100);
      }
    }
  }, [streams.length]);

  return (
    <div id="container" className="stream-container">
      {streams.map(stream => (
        <StreamBox
          key={stream.id}
          streamData={stream}
          theme={theme}
          onRemove={onRemove}
          onReload={onReload}
          onToggleChat={onToggleChat}
          onSeparateChat={onSeparateChat}
          onVolumeChange={onVolumeChange}
        />
      ))}
    </div>
  );
}

