import { X, Tv, Search, Layout, MessageCircle, Volume2, RefreshCw, Star, Radio, Database, Settings, Smartphone, Zap } from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

interface TutorialProps {
  theme: 'light' | 'dark';
  onClose: () => void;
}

export function Tutorial({ theme, onClose }: TutorialProps) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`max-w-5xl w-full ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-lg shadow-2xl max-h-[90vh] flex flex-col`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
          <div>
            <h2 className={theme === 'dark' ? 'text-white' : 'text-black'}>使用教學</h2>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              快速上手 MultiStream Hub 的所有功能
            </p>
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
        <ScrollArea className="flex-1">
          <Tabs defaultValue="basic" className="p-6">
            <TabsList className={`grid w-full grid-cols-3 mb-6 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'}`}>
              <TabsTrigger value="basic">基本功能</TabsTrigger>
              <TabsTrigger value="advanced">進階功能</TabsTrigger>
              <TabsTrigger value="tips">快捷提示</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-6">
              <Section
                theme={theme}
                icon={<Tv className="size-5" />}
                title="📺 添加串流"
                content={
                  <>
                    <ol className="list-decimal list-inside space-y-2 mb-3">
                      <li>在控制面板頂部的輸入框中，貼上 Twitch 或 YouTube 直播網址</li>
                      <li>點擊「加入畫面」按鈕</li>
                      <li>串流會自動載入並顯示在畫面上</li>
                    </ol>
                    <Tip theme={theme} text="支援的網址格式包括：" />
                    <ul className={`list-disc list-inside ml-4 space-y-1 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                      <li>Twitch: https://www.twitch.tv/頻道名稱</li>
                      <li>YouTube: https://www.youtube.com/watch?v=視頻ID 或 https://youtu.be/視頻ID</li>
                    </ul>
                    <Tip theme={theme} text="您也可以直接輸入 Twitch 頻道名稱進行搜尋，系統會自動搜尋並顯示相關頻道" />
                  </>
                }
              />

              <Section
                theme={theme}
                icon={<Search className="size-5" />}
                title="🔍 Twitch 頻道搜尋"
                content={
                  <>
                    <ol className="list-decimal list-inside space-y-2 mb-3">
                      <li>在控制面板的輸入框中，輸入 Twitch 頻道名稱（不需要完整網址）</li>
                      <li>系統會自動顯示搜尋建議列表</li>
                      <li>點擊搜尋建議中的頻道即可加入畫面</li>
                    </ol>
                    <Tip theme={theme} text="搜尋功能也支援在收藏管理界面中使用，方便快速添加收藏" />
                  </>
                }
              />

              <Section
                theme={theme}
                icon={<Layout className="size-5" />}
                title="🎨 調整布局"
                content={
                  <>
                    <div className="space-y-4">
                      <div>
                        <h4 className={`mb-2 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>
                          基本布局
                        </h4>
                        <ol className="list-decimal list-inside space-y-2">
                          <li>在控制面板的「布局控制」區域，點擊布局預覽按鈕</li>
                          <li>可選擇：單一畫面、左右分割、上下分割、四宮格、上大下三、2×3 網格、3×3 網格</li>
                          <li>系統會根據串流數量自動選擇最適合的布局（自動排版功能）</li>
                        </ol>
                      </div>
                      <div>
                        <h4 className={`mb-2 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>
                          側邊聊天布局（雙欄版 / 四格版）
                        </h4>
                        <ol className="list-decimal list-inside space-y-2">
                          <li>點擊「雙欄聊天布局」或「四格聊天布局」按鈕啟用側邊聊天布局</li>
                          <li>左側視頻區域可以使用布局按鈕（1-6、9）調整顯示方式</li>
                          <li>右側聊天室區域固定，不會隨視頻布局改變</li>
                          <li>每個聊天室面板都有下拉選擇器，可以選擇要顯示的串流聊天室</li>
                        </ol>
                        <Tip theme={theme} text="側邊聊天布局模式下，無需調整串流順序，直接從聊天室選擇器中選擇要顯示的串流即可" />
                      </div>
                    </div>
                  </>
                }
              />

              <Section
                theme={theme}
                icon={<MessageCircle className="size-5" />}
                title="💬 聊天室功能"
                content={
                  <>
                    <div className="space-y-4">
                      <div>
                        <h4 className={`mb-2 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>
                          基本模式
                        </h4>
                        <ul className="list-disc list-inside space-y-2">
                          <li>點擊串流視窗中的聊天室按鈕（💬）顯示/隱藏聊天室</li>
                          <li>使用「顯示所有聊天室」按鈕一次性顯示所有聊天室</li>
                          <li>聊天室會自動嵌入到串流視窗中</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className={`mb-2 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>
                          側邊聊天布局模式（雙欄版 / 四格版）
                        </h4>
                        <ul className="list-disc list-inside space-y-2">
                          <li>右側聊天室區域固定顯示，不會隨視頻布局改變</li>
                          <li>每個聊天室面板頂部都有下拉選擇器</li>
                          <li>從選擇器中選擇要顯示的串流聊天室</li>
                          <li>支援 Twitch 和 YouTube 聊天室嵌入</li>
                          <li>無需調整串流順序，直接選擇即可切換</li>
                        </ul>
                      </div>
                    </div>
                    <Warning theme={theme} text="YouTube 聊天室需要在正式環境（非 localhost）才能嵌入" />
                  </>
                }
              />

              <Section
                theme={theme}
                icon={<Volume2 className="size-5" />}
                title="🔊 音量控制"
                content={
                  <>
                    <ul className="list-disc list-inside space-y-2">
                      <li>使用「總音量」滑桿調整所有串流的音量</li>
                      <li>在「串流順序」列表中，調整單個串流的音量</li>
                      <li>點擊「全部靜音」快速靜音/取消靜音所有串流</li>
                      <li>取消全部靜音後，會自動恢復到之前設定的音量值</li>
                      <li>每個串流畫面上方的音量條會即時顯示實際音量（考慮總音量）</li>
                    </ul>
                  </>
                }
              />

              <Section
                theme={theme}
                icon={<RefreshCw className="size-5" />}
                title="🔄 重整串流"
                content={
                  <>
                    <ol className="list-decimal list-inside space-y-2">
                      <li>點擊串流畫面上方的重整按鈕（🔄）</li>
                      <li>串流會重新載入，並保留當前的音量、聊天室狀態和位置設定</li>
                    </ol>
                  </>
                }
              />
            </TabsContent>

            <TabsContent value="advanced" className="space-y-6">
              <Section
                theme={theme}
                icon={<Star className="size-5" />}
                title="⭐ 收藏功能"
                content={
                  <>
                    <ol className="list-decimal list-inside space-y-2 mb-3">
                      <li>點擊「管理收藏」打開收藏管理界面</li>
                      <li>在「收藏串流」標籤頁中：
                        <ul className="list-disc list-inside ml-6 mt-1">
                          <li>輸入串流網址和自訂名稱（選填）</li>
                          <li>選擇分類（可選）</li>
                          <li>點擊「加入收藏」</li>
                        </ul>
                      </li>
                      <li>在「分類管理」標籤頁中創建和管理分類</li>
                      <li>在控制面板的「收藏串流」區域：
                        <ul className="list-disc list-inside ml-6 mt-1">
                          <li>使用下拉選單選擇「全部收藏」或「未分類」</li>
                          <li>點擊列表中的串流名稱即可載入</li>
                        </ul>
                      </li>
                    </ol>
                    <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-blue-900/20 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'}`}>
                      <p className={`text-sm ${theme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>
                        在收藏列表中，您可以：
                      </p>
                      <ul className={`list-disc list-inside ml-4 mt-2 text-sm ${theme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>
                        <li>查看 Twitch 頻道的開台狀態（綠色圓點表示正在直播，灰色表示未開台）</li>
                        <li>使用 Twitch 頻道搜尋功能快速添加收藏</li>
                        <li>點擊分類名稱旁的「▶ 載入」按鈕一鍵載入整個分類的串流</li>
                      </ul>
                    </div>
                  </>
                }
              />

              <Section
                theme={theme}
                icon={<Radio className="size-5" />}
                title="📡 開台狀態檢測"
                content={
                  <>
                    <ul className="list-disc list-inside space-y-2">
                      <li>收藏的 Twitch 和 YouTube 頻道會自動顯示開台狀態</li>
                      <li>綠色圓點（🟢）表示頻道正在直播，並顯示觀看人數（Twitch）</li>
                      <li>灰色圓點（⚫）表示頻道未開台</li>
                      <li>開台狀態會自動定期更新（預設每 5 分鐘）</li>
                      <li>點擊「🔄 刷新狀態」按鈕可以手動更新所有頻道的開台狀態</li>
                    </ul>
                    <Tip theme={theme} text="正在直播的頻道會自動排在列表前面，方便快速找到正在直播的頻道。YouTube 頻道開台監測功能會自動檢測頻道是否正在直播，並在收藏列表中顯示狀態" />
                  </>
                }
              />

              <Section
                theme={theme}
                icon={<Tv className="size-5" />}
                title="📺 YouTube 頻道開台監測"
                content={
                  <>
                    <ol className="list-decimal list-inside space-y-2 mb-3">
                      <li>在收藏管理中添加 YouTube 直播網址（支援正在直播網址或是頻道網址）</li>
                      <li>新增到收藏系統後，系統會自動監測該頻道是否正在開台</li>
                      <li>如果頻道正在直播，收藏列表中會顯示綠色圓點（🟢）</li>
                      <li>從收藏清單中點擊正在直播的 YouTube 頻道，即可直接加入串流觀看</li>
                      <li>開台狀態會自動定期更新（預設每 5 分鐘），也可以手動點擊「🔄 刷新狀態」按鈕</li>
                    </ol>
                    <Tip theme={theme} text="YouTube 收藏功能支援輸入直播網址或頻道網址（包括 @username 格式），新增後會自動監測頻道開台狀態。當頻道正在直播時，可直接從收藏清單中選擇加入串流" />
                  </>
                }
              />

              <Section
                theme={theme}
                icon={<Database className="size-5" />}
                title="💾 數據備份"
                content={
                  <>
                    <ol className="list-decimal list-inside space-y-2">
                      <li>在「管理收藏」→「設定」標籤頁中啟用數據備份</li>
                      <li>點擊「選擇文件位置」選擇備份文件（會自動導入數據）</li>
                      <li>或點擊「創建新文件」創建新的備份文件</li>
                      <li>啟用後，每次修改收藏或分類時會自動保存</li>
                    </ol>
                    <Tip theme={theme} text="頁面載入時會自動嘗試讀取備份文件" />
                  </>
                }
              />

              <Section
                theme={theme}
                icon={<Settings className="size-5" />}
                title="🎛️ 控制面板"
                content={
                  <>
                    <ul className="list-disc list-inside space-y-2">
                      <li>控制面板位於畫面右側，可以收起/展開</li>
                      <li>點擊控制面板標題或右側的展開按鈕來展開/收起面板</li>
                      <li>如果沒有任何串流，控制面板會自動展開</li>
                      <li>在「串流順序」中可以拖曳調整串流順序</li>
                    </ul>
                  </>
                }
              />

              <Section
                theme={theme}
                icon={<Smartphone className="size-5" />}
                title="📱 移動設備"
                content={
                  <>
                    <ul className="list-disc list-inside space-y-2">
                      <li>在手機和平板上，控制面板會全屏顯示</li>
                      <li>所有按鈕和輸入框都已優化，適合觸摸操作</li>
                      <li>支援橫向和縱向模式</li>
                    </ul>
                  </>
                }
              />
            </TabsContent>

            <TabsContent value="tips" className="space-y-6">
              <Section
                theme={theme}
                icon={<Zap className="size-5" />}
                title="💡 快捷提示"
                content={
                  <>
                    <div className="grid gap-4">
                      <TipCard
                        theme={theme}
                        title="快速收藏"
                        description="點擊「收藏當前」可以快速將當前顯示的串流加入收藏"
                      />
                      <TipCard
                        theme={theme}
                        title="批次載入"
                        description="在收藏列表中，可以點擊分類名稱旁的「▶ 載入」按鈕一鍵載入整個分類的串流"
                      />
                      <TipCard
                        theme={theme}
                        title="調整視窗"
                        description="串流視窗可以拖曳調整大小和位置"
                      />
                      <TipCard
                        theme={theme}
                        title="活動狀態"
                        description="點擊串流視窗可以切換為活動狀態（紫色邊框）"
                      />
                      <TipCard
                        theme={theme}
                        title="自動搜尋"
                        description="在輸入框中輸入 Twitch 頻道名稱，系統會自動顯示搜尋建議"
                      />
                      <TipCard
                        theme={theme}
                        title="開台提醒"
                        description="收藏的頻道會自動顯示開台狀態，正在直播的頻道會自動排在前面"
                      />
                    </div>
                  </>
                }
              />
            </TabsContent>
          </Tabs>
        </ScrollArea>
      </div>
    </div>
  );
}

function Section({
  theme,
  icon,
  title,
  content,
}: {
  theme: 'light' | 'dark';
  icon: React.ReactNode;
  title: string;
  content: React.ReactNode;
}) {
  return (
    <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`size-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white`}>
          {icon}
        </div>
        <h3 className={theme === 'dark' ? 'text-white' : 'text-black'}>{title}</h3>
      </div>
      <div className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} space-y-3`}>
        {content}
      </div>
    </div>
  );
}

function Tip({ theme, text }: { theme: 'light' | 'dark'; text: string }) {
  return (
    <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-blue-900/20 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'}`}>
      <p className={`text-sm ${theme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>
        💡 提示：{text}
      </p>
    </div>
  );
}

function Warning({ theme, text }: { theme: 'light' | 'dark'; text: string }) {
  return (
    <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-yellow-900/20 border border-yellow-500/30' : 'bg-yellow-50 border border-yellow-200'}`}>
      <p className={`text-sm ${theme === 'dark' ? 'text-yellow-300' : 'text-yellow-700'}`}>
        ⚠️ 注意：{text}
      </p>
    </div>
  );
}

function TipCard({ theme, title, description }: { theme: 'light' | 'dark'; title: string; description: string }) {
  return (
    <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-purple-500/30' : 'bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200'}`}>
      <h4 className={`mb-1 ${theme === 'dark' ? 'text-purple-300' : 'text-purple-700'}`}>{title}</h4>
      <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>{description}</p>
    </div>
  );
}
