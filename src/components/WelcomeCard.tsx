import { Coffee, FileText, HelpCircle, Info } from 'lucide-react';
import { Button } from './ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

interface WelcomeCardProps {
  theme: 'light' | 'dark';
  onShowVersionHistory: () => void;
  onShowTutorial: () => void;
  onShowAbout?: () => void;
}

export function WelcomeCard({ theme, onShowVersionHistory, onShowTutorial, onShowAbout }: WelcomeCardProps) {
  return (
    <div className={`max-w-3xl mx-auto ${theme === 'dark' ? 'bg-gradient-to-br from-purple-900/20 to-blue-900/20' : 'bg-gradient-to-br from-purple-50 to-blue-50'} rounded-lg border ${theme === 'dark' ? 'border-purple-500/30' : 'border-purple-200'} p-8 shadow-xl`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className={`text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 mb-2`}>
            歡迎使用 MultiStream Hub
          </h1>
          <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            免費的多平台串流直播整合工具，支援 Twitch 和 YouTube 直播
          </p>
        </div>
        <Select defaultValue="zh-TW">
          <SelectTrigger className={`w-32 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="zh-TW">繁體中文</SelectItem>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="ja">日本語</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Features List */}
      <div className="space-y-3 mb-8">
        <h2 className={`${theme === 'dark' ? 'text-purple-300' : 'text-purple-700'} mb-4`}>
          主要功能
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FeatureItem theme={theme} text="支援 Twitch 和 YouTube 多串流同時觀看" />
          <FeatureItem theme={theme} text="多種顯示模式（單一畫面、分割、網格、聊天室布局）" />
          <FeatureItem theme={theme} text="獨立音量控制和聊天室管理" />
          <FeatureItem theme={theme} text="收藏功能及分類管理" />
          <FeatureItem theme={theme} text="Twitch 頻道搜尋和開台狀態檢測" />
          <FeatureItem theme={theme} text="YouTube 頻道開台監測功能" />
          <FeatureItem theme={theme} text="完全免費、無廣告" />
        </div>
      </div>

      {/* Quick Start Guide */}
      <div className="space-y-4 mb-8">
        <h2 className={`${theme === 'dark' ? 'text-purple-300' : 'text-purple-700'} mb-4`}>
          快速開始
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <QuickGuideCard
            theme={theme}
            number="1"
            title="添加串流"
            description="在右側控制面板的輸入框中貼上 Twitch 或 YouTube 直播網址，點擊「加入畫面」即可觀看"
            icon="📺"
          />
          <QuickGuideCard
            theme={theme}
            number="2"
            title="調整布局"
            description="在控制面板的「布局控制」區域選擇您喜歡的顯示方式，支援單一、分割、網格等多種布局"
            icon="🎨"
          />
          <QuickGuideCard
            theme={theme}
            number="3"
            title="收藏管理"
            description="點擊「管理收藏」將常看的頻道加入收藏，支援分類管理和一鍵載入整個分類"
            icon="⭐"
          />
          <QuickGuideCard
            theme={theme}
            number="4"
            title="音量控制"
            description="使用總音量滑桿調整所有串流，也可以在串流列表中單獨調整每個串流的音量"
            icon="🔊"
          />
        </div>
        <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-blue-900/20 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'}`}>
          <p className={`text-sm ${theme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>
            💡 提示：您可以直接輸入 Twitch 頻道名稱進行搜尋，系統會自動顯示相關頻道建議
          </p>
        </div>
      </div>

      {/* Support Section */}
      <div className={`${theme === 'dark' ? 'bg-gray-900/50' : 'bg-white/50'} rounded-lg p-6 mb-6`}>
        <h3 className={`${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'} mb-2 text-center`}>
          喜歡這個專案嗎？
        </h3>
        <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} text-center mb-4`}>
          如果這個工具對你有幫助，歡迎請開發者喝杯咖啡！你的支持將幫助專案持續發展
        </p>
        <div className="flex justify-center">
          <Button
            className="bg-gradient-to-r from-yellow-400 to-orange-400 text-black hover:from-yellow-500 hover:to-orange-500"
            size="lg"
          >
            <Coffee className="size-5 mr-2" />
            Buy Me A Coffee
          </Button>
        </div>
      </div>

      {/* Footer Buttons */}
      <div className={`flex flex-wrap items-center justify-center gap-3 pt-4 border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
        <p className={`${theme === 'dark' ? 'text-gray-500' : 'text-gray-600'} text-center w-full mb-2`}>
          此專案為開源專案，基於 Twitch 和 YouTube 的嵌入功能，所有數據都保存在本地瀏覽器
        </p>
        <Button
          variant="outline"
          className={theme === 'dark' ? 'border-purple-500/50 text-purple-400 hover:bg-purple-500/10' : 'border-purple-300 text-purple-700 hover:bg-purple-50'}
          onClick={onShowVersionHistory}
        >
          <FileText className="size-4 mr-2" />
          版本資訊
        </Button>
        <Button
          variant="outline"
          className={theme === 'dark' ? 'border-blue-500/50 text-blue-400 hover:bg-blue-500/10' : 'border-blue-300 text-blue-700 hover:bg-blue-50'}
          onClick={onShowTutorial}
        >
          <HelpCircle className="size-4 mr-2" />
          使用教學
        </Button>
        <Button
          variant="outline"
          className={theme === 'dark' ? 'border-green-500/50 text-green-400 hover:bg-green-500/10' : 'border-green-300 text-green-700 hover:bg-green-50'}
          onClick={onShowAbout}
        >
          <Info className="size-4 mr-2" />
          關於我們
        </Button>
      </div>
    </div>
  );
}

function FeatureItem({ theme, text }: { theme: 'light' | 'dark'; text: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="size-5 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0 mt-0.5">
        <svg className="size-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <span className={`${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>{text}</span>
    </div>
  );
}

function QuickGuideCard({ theme, number, title, description, icon }: { theme: 'light' | 'dark'; number: string; title: string; description: string; icon: string }) {
  return (
    <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800/50 border border-gray-700' : 'bg-white border border-gray-200'}`}>
      <div className="flex items-start gap-3 mb-2">
        <div className="size-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0 text-white">
          {number}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">{icon}</span>
            <h3 className={theme === 'dark' ? 'text-white' : 'text-black'}>{title}</h3>
          </div>
          <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>{description}</p>
        </div>
      </div>
    </div>
  );
}