import { ArrowLeft, Globe, Sun, Moon, Shield, Database, Lock, Eye, FileText, Users, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface PrivacyPageProps {
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  onBack: () => void;
  onNavigateToAbout?: () => void;
  onNavigateToTerms?: () => void;
}

export function PrivacyPage({ theme, onThemeToggle, onBack, onNavigateToAbout, onNavigateToTerms }: PrivacyPageProps) {
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
          <div className="inline-flex items-center justify-center w-20 h-20 mb-8 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500">
            <Shield className="size-12 text-white" />
          </div>
          
          <h1 className={`mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
            隱私權政策 Privacy Policy
          </h1>
          
          <div className={`flex items-center justify-center gap-8 mb-6 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            <p>
              <strong>生效日期：</strong>2025 年 12 月 2 日
            </p>
            <p>
              <strong>最新更新：</strong>2025 年 12 月 2 日
            </p>
          </div>
          
          <p className={`max-w-3xl mx-auto text-lg leading-relaxed ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            MultiStream Hub（以下簡稱「本網站」）由 Hsiung-Shao 獨立開發與營運。我們非常重視您的隱私權。本網站為純前端工具，絕大多數資料僅儲存於您的瀏覽器本地，絕不傳送到任何遠端伺服器。
          </p>
        </div>

        {/* Privacy Sections */}
        <div className="space-y-8">
          {/* Section 1 */}
          <PolicySection
            theme={theme}
            icon={<Eye className="size-6" />}
            title="1. 我們不收集的個人資料"
            iconColor="blue"
          >
            <ul className={`list-disc list-inside space-y-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>本網站不要求註冊、不收集電子郵件、姓名、電話或其他可直接識別您身份的資料</li>
              <li>不使用後端伺服器儲存任何使用者資料</li>
              <li>不追蹤跨網站行為、不建立使用者檔案</li>
            </ul>
          </PolicySection>

          {/* Section 1.5 */}
          <PolicySection
            theme={theme}
            icon={<Database className="size-6" />}
            title="1.5. Google Analytics 分析服務"
            iconColor="green"
          >
            <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              本網站使用 Google Analytics 來分析網站流量和使用情況，以改善用戶體驗。Google Analytics 使用 Cookie 和類似技術來收集匿名統計資料。
            </p>
            <ul className={`list-disc list-inside space-y-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>我們使用 Google Analytics 來了解網站使用情況（如頁面瀏覽量、停留時間等）</li>
              <li>Google Analytics 會收集匿名化的資料，不會識別您的個人身份</li>
              <li>我們已啟用 IP 匿名化功能，您的 IP 位址會被匿名化處理</li>
              <li>您可以透過瀏覽器設定拒絕 Cookie，或使用我們的同意橫幅選擇拒絕分析服務</li>
              <li>
                Google Analytics 的隱私政策：
                <a 
                  href="https://policies.google.com/privacy" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline ml-1"
                >
                  https://policies.google.com/privacy
                </a>
              </li>
            </ul>
          </PolicySection>

          {/* Section 2 */}
          <PolicySection
            theme={theme}
            icon={<Database className="size-6" />}
            title="2. 本地儲存（LocalStorage）使用的資料（唯一儲存位置）"
            iconColor="purple"
          >
            <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              我們僅在您的瀏覽器中使用 localStorage 儲存以下資料，全部可隨時手動清除：
            </p>
            <ul className={`list-disc list-inside space-y-2 mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>我的最愛頻道清單（自訂名稱、Twitch/YouTube 網址、分類）</li>
              <li>版面配置偏好（布局模式、音量設定、聊天室顯示狀態）</li>
              <li>備份檔案位置（若您啟用本地備份功能）</li>
            </ul>
            <p className={`mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <strong>您可隨時：</strong>
            </p>
            <ul className={`list-disc list-inside space-y-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>點擊「管理收藏 → 設定 → 清除所有資料」一鍵刪除</li>
              <li>或直接在瀏覽器設定中清除本站的 localStorage</li>
            </ul>
          </PolicySection>

          {/* Section 3 */}
          <PolicySection
            theme={theme}
            icon={<FileText className="size-6" />}
            title="3. 第三方嵌入內容（Twitch & YouTube）"
            iconColor="red"
          >
            <ul className={`list-disc list-inside space-y-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>當您加入 Twitch 或 YouTube 直播時，本站僅使用官方提供的 iframe 嵌入播放器</li>
              <li>聊天室同樣使用 Twitch / YouTube 官方嵌入功能</li>
              <li>
                這些嵌入內容會直接與 Twitch / YouTube 伺服器連線，其隱私政策分別適用：
                <ul className="list-disc list-inside ml-6 mt-2 space-y-1">
                  <li>
                    Twitch 隱私權政策：
                    <a 
                      href="https://www.twitch.tv/p/legal/privacy-policy" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline ml-1"
                    >
                      https://www.twitch.tv/p/legal/privacy-policy
                    </a>
                  </li>
                  <li>
                    YouTube 隱私權政策：
                    <a 
                      href="https://policies.google.com/privacy" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline ml-1"
                    >
                      https://policies.google.com/privacy
                    </a>
                  </li>
                </ul>
              </li>
            </ul>
          </PolicySection>

          {/* Section 4 */}
          <PolicySection
            theme={theme}
            icon={<Lock className="size-6" />}
            title="4. Cookies 與類似技術"
            iconColor="yellow"
          >
            <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              本網站本身不使用 Cookies，但我們使用的第三方服務（Google Analytics 和 Google AdSense）可能會使用 Cookies。
            </p>
            <ul className={`list-disc list-inside space-y-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>本網站本身不使用 Cookies 儲存資料</li>
              <li>我們僅使用 HTML5 localStorage 與 sessionStorage（均屬瀏覽器本地儲存）來儲存您的設定和收藏</li>
              <li>Google Analytics 使用 Cookie 來收集匿名統計資料（僅在您同意的情況下）</li>
              <li>Google AdSense 使用 Cookie 來提供個人化廣告（僅在您同意的情況下）</li>
              <li>您可以透過瀏覽器設定管理或刪除這些 Cookie，或使用我們的同意橫幅選擇拒絕</li>
              <li>拒絕 Cookie 不會影響網站的基本功能，但可能無法使用某些分析或廣告功能</li>
            </ul>
          </PolicySection>

          {/* Section 5 */}
          <PolicySection
            theme={theme}
            icon={<AlertCircle className="size-6" />}
            title="5. Google AdSense 廣告（已申請 / 未來可能顯示）"
            iconColor="orange"
          >
            <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              我們已申請 Google AdSense，若審核通過，將顯示個人化或非個人化廣告。廣告的顯示需要您的同意。
            </p>
            <ul className={`list-disc list-inside space-y-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>我們已申請 Google AdSense，若審核通過，將顯示個人化或非個人化廣告</li>
              <li>Google AdSense 使用 Cookie 來提供個人化廣告和追蹤廣告效果（僅在您同意的情況下）</li>
              <li>
                此時 Google 將作為獨立資料控制者，其隱私政策適用：
                <a 
                  href="https://policies.google.com/privacy" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline ml-1"
                >
                  https://policies.google.com/privacy
                </a>
              </li>
              <li>您可隨時在廣告上點擊「AdChoices」選擇退出個人化廣告</li>
              <li>您也可以透過我們的同意橫幅或瀏覽器設定拒絕廣告 Cookie</li>
            </ul>
          </PolicySection>

          {/* Section 5.5 */}
          <PolicySection
            theme={theme}
            icon={<Shield className="size-6" />}
            title="5.5. Cookie 同意管理"
            iconColor="indigo"
          >
            <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              我們使用 Cookie 同意橫幅（Consent Banner）來管理您對 Cookie 的同意。您可以隨時修改您的選擇。
            </p>
            <ul className={`list-disc list-inside space-y-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>首次訪問網站時，您會看到 Cookie 同意橫幅</li>
              <li>您可以選擇接受所有 Cookie、僅接受部分 Cookie，或拒絕所有 Cookie</li>
              <li>您的選擇會被保存在瀏覽器中，下次訪問時會記住您的偏好</li>
              <li>您可以隨時透過瀏覽器設定或清除 localStorage 來修改或撤銷同意</li>
              <li>我們使用 Google Consent Mode v2 來確保符合 GDPR、CCPA 等法規要求</li>
            </ul>
          </PolicySection>

          {/* Section 6 */}
          <PolicySection
            theme={theme}
            icon={<Users className="size-6" />}
            title="6. 您的權利（GDPR / CCPA / 台灣個資法）"
            iconColor="cyan"
          >
            <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              儘管我們不收集可識別個人資料，您仍享有以下權利：
            </p>
            <ul className={`list-disc list-inside space-y-2 mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>要求存取、刪除、更正您的資料 → 直接清除瀏覽器 localStorage 即可</li>
              <li>反對處理、限制處理 → 停止使用本網站即可</li>
              <li>資料可攜權 → 可在「管理收藏 → 設定」匯出 JSON 備份檔案</li>
              <li>撤銷同意 → 清除本地資料即可</li>
            </ul>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              聯絡方式：
              <a 
                href="mailto:feedback@multistreaming.org"
                className="text-blue-500 hover:underline ml-1"
              >
                feedback@multistreaming.org
              </a>
              （48 小時內回覆）
            </p>
          </PolicySection>

          {/* Section 7 */}
          <PolicySection
            theme={theme}
            icon={<Shield className="size-6" />}
            title="7. 兒童隱私"
            iconColor="pink"
          >
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              本網站不針對 13 歲以下兒童設計。若您為 13 歲以下，請勿使用本網站。
            </p>
          </PolicySection>

          {/* Section 8 */}
          <PolicySection
            theme={theme}
            icon={<FileText className="size-6" />}
            title="8. 政策變更"
            iconColor="teal"
          >
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              重大變更將於本頁面頂部更新日期並以顯眼方式通知。
            </p>
          </PolicySection>

          {/* Section 9 */}
          <PolicySection
            theme={theme}
            icon={<AlertCircle className="size-6" />}
            title="9. 聯絡我們"
            iconColor="purple"
          >
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              如有任何隱私疑問，請寄信至：
              <a 
                href="mailto:feedback@multistreaming.org"
                className="text-blue-500 hover:underline ml-1"
              >
                feedback@multistreaming.org
              </a>
            </p>
          </PolicySection>
        </div>

        {/* Footer Note */}
        <div className={`mt-16 pt-8 border-t ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}>
          <p className={`text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-600'}`}>
            此政策最後更新於 2025 年 12 月 2 日
          </p>
        </div>

        {/* Footer Navigation */}
        <footer className={`text-center pt-8 mt-8 border-t ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}>
          <div className="flex justify-center gap-8 mb-6">
            <button
              onClick={onBack}
              className={`hover:underline ${theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'}`}
            >
              首頁
            </button>
            {onNavigateToAbout && (
              <button
                onClick={onNavigateToAbout}
                className={`hover:underline ${theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'}`}
              >
                關於我們
              </button>
            )}
            {onNavigateToTerms && (
              <button
                onClick={onNavigateToTerms}
                className={`hover:underline ${theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'}`}
              >
                服務條款
              </button>
            )}
          </div>
          
          <p className={`text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-600'}`}>
            © 2025 Hsiung-Shao. All rights reserved.
          </p>
        </footer>
      </div>
    </div>
  );
}

// Policy Section Component
interface PolicySectionProps {
  theme: 'light' | 'dark';
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  iconColor?: 'blue' | 'green' | 'purple' | 'red' | 'yellow' | 'orange' | 'indigo' | 'cyan' | 'pink' | 'teal';
}

function PolicySection({ theme, icon, title, children, iconColor = 'blue' }: PolicySectionProps) {
  const colorMap = {
    blue: theme === 'dark' ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600',
    green: theme === 'dark' ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-600',
    purple: theme === 'dark' ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-600',
    red: theme === 'dark' ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-600',
    yellow: theme === 'dark' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-yellow-100 text-yellow-600',
    orange: theme === 'dark' ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-600',
    indigo: theme === 'dark' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-100 text-indigo-600',
    cyan: theme === 'dark' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-cyan-100 text-cyan-600',
    pink: theme === 'dark' ? 'bg-pink-500/20 text-pink-400' : 'bg-pink-100 text-pink-600',
    teal: theme === 'dark' ? 'bg-teal-500/20 text-teal-400' : 'bg-teal-100 text-teal-600',
  };

  return (
    <section className={`p-6 rounded-xl ${theme === 'dark' ? 'bg-gray-900/50' : 'bg-white'}`}>
      <div className="flex items-start gap-4 mb-4">
        <div className={`p-2 rounded-lg flex-shrink-0 ${colorMap[iconColor]}`}>
          {icon}
        </div>
        <h2 className={theme === 'dark' ? 'text-white' : 'text-black'}>{title}</h2>
      </div>
      <div className="ml-14">
        {children}
      </div>
    </section>
  );
}
