import { ArrowLeft, Globe, Sun, Moon, Tv, Grid, MessageCircle, Volume2, Star, Smartphone, Languages, Shield, Search, Radio, Youtube, Zap, RefreshCw, Code, Radio as Broadcast, Database, Gauge, Users, Mail, MessageSquare } from 'lucide-react';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface AboutPageProps {
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  onBack: () => void;
  onNavigateToPrivacy?: () => void;
}

export function AboutPage({ theme, onThemeToggle, onBack, onNavigateToPrivacy }: AboutPageProps) {
  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-950' : 'bg-gray-50'}`}>
      {/* Header Navigation */}
      <div className={`border-b ${theme === 'dark' ? 'bg-black border-gray-800' : 'bg-white border-gray-200'} px-6 py-4`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={onBack}
            className={theme === 'dark' ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-black'}
          >
            <ArrowLeft className="size-4 mr-2" />
            返回首頁
          </Button>
          
          <div className="flex items-center gap-4">
            <Select defaultValue="zh-TW">
              <SelectTrigger className={`w-32 ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300'}`}>
                <Globe className="size-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zh-TW">繁體中文</SelectItem>
                <SelectItem value="zh-CN">简体中文</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ja">日本語</SelectItem>
                <SelectItem value="ko">한국어</SelectItem>
              </SelectContent>
            </Select>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={onThemeToggle}
              className={theme === 'dark' ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-black'}
            >
              {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-8 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500">
            <div className="relative">
              <div className="absolute inset-0 bg-white rounded-full blur-sm opacity-50"></div>
              <svg className="size-12 text-white relative" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </div>
          </div>
          
          <p className={`max-w-3xl mx-auto text-lg leading-relaxed ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            MultiStream Hub 是一個完全免費的多平台直播串流觀看工具，專為喜愛同時觀看多個直播的用戶設計。我們支援 Twitch 和 YouTube 兩大主流直播平台，讓您可以在同一個頁面上同時觀看多個直播串流，無需在多個分頁間切換。
          </p>
        </div>

        {/* Website Intro Section */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-8">
            <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-purple-500/20' : 'bg-purple-100'}`}>
              <MessageSquare className={`size-6 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`} />
            </div>
            <h2 className={theme === 'dark' ? 'text-white' : 'text-black'}>網站介紹</h2>
          </div>
          
          <div className={`p-6 rounded-xl ${theme === 'dark' ? 'bg-gray-900/50' : 'bg-white'}`}>
            <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              MultiStream Hub 是一個完全免費的多平台直播串流觀看工具，專為喜愛同時觀看多個直播的用戶設計。我們支援 Twitch 和 YouTube 兩大主流直播平台，讓您可以在同一個頁面上同時觀看多個直播串流，無需在多個分頁間切換。
            </p>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              本工具由個人開發者獨立開發維護，完全免費開放給所有人使用，無需註冊、無需付費，歡迎分享給您的朋友！
            </p>
          </div>
        </section>

        {/* Main Features */}
        <section className="mb-16">
          <h2 className={`mb-8 text-center ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
            主要功能特色
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard
              theme={theme}
              icon={<Tv className="size-6" />}
              title="多平台串流支援"
              description="支援 Twitch 和 YouTube 兩大直播平台，可同時觀看多個串流"
              gradient="from-pink-500 to-purple-500"
              large
            />
            
            <FeatureCard
              theme={theme}
              icon={<Grid className="size-6" />}
              title="多種布局模式"
              description="提供單一畫面、分割、網格、側邊聊天（雙欄、四格、單一聊天室）等多種布局選擇"
            />
            
            <FeatureCard
              theme={theme}
              icon={<MessageCircle className="size-6" />}
              title="聊天室整合"
              description="整合 Twitch 和 YouTube 聊天室，可同時顯示多個聊天室"
            />
            
            <FeatureCard
              theme={theme}
              icon={<Volume2 className="size-6" />}
              title="音量控制"
              description="獨立音量控制每個串流，並提供總音量控制功能"
            />
            
            <FeatureCard
              theme={theme}
              icon={<Star className="size-6" />}
              title="收藏系統"
              description="收藏喜的串流，支援分類管理、Twitch 頻道搜尋、開台狀態檢測、匯出/匯入 JSON 檔案"
            />
            
            <FeatureCard
              theme={theme}
              icon={<Smartphone className="size-6" />}
              title="響應式設計"
              description="適配各種螢幕尺寸，提供流暢的使用體驗"
              gradient="from-purple-500 to-indigo-500"
            />
            
            <FeatureCard
              theme={theme}
              icon={<Languages className="size-6" />}
              title="多語言支援"
              description="支援繁體中文、簡體中文、英文、日文、韓文"
              gradient="from-blue-500 to-cyan-500"
            />
            
            <FeatureCard
              theme={theme}
              icon={<Shield className="size-6" />}
              title="安全可靠"
              description="採用 XSS 防護、CSP 安全策略，保護用戶安全"
              gradient="from-pink-600 to-red-600"
            />
            
            <FeatureCard
              theme={theme}
              icon={<Search className="size-6" />}
              title="Twitch 頻道搜尋"
              description="支援 Twitch 頻道搜尋功能，快速找到喜愛的頻道"
              gradient="from-purple-600 to-purple-800"
            />
            
            <FeatureCard
              theme={theme}
              icon={<Radio className="size-6" />}
              title="開台狀態檢測"
              description="自動檢測收藏的 Twitch 和 YouTube 頻道開台狀態"
              gradient="from-blue-600 to-indigo-700"
            />
            
            <FeatureCard
              theme={theme}
              icon={<Youtube className="size-6" />}
              title="YouTube 頻道開台監測"
              description="支援 YouTube 頻道開台狀態自動檢測，收藏列表中顯示直播狀態，點擊即可快速載入直播影片"
            />
            
            <FeatureCard
              theme={theme}
              icon={<Zap className="size-6" />}
              title="自動排版"
              description="Layout 自動排版功能，根據串流數量自動選擇最適合的布局"
              gradient="from-purple-500 to-pink-500"
            />
            
            <FeatureCard
              theme={theme}
              icon={<RefreshCw className="size-6" />}
              title="串流重新整理"
              description="支援串流重新整理功能，快速重新載入串流"
            />
          </div>
        </section>

        {/* Technical Features */}
        <section className="mb-16">
          <h2 className={`mb-8 text-center ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
            技術特色
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TechFeatureCard
              theme={theme}
              icon={<Code className="size-6 text-blue-400" />}
              title="純前端技術"
              description="使用純 HTML/CSS/JavaScript 開發，無需後端伺服器"
            />
            
            <TechFeatureCard
              theme={theme}
              icon={<Broadcast className="size-6 text-purple-400" />}
              title="即時串流"
              description="整合 Twitch Embed API 和 YouTube IFrame API"
            />
            
            <TechFeatureCard
              theme={theme}
              icon={<Database className="size-6 text-green-400" />}
              title="本地儲存"
              description="使用 localStorage 和 IndexedDB 保存設定和備份數據，支援匯出/匯入 JSON 檔案"
            />
            
            <TechFeatureCard
              theme={theme}
              icon={<Globe className="size-6 text-cyan-400" />}
              title="SEO 優化"
              description="完整的 Meta 標籤和結構化數據"
            />
            
            <TechFeatureCard
              theme={theme}
              icon={<Gauge className="size-6 text-orange-400" />}
              title="效能優化"
              description="輕量級設計，快速載入"
            />
          </div>
        </section>

        {/* Creator Info */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-8">
            <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
              <Users className={`size-6 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} />
            </div>
            <h2 className={theme === 'dark' ? 'text-white' : 'text-black'}>創建者資訊</h2>
          </div>
          
          <div className={`p-6 rounded-xl ${theme === 'dark' ? 'bg-gray-900/50' : 'bg-white'}`}>
            <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              MultiStream Hub 由 <strong className="text-blue-500">Hsiung-Shao</strong> 獨立開發維護。
            </p>
            <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              本專案旨在為直播愛好者提供一個免費、易用的多平台串流觀看工具，讓觀看直播變得更加便利和有趣。
            </p>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              我們持續改進和優化功能，歡迎用戶提供寶貴的意見和建議。
            </p>
          </div>
        </section>

        {/* Contact Us */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-8">
            <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-purple-500/20' : 'bg-purple-100'}`}>
              <MessageSquare className={`size-6 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`} />
            </div>
            <h2 className={theme === 'dark' ? 'text-white' : 'text-black'}>聯絡我們</h2>
          </div>
          
          <div className={`p-6 rounded-xl ${theme === 'dark' ? 'bg-gray-900/50' : 'bg-white'}`}>
            <p className={`mb-6 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              如有任何問題、建議或意見回饋，歡迎透過以下方式聯繫我們：
            </p>
            
            <div className="space-y-4">
              <a
                href="https://forms.gle/AjG922YrXFbyAdBa6"
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-start gap-4 p-4 rounded-lg transition-colors ${
                  theme === 'dark' 
                    ? 'bg-gray-800 hover:bg-gray-750' 
                    : 'bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <Mail className={`size-6 flex-shrink-0 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} />
                <div>
                  <h3 className={`mb-1 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                    意見回饋表單
                  </h3>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    點擊這裡填寫意見回饋
                  </p>
                </div>
              </a>
              
              <a
                href="https://discord.gg/3Uu6dZbtKd"
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-start gap-4 p-4 rounded-lg transition-colors ${
                  theme === 'dark' 
                    ? 'bg-gray-800 hover:bg-gray-750' 
                    : 'bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <MessageSquare className={`size-6 flex-shrink-0 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`} />
                <div>
                  <h3 className={`mb-1 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                    Discord 社群
                  </h3>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    加入我們的 Discord 伺服器，與其他用戶交流或直接聯繫開發者
                  </p>
                </div>
              </a>
            </div>
          </div>
        </section>

        {/* Terms of Use */}
        <section className="mb-16">
          <h2 className={`mb-8 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
            使用條款
          </h2>
          
          <div className={`p-6 rounded-xl ${theme === 'dark' ? 'bg-gray-900/50' : 'bg-white'}`}>
            <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              MultiStream Hub 完全免費開放給所有人使用，無需註冊或付費。
            </p>
            <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              本工具僅作為串流觀看工具使用，所有直播內容的版權歸屬各直播平台和創作者所有。
            </p>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              為維持網站運營和持續開發，本網站可能會顯示第三方廣告（如 Google AdSense）。這些廣告由第三方服務提供商管理，我們不會收集您的個人資訊用於廣告投放。
            </p>
          </div>
        </section>

        {/* Privacy & Security */}
        <section className="mb-16">
          <h2 className={`mb-8 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
            隱私與安全
          </h2>
          
          <div className={`p-6 rounded-xl ${theme === 'dark' ? 'bg-gray-900/50' : 'bg-white'}`}>
            <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              我們重視您的隱私權。本網站不會主動收集任何個人資料，所有設定和收藏資料都儲存在您的瀏覽器本地。
            </p>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              詳細的隱私權政策請參閱：隱私權政策
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className={`text-center pt-8 border-t ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}>
          <div className="flex justify-center gap-8 mb-6">
            <button
              onClick={onBack}
              className={`hover:underline ${theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'}`}
            >
              首頁
            </button>
            {onNavigateToPrivacy && (
              <button
                onClick={onNavigateToPrivacy}
                className={`hover:underline ${theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'}`}
              >
                隱私權政策
              </button>
            )}
            <a
              href="https://forms.gle/AjG922YrXFbyAdBa6"
              target="_blank"
              rel="noopener noreferrer"
              className={`hover:underline ${theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'}`}
            >
              給予意見回饋
            </a>
          </div>
          
          <p className={`text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-600'}`}>
            © 2025 Hsiung-Shao. All rights reserved.
          </p>
          <p className={`text-sm mt-1 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-500'}`}>
            最後更新：2025-12-09
          </p>
        </footer>
      </div>
    </div>
  );
}

// Feature Card Component
interface FeatureCardProps {
  theme: 'light' | 'dark';
  icon: React.ReactNode;
  title: string;
  description: string;
  gradient?: string;
  large?: boolean;
}

function FeatureCard({ theme, icon, title, description, gradient, large }: FeatureCardProps) {
  if (gradient) {
    return (
      <div className={`p-6 rounded-xl bg-gradient-to-br ${gradient} ${large ? 'md:col-span-2 lg:col-span-1' : ''}`}>
        <div className="flex items-start gap-4">
          <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm flex-shrink-0">
            <div className="text-white">{icon}</div>
          </div>
          <div>
            <h3 className="text-white mb-2">{title}</h3>
            <p className="text-white/90 text-sm leading-relaxed">{description}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-6 rounded-xl border transition-all hover:scale-105 ${
      theme === 'dark' 
        ? 'bg-gray-900/50 border-gray-800 hover:border-purple-500/50' 
        : 'bg-white border-gray-200 hover:border-purple-400'
    }`}>
      <div className="flex items-start gap-4">
        <div className={`p-2 rounded-lg flex-shrink-0 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'}`}>
          <div className={theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}>{icon}</div>
        </div>
        <div>
          <h3 className={`mb-2 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{title}</h3>
          <p className={`text-sm leading-relaxed ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

// Tech Feature Card Component
interface TechFeatureCardProps {
  theme: 'light' | 'dark';
  icon: React.ReactNode;
  title: string;
  description: string;
}

function TechFeatureCard({ theme, icon, title, description }: TechFeatureCardProps) {
  return (
    <div className={`p-6 rounded-xl ${theme === 'dark' ? 'bg-gray-900/50' : 'bg-white'}`}>
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">{icon}</div>
        <div>
          <h3 className={`mb-2 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{title}</h3>
          <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}