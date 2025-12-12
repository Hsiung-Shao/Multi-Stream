import { Coffee, FileText, HelpCircle, Info } from 'lucide-react';
import { useI18n } from '../i18n/index';

interface WelcomeCardProps {
  theme: 'light' | 'dark';
  onShowVersionHistory: () => void;
  onShowTutorial: () => void;
  onShowAbout?: () => void;
}

export function WelcomeCard({ theme, onShowVersionHistory, onShowTutorial, onShowAbout }: WelcomeCardProps) {
  const { t } = useI18n();
  return (
    <div className={`max-w-3xl mx-auto ${theme === 'dark' ? 'bg-gradient-to-br from-purple-900/20 to-blue-900/20' : 'bg-gradient-to-br from-purple-50 to-blue-50'} rounded-lg border ${theme === 'dark' ? 'border-purple-500/30' : 'border-purple-200'} p-8 shadow-xl`}>
      {/* Header */}
      <div className="mb-6">
        <h1 className={`text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 mb-2`}>
          {t('welcome.title')}
        </h1>
        <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
          {t('welcome.description')}
        </p>
      </div>

      {/* Features List */}
      <div className="space-y-3 mb-8">
        <h2 className={`${theme === 'dark' ? 'text-purple-300' : 'text-purple-700'} mb-4`}>
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
        </div>
      </div>

      {/* Quick Start Guide */}
      <div className="space-y-4 mb-8">
        <h2 className={`${theme === 'dark' ? 'text-purple-300' : 'text-purple-700'} mb-4`}>
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

      {/* Support Section */}
      <div className={`${theme === 'dark' ? 'bg-gray-900/50' : 'bg-white/50'} rounded-lg p-6 mb-6`}>
        <h3 className={`${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'} mb-2 text-center`}>
          {t('welcome.supportTitle')}
        </h3>
        <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} text-center mb-4`}>
          {t('welcome.supportDesc')}
        </p>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('[WelcomeCard] 贊助按鈕被點擊');
              window.open('https://buymeacoffee.com/hsiung', '_blank', 'noopener,noreferrer');
            }}
            className="flex items-center gap-2 px-6 py-3 rounded-lg text-base font-medium text-black bg-gradient-to-r from-yellow-400 to-orange-400 hover:from-yellow-500 hover:to-orange-500 transition-all shadow-lg hover:shadow-xl"
          >
            <Coffee className="size-5" />
            {t('welcome.buyMeACoffee')}
          </button>
        </div>
      </div>

      {/* Footer Buttons */}
      <div className={`flex flex-wrap items-center justify-center gap-3 pt-4 border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[WelcomeCard] 版本資訊按鈕被點擊');
            onShowVersionHistory();
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
            theme === 'dark' 
              ? 'border-purple-500/50 text-purple-400 hover:bg-purple-500/10 hover:border-purple-500/70' 
              : 'border-purple-400 text-purple-600 hover:bg-purple-50 hover:border-purple-500'
          }`}
        >
          <FileText className="size-4" />
          {t('welcome.versionInfo')}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[WelcomeCard] 教學按鈕被點擊');
            onShowTutorial();
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
            theme === 'dark' 
              ? 'border-blue-500/50 text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/70' 
              : 'border-blue-400 text-blue-600 hover:bg-blue-50 hover:border-blue-500'
          }`}
        >
          <HelpCircle className="size-4" />
          {t('welcome.tutorial')}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[WelcomeCard] 關於按鈕被點擊', { onShowAbout: !!onShowAbout });
            if (onShowAbout) {
              onShowAbout();
            }
          }}
          disabled={!onShowAbout}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
            !onShowAbout
              ? theme === 'dark'
                ? 'border-green-500/20 text-green-500/50 cursor-not-allowed'
                : 'border-green-400/50 text-green-600/50 cursor-not-allowed'
              : theme === 'dark' 
                ? 'border-green-500/50 text-green-400 hover:bg-green-500/10 hover:border-green-500/70' 
                : 'border-green-400 text-green-600 hover:bg-green-50 hover:border-green-500'
          }`}
        >
          <Info className="size-4" />
          {t('welcome.about')}
        </button>
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