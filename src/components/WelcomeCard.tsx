import { Coffee, FileText, HelpCircle, Info } from 'lucide-react';
import { Button as MuiButton } from '@mui/material';
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
          <MuiButton
            variant="contained"
            color="secondary"
            size="large"
            onClick={() => window.open('https://buymeacoffee.com/hsiung', '_blank')}
            sx={{
              background: 'linear-gradient(to right, #facc15, #fb923c)',
              color: '#000000',
              '&:hover': {
                background: 'linear-gradient(to right, #eab308, #f97316)',
              },
            }}
          >
            <Coffee className="size-5 mr-2" />
            {t('welcome.buyMeACoffee')}
          </MuiButton>
        </div>
      </div>

      {/* Footer Buttons */}
      <div className={`flex flex-wrap items-center justify-center gap-3 pt-4 border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
        <MuiButton
          variant="outlined"
          color="secondary"
          onClick={onShowVersionHistory}
          sx={{
            borderColor: theme === 'dark' ? 'rgba(147, 51, 234, 0.5)' : '#c084fc',
            color: theme === 'dark' ? '#a855f7' : '#9333ea',
            '&:hover': {
              borderColor: theme === 'dark' ? 'rgba(147, 51, 234, 0.5)' : '#c084fc',
              bgcolor: theme === 'dark' ? 'rgba(147, 51, 234, 0.1)' : 'rgba(147, 51, 234, 0.05)',
            },
          }}
        >
          <FileText className="size-4 mr-2" />
          {t('welcome.versionInfo')}
        </MuiButton>
        <MuiButton
          variant="outlined"
          color="primary"
          onClick={onShowTutorial}
          sx={{
            borderColor: theme === 'dark' ? 'rgba(59, 130, 246, 0.5)' : '#93c5fd',
            color: theme === 'dark' ? '#60a5fa' : '#2563eb',
            '&:hover': {
              borderColor: theme === 'dark' ? 'rgba(59, 130, 246, 0.5)' : '#93c5fd',
              bgcolor: theme === 'dark' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)',
            },
          }}
        >
          <HelpCircle className="size-4 mr-2" />
          {t('welcome.tutorial')}
        </MuiButton>
        <MuiButton
          variant="outlined"
          color="success"
          onClick={onShowAbout}
          sx={{
            borderColor: theme === 'dark' ? 'rgba(34, 197, 94, 0.5)' : '#86efac',
            color: theme === 'dark' ? '#4ade80' : '#16a34a',
            '&:hover': {
              borderColor: theme === 'dark' ? 'rgba(34, 197, 94, 0.5)' : '#86efac',
              bgcolor: theme === 'dark' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.05)',
            },
          }}
        >
          <Info className="size-4 mr-2" />
          {t('welcome.about')}
        </MuiButton>
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