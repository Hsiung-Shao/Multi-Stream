import { Shield, Mail, MessageSquare, Info, BookOpen, History, Heart, Users } from 'lucide-react';
import { Button } from './ui/button';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '../hooks/use-media-query';

interface WelcomeCardProps {
  theme: 'light' | 'dark';
  onShowVersionHistory?: () => void;
  onShowTutorial?: () => void;
  onShowAbout?: () => void;
  onNavigateToPrivacy?: () => void;
}

export function WelcomeCard({ theme, onShowVersionHistory, onShowTutorial, onShowAbout, onNavigateToPrivacy }: WelcomeCardProps) {
  const { t } = useTranslation(['welcome', 'about', 'common']);

  // 使用 'md' breakpoint (768px) 來判斷手機版垂直布局
  const isMobileVertical = useMediaQuery('(max-width: 768px)');

  return (
    <div className="w-full max-w-[1400px] mx-auto">
      {/* Main Layout - Mobile: 1 column (flex-col), Desktop: 2 columns (grid-cols-2) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Left Column - Main Welcome Card - Always First */}
        <div className={isMobileVertical ? 'order-1' : ''}>
          <div className={`${theme === 'dark' ? 'bg-gradient-to-br from-purple-900/20 to-blue-900/20' : 'bg-gradient-to-br from-purple-50 to-blue-50'} rounded-lg border ${theme === 'dark' ? 'border-purple-500/30' : 'border-purple-200'} p-8 shadow-xl`}>
            {/* Header */}
            <div className="mb-6">
              <h1 className={`text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 mb-3`}>
                {t('welcome:title')}
              </h1>
              <p className={`text-lg mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                {t('welcome:description')}
              </p>
              <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                {t('welcome:intro')}
              </p>
            </div>

            {/* Features List - Expanded */}
            <div className="space-y-3 mb-8">
              <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-purple-300' : 'text-purple-700'} mb-4`}>
                {t('welcome:features')}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FeatureItem theme={theme} text={t('welcome:feature1')} />
                <FeatureItem theme={theme} text={t('welcome:feature2')} />
                <FeatureItem theme={theme} text={t('welcome:feature3')} />
                <FeatureItem theme={theme} text={t('welcome:feature4')} />
                <FeatureItem theme={theme} text={t('welcome:feature5')} />
                <FeatureItem theme={theme} text={t('welcome:feature6')} />
                <FeatureItem theme={theme} text={t('welcome:feature7')} />
                <FeatureItem theme={theme} text={t('welcome:feature8')} />
                <FeatureItem theme={theme} text={t('welcome:feature9')} />
                <FeatureItem theme={theme} text={t('welcome:feature10')} />
                <FeatureItem theme={theme} text={t('welcome:feature11')} />
                <FeatureItem theme={theme} text={t('welcome:feature12')} />
                <FeatureItem theme={theme} text={t('welcome:feature13')} />
              </div>
            </div>

            {/* Quick Start Guide */}
            <div className="space-y-4">
              <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-purple-300' : 'text-purple-700'} mb-4`}>
                {t('welcome:quickStart')}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <QuickGuideCard
                  theme={theme}
                  number="1"
                  title={t('welcome:step1Title')}
                  description={t('welcome:step1Desc')}
                  icon="📺"
                />
                <QuickGuideCard
                  theme={theme}
                  number="2"
                  title={t('welcome:step2Title')}
                  description={t('welcome:step2Desc')}
                  icon="🎨"
                />
                <QuickGuideCard
                  theme={theme}
                  number="3"
                  title={t('welcome:step3Title')}
                  description={t('welcome:step3Desc')}
                  icon="⭐"
                />
                <QuickGuideCard
                  theme={theme}
                  number="4"
                  title={t('welcome:step4Title')}
                  description={t('welcome:step4Desc')}
                  icon="🔊"
                />
              </div>
              <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-blue-900/20 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'}`}>
                <p className={`text-sm ${theme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>
                  {t('welcome:tip')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Sidebar Sections - Mobile: Second, Desktop: Right */}
        <div className={`space-y-6 ${isMobileVertical ? 'order-2' : ''}`}>
          {/* Quick Navigation - First */}
          <div className={`${theme === 'dark' ? 'bg-gray-900/50' : 'bg-white'} rounded-lg border ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'} p-6 shadow-lg`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-purple-500/20' : 'bg-purple-100'}`}>
                <Info className={`size-5 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`} />
              </div>
              <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                {t('welcome:quickNav')}
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {onShowAbout && (
                <Button
                  variant="ghost"
                  onClick={onShowAbout}
                  className={`group flex flex-col items-center gap-2 p-3 rounded-lg transition-all duration-200 h-auto ${theme === 'dark'
                    ? 'bg-gray-800 hover:bg-gray-700 hover:shadow-lg hover:shadow-blue-500/20'
                    : 'bg-gray-50 hover:bg-gray-100 hover:shadow-md'
                    } hover:scale-105`}
                >
                  <Info className={`size-4 transition-colors ${theme === 'dark' ? 'text-blue-400 group-hover:text-blue-300' : 'text-blue-600 group-hover:text-blue-500'}`} />
                  <span className={`text-xs font-medium ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                    {t('welcome:about')}
                  </span>
                </Button>
              )}
              {onShowTutorial && (
                <Button
                  variant="ghost"
                  onClick={onShowTutorial}
                  className={`group flex flex-col items-center gap-2 p-3 rounded-lg transition-all duration-200 h-auto ${theme === 'dark'
                    ? 'bg-gray-800 hover:bg-gray-700 hover:shadow-lg hover:shadow-green-500/20'
                    : 'bg-gray-50 hover:bg-gray-100 hover:shadow-md'
                    } hover:scale-105`}
                >
                  <BookOpen className={`size-4 transition-colors ${theme === 'dark' ? 'text-green-400 group-hover:text-green-300' : 'text-green-600 group-hover:text-green-500'}`} />
                  <span className={`text-xs font-medium ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                    {t('welcome:tutorial')}
                  </span>
                </Button>
              )}
              {onShowVersionHistory && (
                <Button
                  variant="ghost"
                  onClick={onShowVersionHistory}
                  className={`group flex flex-col items-center gap-2 p-3 rounded-lg transition-all duration-200 h-auto ${theme === 'dark'
                    ? 'bg-gray-800 hover:bg-gray-700 hover:shadow-lg hover:shadow-yellow-500/20'
                    : 'bg-gray-50 hover:bg-gray-100 hover:shadow-md'
                    } hover:scale-105`}
                >
                  <History className={`size-4 transition-colors ${theme === 'dark' ? 'text-yellow-400 group-hover:text-yellow-300' : 'text-yellow-600 group-hover:text-yellow-500'}`} />
                  <span className={`text-xs font-medium ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                    {t('welcome:versionInfo')}
                  </span>
                </Button>
              )}
              {onNavigateToPrivacy && (
                <Button
                  variant="ghost"
                  onClick={onNavigateToPrivacy}
                  className={`group flex flex-col items-center gap-2 p-3 rounded-lg transition-all duration-200 h-auto ${theme === 'dark'
                    ? 'bg-gray-800 hover:bg-gray-700 hover:shadow-lg hover:shadow-red-500/20'
                    : 'bg-gray-50 hover:bg-gray-100 hover:shadow-md'
                    } hover:scale-105`}
                >
                  <Shield className={`size-4 transition-colors ${theme === 'dark' ? 'text-red-400 group-hover:text-red-300' : 'text-red-600 group-hover:text-red-500'}`} />
                  <span className={`text-xs font-medium ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                    {t('about:privacyPolicy')}
                  </span>
                </Button>
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
                {t('welcome:authorMessage')}
              </h2>
            </div>
            <div className={`space-y-3 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <p className="text-sm leading-relaxed">
                {t('welcome:authorMessageP1')}
              </p>
              <p className="text-sm leading-relaxed">
                {t('welcome:authorMessageP2')}
              </p>
              <p className="text-sm leading-relaxed">
                {t('welcome:authorMessageP3')}
              </p>
              <p className="text-sm leading-relaxed">
                {t('welcome:authorMessageP4')}
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
                {t('welcome:legalPrivacy')}
              </h2>
            </div>
            <p className={`mb-4 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              {t('welcome:legalPrivacyDesc')}
            </p>
            <div className="flex flex-col gap-2">
              {onNavigateToPrivacy && (
                <Button
                  onClick={onNavigateToPrivacy}
                  className={`group flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 h-auto ${theme === 'dark'
                    ? 'bg-red-600 hover:bg-red-700 hover:shadow-lg hover:shadow-red-500/30 text-white'
                    : 'bg-red-600 hover:bg-red-700 hover:shadow-md text-white'
                    } hover:scale-105`}
                >
                  <Shield className="size-4 transition-transform group-hover:scale-110" />
                  {t('about:privacyPolicy')}
                </Button>
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
                {t('about:contactTitle')}
              </h2>
            </div>
            <p className={`mb-4 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              {t('about:contactIntro')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <a
                href="https://forms.gle/AjG922YrXFbyAdBa6"
                target="_blank"
                rel="noopener noreferrer"
                className={`group flex flex-col items-center gap-2 p-3 rounded-lg transition-all duration-200 ${theme === 'dark'
                  ? 'bg-gray-800 hover:bg-gray-700 hover:shadow-lg hover:shadow-blue-500/20'
                  : 'bg-gray-50 hover:bg-gray-100 hover:shadow-md'
                  } hover:scale-105`}
              >
                <Mail className={`size-4 transition-colors ${theme === 'dark' ? 'text-blue-400 group-hover:text-blue-300' : 'text-blue-600 group-hover:text-blue-500'}`} />
                <span className={`text-xs font-medium ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                  {t('about:feedbackForm')}
                </span>
              </a>
              <a
                href="https://discord.gg/3Uu6dZbtKd"
                target="_blank"
                rel="noopener noreferrer"
                className={`group flex flex-col items-center gap-2 p-3 rounded-lg transition-all duration-200 ${theme === 'dark'
                  ? 'bg-gray-800 hover:bg-gray-700 hover:shadow-lg hover:shadow-purple-500/20'
                  : 'bg-gray-50 hover:bg-gray-100 hover:shadow-md'
                  } hover:scale-105`}
              >
                <MessageSquare className={`size-4 transition-colors ${theme === 'dark' ? 'text-purple-400 group-hover:text-purple-300' : 'text-purple-600 group-hover:text-purple-500'}`} />
                <span className={`text-xs font-medium ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                  {t('about:discordCommunity')}
                </span>
              </a>
              <a
                href="https://forum.gamer.com.tw/C.php?bsn=60030&snA=677879"
                target="_blank"
                rel="noopener noreferrer"
                className={`group flex flex-col items-center gap-2 p-3 rounded-lg transition-all duration-200 ${theme === 'dark'
                  ? 'bg-gray-800 hover:bg-gray-700 hover:shadow-lg hover:shadow-orange-500/20'
                  : 'bg-gray-50 hover:bg-gray-100 hover:shadow-md'
                  } hover:scale-105`}
              >
                <Users className={`size-4 transition-colors ${theme === 'dark' ? 'text-orange-400 group-hover:text-orange-300' : 'text-orange-600 group-hover:text-orange-500'}`} />
                <span className={`text-xs font-medium ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                  {t('about:bahamut')}
                </span>
              </a>
              <a
                href="https://x.com/Hsiungshao"
                target="_blank"
                rel="noopener noreferrer"
                className={`group flex flex-col items-center gap-2 p-3 rounded-lg transition-all duration-200 ${theme === 'dark'
                  ? 'bg-gray-800 hover:bg-gray-700 hover:shadow-lg hover:shadow-gray-400/20'
                  : 'bg-gray-50 hover:bg-gray-100 hover:shadow-md'
                  } hover:scale-105`}
              >
                <MessageSquare className={`size-4 transition-colors ${theme === 'dark' ? 'text-gray-400 group-hover:text-gray-300' : 'text-gray-600 group-hover:text-gray-500'}`} />
                <span className={`text-xs font-medium ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                  {t('about:twitter')}
                </span>
              </a>
              <a
                href="mailto:feedback@multistreaming.org"
                className={`group flex flex-col items-center gap-2 p-3 rounded-lg transition-all duration-200 ${theme === 'dark'
                  ? 'bg-gray-800 hover:bg-gray-700 hover:shadow-lg hover:shadow-green-500/20'
                  : 'bg-gray-50 hover:bg-gray-100 hover:shadow-md'
                  } hover:scale-105`}
              >
                <Mail className={`size-4 transition-colors ${theme === 'dark' ? 'text-green-400 group-hover:text-green-300' : 'text-green-600 group-hover:text-green-500'}`} />
                <span className={`text-xs font-medium ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                  {t('about:email')}
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