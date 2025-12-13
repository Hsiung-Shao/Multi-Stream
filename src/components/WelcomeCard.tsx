import { Shield, FileText, Mail, MessageSquare, ExternalLink, Info, BookOpen, History, Heart, Sparkles, Gamepad2, Twitter } from 'lucide-react';
import { useI18n } from '../i18n/index';

interface WelcomeCardProps {
  theme: 'light' | 'dark';
  onShowVersionHistory?: () => void;
  onShowTutorial?: () => void;
  onShowAbout?: () => void;
  onNavigateToPrivacy?: () => void;
}

export function WelcomeCard({ theme, onShowVersionHistory, onShowTutorial, onShowAbout, onNavigateToPrivacy }: WelcomeCardProps) {
  const { t } = useI18n();
  return (
    <div className="w-full max-w-[1400px] mx-auto" style={{ position: 'relative', zIndex: 10 }}>
      {/* Main Layout - Left/Right Split */}
      <div className="grid gap-6 mb-6" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        {/* Left Column - Main Welcome Card */}
        <div className="xl:col-span-2">
          <div className={`${theme === 'dark' ? 'bg-gradient-to-br from-purple-900/20 to-blue-900/20' : 'bg-gradient-to-br from-purple-50 to-blue-50'} rounded-lg border ${theme === 'dark' ? 'border-purple-500/30' : 'border-purple-200'} p-8 shadow-xl`}>
            {/* Header */}
            <div className="mb-6">
              <h1 className={`text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 mb-3`}>
                {t('welcome.title')}
              </h1>
              <p className={`text-lg mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                {t('welcome.description')}
              </p>
              <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                {t('welcome.intro')}
              </p>
            </div>

            {/* Features List - Expanded */}
            <div className="space-y-3 mb-8">
              <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-purple-300' : 'text-purple-700'} mb-4`}>
                {t('welcome.features')}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FeatureItem theme={theme} text={t('welcome.feature1')} />
                <FeatureItem theme={theme} text={t('welcome.feature2')} />
                <FeatureItem theme={theme} text={t('welcome.feature3')} />
                <FeatureItem theme={theme} text={t('welcome.feature4')} />
                <FeatureItem theme={theme} text={t('welcome.feature5')} />
                <FeatureItem theme={theme} text={t('welcome.feature6')} />
                <FeatureItem theme={theme} text={t('welcome.feature7')} />
                <FeatureItem theme={theme} text={t('welcome.feature8')} />
                <FeatureItem theme={theme} text={t('welcome.feature9')} />
                <FeatureItem theme={theme} text={t('welcome.feature10')} />
                <FeatureItem theme={theme} text={t('welcome.feature11')} />
                <FeatureItem theme={theme} text={t('welcome.feature12')} />
                <FeatureItem theme={theme} text={t('welcome.feature13')} />
              </div>
            </div>

            {/* Quick Start Guide */}
            <div className="space-y-4">
              <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-purple-300' : 'text-purple-700'} mb-4`}>
                {t('welcome.quickStart')}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <QuickGuideCard
                  theme={theme}
                  number="1"
                  title={t('welcome.step1Title')}
                  description={t('welcome.step1Desc')}
                  icon="📺"
                />
                <QuickGuideCard
                  theme={theme}
                  number="2"
                  title={t('welcome.step2Title')}
                  description={t('welcome.step2Desc')}
                  icon="🎨"
                />
                <QuickGuideCard
                  theme={theme}
                  number="3"
                  title={t('welcome.step3Title')}
                  description={t('welcome.step3Desc')}
                  icon="⭐"
                />
                <QuickGuideCard
                  theme={theme}
                  number="4"
                  title={t('welcome.step4Title')}
                  description={t('welcome.step4Desc')}
                  icon="🔊"
                />
              </div>
              <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-blue-900/20 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'}`}>
                <p className={`text-sm ${theme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>
                  {t('welcome.tip')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Sidebar Sections */}
        <div className="xl:col-span-1 space-y-6">
          {/* Quick Navigation - First */}
          <div className={`${theme === 'dark' ? 'bg-gray-900/50' : 'bg-white'} rounded-lg border ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'} p-6 shadow-lg`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-purple-500/20' : 'bg-purple-100'}`}>
                <Info className={`size-5 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`} />
              </div>
              <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                {t('welcome.quickNav')}
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {onShowAbout && (
                <button
                  onClick={onShowAbout}
                  type="button"
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-all duration-200 cursor-pointer transform hover:scale-105 hover:shadow-lg ${
                    theme === 'dark'
                      ? 'bg-gray-800 hover:bg-gray-700 hover:border-blue-500/50 border border-transparent'
                      : 'bg-gray-50 hover:bg-gray-100 hover:border-blue-300 border border-transparent'
                  }`}
                  style={{ pointerEvents: 'auto' }}
                >
                  <Info className={`size-4 transition-transform duration-200 ${theme === 'dark' ? 'text-blue-400 group-hover:scale-110' : 'text-blue-600'}`} />
                  <span className={`text-xs font-medium ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                    {t('welcome.about')}
                  </span>
                </button>
              )}
              {onShowTutorial && (
                <button
                  onClick={onShowTutorial}
                  type="button"
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-all duration-200 cursor-pointer transform hover:scale-105 hover:shadow-lg ${
                    theme === 'dark'
                      ? 'bg-gray-800 hover:bg-gray-700 hover:border-green-500/50 border border-transparent'
                      : 'bg-gray-50 hover:bg-gray-100 hover:border-green-300 border border-transparent'
                  }`}
                  style={{ pointerEvents: 'auto' }}
                >
                  <BookOpen className={`size-4 transition-transform duration-200 ${theme === 'dark' ? 'text-green-400' : 'text-green-600'}`} />
                  <span className={`text-xs font-medium ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                    {t('welcome.tutorial')}
                  </span>
                </button>
              )}
              {onShowVersionHistory && (
                <button
                  onClick={onShowVersionHistory}
                  type="button"
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-all duration-200 cursor-pointer transform hover:scale-105 hover:shadow-lg ${
                    theme === 'dark'
                      ? 'bg-gray-800 hover:bg-gray-700 hover:border-yellow-500/50 border border-transparent'
                      : 'bg-gray-50 hover:bg-gray-100 hover:border-yellow-300 border border-transparent'
                  }`}
                  style={{ pointerEvents: 'auto' }}
                >
                  <History className={`size-4 transition-transform duration-200 ${theme === 'dark' ? 'text-yellow-400' : 'text-yellow-600'}`} />
                  <span className={`text-xs font-medium ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                    {t('welcome.versionInfo')}
                  </span>
                </button>
              )}
              {onNavigateToPrivacy && (
                <button
                  onClick={onNavigateToPrivacy}
                  type="button"
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-all duration-200 cursor-pointer transform hover:scale-105 hover:shadow-lg ${
                    theme === 'dark'
                      ? 'bg-gray-800 hover:bg-gray-700 hover:border-red-500/50 border border-transparent'
                      : 'bg-gray-50 hover:bg-gray-100 hover:border-red-300 border border-transparent'
                  }`}
                  style={{ pointerEvents: 'auto' }}
                >
                  <Shield className={`size-4 transition-transform duration-200 ${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`} />
                  <span className={`text-xs font-medium ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                    {t('about.privacyPolicy')}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Author's Message Section - Second */}
          <div className={`${theme === 'dark' ? 'bg-gray-900/50' : 'bg-white'} rounded-lg border ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'} p-6 shadow-lg`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-pink-500/20' : 'bg-pink-100'}`}>
                <Heart className={`size-5 ${theme === 'dark' ? 'text-pink-400' : 'text-pink-600'}`} />
              </div>
              <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                作者的話
              </h2>
            </div>
            <div className={`space-y-3 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <p className="text-sm leading-relaxed">
                不知道大家會不會和我有一樣的困擾 —— 每天要看很多頻道，卻得開一堆瀏覽器分頁，想同時看多個畫面更是難上加難。
              </p>
              <p className="text-sm leading-relaxed">
                為了解決這個麻煩，我專門做了這個工具。而且後續還會嘗試整合 Twitch 功能，到時候大家就能直接匯入自己在 Twitch 上追隨的頻道，用起來會更方便～
              </p>
              <p className="text-sm leading-relaxed">
                不過有個小情況要跟大家說明：目前在 YouTube 方面，可能還是會跳轉到不同頻道的影片，暫時沒辦法直接精準定位直播內容。這部分我已經盡力優化了，現階段只能麻煩大家手動添加直播頻道，還請多多包涵～
              </p>
              <p className="text-sm leading-relaxed">
                如果大家用著覺得順手、實用，別忘了多多分享給身邊的朋友，讓更多人也能用上這個能提升效率的小幫手～
              </p>
            </div>
          </div>

          {/* Legal & Privacy Section - Third */}
          <div className={`${theme === 'dark' ? 'bg-gray-900/50' : 'bg-white'} rounded-lg border ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'} p-6 shadow-lg`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-red-500/20' : 'bg-red-100'}`}>
                <Shield className={`size-5 ${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`} />
              </div>
              <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                {t('welcome.legalPrivacy')}
              </h2>
            </div>
            <p className={`mb-4 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              {t('welcome.legalPrivacyDesc')}
            </p>
            <div className="flex flex-col gap-2">
              {onNavigateToPrivacy && (
                <button
                  onClick={onNavigateToPrivacy}
                  type="button"
                  className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 cursor-pointer transform hover:scale-105 hover:shadow-lg ${
                    theme === 'dark'
                      ? 'bg-red-600 hover:bg-red-700 text-white hover:ring-2 hover:ring-red-400/50'
                      : 'bg-red-600 hover:bg-red-700 text-white hover:ring-2 hover:ring-red-300/50'
                  }`}
                  style={{ pointerEvents: 'auto' }}
                >
                  <Shield className="size-4 transition-transform duration-200 hover:scale-110" />
                  {t('about.privacyPolicy')}
                </button>
              )}
            </div>
          </div>

          {/* Contact Us Section - Fourth */}
          <div className={`${theme === 'dark' ? 'bg-gray-900/50' : 'bg-white'} rounded-lg border ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'} p-6 shadow-lg`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
                <Mail className={`size-5 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} />
              </div>
              <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                {t('about.contactTitle')}
              </h2>
            </div>
            <p className={`mb-4 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              {t('about.contactIntro')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <a
                href="https://docs.google.com/forms/d/e/1FAIpQLSfCBlVZgTwiz-_PEVgkJkPUYHfJyz0Dowln2njQoWcMzit6Ow/viewform"
                target="_blank"
                rel="noopener noreferrer"
                className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-all duration-200 cursor-pointer transform hover:scale-105 hover:shadow-lg ${
                  theme === 'dark'
                    ? 'bg-gray-800 hover:bg-gray-700 hover:border-blue-500/50 border border-transparent'
                    : 'bg-gray-50 hover:bg-gray-100 hover:border-blue-300 border border-transparent'
                }`}
                style={{ pointerEvents: 'auto' }}
              >
                <Mail className={`size-4 transition-transform duration-200 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} />
                <span className={`text-xs font-medium ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                  {t('about.feedbackForm')}
                </span>
              </a>
              <a
                href="https://discord.gg/3Uu6dZbtKd"
                target="_blank"
                rel="noopener noreferrer"
                className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-all duration-200 cursor-pointer transform hover:scale-105 hover:shadow-lg ${
                  theme === 'dark'
                    ? 'bg-gray-800 hover:bg-gray-700 hover:border-purple-500/50 border border-transparent'
                    : 'bg-gray-50 hover:bg-gray-100 hover:border-purple-300 border border-transparent'
                }`}
                style={{ pointerEvents: 'auto' }}
              >
                <MessageSquare className={`size-4 transition-transform duration-200 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`} />
                <span className={`text-xs font-medium ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                  {t('about.discordCommunity')}
                </span>
              </a>
              <a
                href="https://forum.gamer.com.tw/C.php?bsn=60030&snA=677879"
                target="_blank"
                rel="noopener noreferrer"
                className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-all duration-200 cursor-pointer transform hover:scale-105 hover:shadow-lg ${
                  theme === 'dark'
                    ? 'bg-gray-800 hover:bg-gray-700 hover:border-orange-500/50 border border-transparent'
                    : 'bg-gray-50 hover:bg-gray-100 hover:border-orange-300 border border-transparent'
                }`}
                style={{ pointerEvents: 'auto' }}
              >
                <Gamepad2 className={`size-4 transition-transform duration-200 ${theme === 'dark' ? 'text-orange-400' : 'text-orange-600'}`} />
                <span className={`text-xs font-medium ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                  巴哈文章
                </span>
              </a>
              <a
                href="https://x.com/Hsiungshao"
                target="_blank"
                rel="noopener noreferrer"
                className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-all duration-200 cursor-pointer transform hover:scale-105 hover:shadow-lg ${
                  theme === 'dark'
                    ? 'bg-gray-800 hover:bg-gray-700 hover:border-sky-500/50 border border-transparent'
                    : 'bg-gray-50 hover:bg-gray-100 hover:border-sky-300 border border-transparent'
                }`}
                style={{ pointerEvents: 'auto' }}
              >
                <Twitter className={`size-4 transition-transform duration-200 ${theme === 'dark' ? 'text-sky-400' : 'text-sky-600'}`} />
                <span className={`text-xs font-medium ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                  X (Twitter)
                </span>
              </a>
            </div>
          </div>
        </div>
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