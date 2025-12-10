import { X, Calendar, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';

interface VersionHistoryProps {
  theme: 'light' | 'dark';
  onClose: () => void;
}

export function VersionHistory({ theme, onClose }: VersionHistoryProps) {
  const versions = [
    {
      version: 'v2.5.0',
      date: '2024-12-08',
      changes: [
        '新增 YouTube 頻道開台監測功能',
        '支援輸入 YouTube 頻道網址和 @username 格式',
        '自動檢測 YouTube 頻道直播狀態',
        '優化收藏列表的開台狀態顯示',
      ],
    },
    {
      version: 'v2.4.0',
      date: '2024-11-15',
      changes: [
        '新增 Twitch 頻道開台狀態檢測',
        '顯示觀看人數資訊',
        '自動排序正在直播的頻道',
        '新增手動刷新狀態按鈕',
      ],
    },
    {
      version: 'v2.3.0',
      date: '2024-10-20',
      changes: [
        '新增 Twitch 頻道搜尋功能',
        '搜尋建議列表支援快速添加',
        '優化收藏管理界面',
        '修復聊天室嵌入問題',
      ],
    },
    {
      version: 'v2.2.0',
      date: '2024-09-10',
      changes: [
        '新增側邊聊天布局模式（雙欄版/四格版）',
        '聊天室選擇器支援動態切換',
        '優化布局控制功能',
        '改善移動設備體驗',
      ],
    },
    {
      version: 'v2.1.0',
      date: '2024-08-05',
      changes: [
        '新增分類管理功能',
        '支援一鍵載入整個分類',
        '新增數據備份功能',
        '優化收藏列表顯示',
      ],
    },
    {
      version: 'v2.0.0',
      date: '2024-07-01',
      changes: [
        '全新的 UI 設計',
        '新增收藏功能',
        '支援多種布局模式',
        '新增音量控制功能',
        '支援聊天室顯示',
      ],
    },
    {
      version: 'v1.0.0',
      date: '2024-06-01',
      changes: [
        '初始版本發布',
        '支援 Twitch 和 YouTube 串流',
        '基本的多串流顯示功能',
      ],
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`max-w-3xl w-full ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-lg shadow-2xl max-h-[90vh] flex flex-col`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <Sparkles className="size-6 text-white" />
            </div>
            <div>
              <h2 className={theme === 'dark' ? 'text-white' : 'text-black'}>版本紀錄</h2>
              <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                MultiStream Hub 更新歷史
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className={theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'}
          >
            <X className="size-5" />
          </Button>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 p-6">
          <div className="space-y-6">
            {versions.map((version, index) => (
              <div
                key={version.version}
                className={`relative pl-6 pb-6 ${
                  index !== versions.length - 1
                    ? `border-l-2 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`
                    : ''
                }`}
              >
                {/* Timeline dot */}
                <div className={`absolute left-0 top-0 -translate-x-[9px] size-4 rounded-full ${
                  index === 0
                    ? 'bg-gradient-to-br from-purple-500 to-blue-500'
                    : theme === 'dark'
                    ? 'bg-gray-700'
                    : 'bg-gray-300'
                } ring-4 ${theme === 'dark' ? 'ring-gray-900' : 'ring-white'}`} />

                {/* Version info */}
                <div className="flex items-center gap-3 mb-3">
                  <span className={`px-3 py-1 rounded-full ${
                    index === 0
                      ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white'
                      : theme === 'dark'
                      ? 'bg-gray-800 text-gray-300'
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    {version.version}
                  </span>
                  <div className={`flex items-center gap-1 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    <Calendar className="size-4" />
                    {version.date}
                  </div>
                  {index === 0 && (
                    <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400 border border-green-500/30">
                      最新
                    </span>
                  )}
                </div>

                {/* Changes */}
                <ul className="space-y-2">
                  {version.changes.map((change, changeIndex) => (
                    <li
                      key={changeIndex}
                      className={`flex items-start gap-2 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}
                    >
                      <span className={theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}>•</span>
                      {change}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
