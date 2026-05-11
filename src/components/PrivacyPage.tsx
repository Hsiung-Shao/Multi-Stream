import { ArrowLeft, Globe, Sun, Moon, Shield, Database, Lock, Eye, FileText, Users, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useTranslation } from 'react-i18next';
import { logEvent } from '../utils/analytics';

interface PrivacyPageProps {
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  onBack: () => void;
  onNavigateToAbout?: () => void;
  onNavigateToTerms?: () => void;
}

export function PrivacyPage({ theme, onThemeToggle, onBack, onNavigateToAbout, onNavigateToTerms }: PrivacyPageProps) {
  const { t, i18n } = useTranslation(['common', 'privacy', 'about']);
  const locale = i18n.language;
  const setLocale = (lang: string) => i18n.changeLanguage(lang);

  // 註：page_view 由 useRouter 統一處理，此處不再額外送（避免雙計）
  const languages = [
    { value: 'zh-TW' as const, label: t('chineseTraditional') },
    { value: 'zh-CN' as const, label: t('chineseSimplified') },
    { value: 'en' as const, label: t('english') },
    { value: 'ja' as const, label: t('japanese') },
    { value: 'ko' as const, label: t('korean') },
  ];

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-950' : 'bg-gray-50'}`}>
      {/* Header Navigation */}
      <div className={`border-b ${theme === 'dark' ? 'bg-black border-gray-800' : 'bg-white border-gray-200'} px-6 py-4`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={onBack}
            className={theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-transparent' : 'text-gray-600 hover:text-black hover:bg-transparent'}
          >
            <ArrowLeft className="size-4 mr-2" />
            {t('about:backToHome')}
          </Button>

          <div className="flex items-center gap-4">
            <Select value={locale} onValueChange={(value: string) => setLocale(value as any)}>
              <SelectTrigger className={`min-w-[140px] ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300'}`}>
                <Globe className="size-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((lang) => (
                  <SelectItem key={lang.value} value={lang.value}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                onThemeToggle();
                logEvent('PrivacyPage', 'toggle_theme', theme === 'dark' ? 'light' : 'dark');
              }}
              className={theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-transparent' : 'text-gray-600 hover:text-black hover:bg-transparent'}
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
            {t('privacy:title')}
          </h1>

          <div className={`flex items-center justify-center gap-8 mb-6 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            <p>
              <strong>{t('privacy:effectiveDate')}</strong>{t('privacy:effectiveDateValue')}
            </p>
            <p>
              <strong>{t('privacy:lastUpdated')}</strong>{t('privacy:lastUpdatedValue')}
            </p>
          </div>

          <p className={`max-w-3xl mx-auto text-lg leading-relaxed ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            {t('privacy:intro')}
          </p>
        </div>

        {/* Privacy Sections */}
        <div className="space-y-8">
          {/* Section 1 */}
          <PolicySection
            theme={theme}
            icon={<Eye className="size-6" />}
            title={t('privacy:section1.title')}
            iconColor="blue"
          >
            <ul className={`list-disc list-inside space-y-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>{t('privacy:section1.item1')}</li>
              <li>{t('privacy:section1.item2')}</li>
              <li>{t('privacy:section1.item3')}</li>
            </ul>
          </PolicySection>

          {/* Section 1.5 */}
          <PolicySection
            theme={theme}
            icon={<Database className="size-6" />}
            title={t('privacy:section1_5.title')}
            iconColor="green"
          >
            <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              {t('privacy:section1_5.intro')}
            </p>
            <ul className={`list-disc list-inside space-y-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>{t('privacy:section1_5.item1')}</li>
              <li>{t('privacy:section1_5.item2')}</li>
              <li>{t('privacy:section1_5.item3')}</li>
              <li>{t('privacy:section1_5.item4')}</li>
              <li>
                {t('privacy:section1_5.item5')}
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
            title={t('privacy:section2.title')}
            iconColor="purple"
          >
            <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              {t('privacy:section2.intro')}
            </p>
            <ul className={`list-disc list-inside space-y-2 mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>{t('privacy:section2.item1')}</li>
              <li>{t('privacy:section2.item2')}</li>
              <li>{t('privacy:section2.item3')}</li>
            </ul>
            <p className={`mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <strong>{t('privacy:section2.youCan')}</strong>
            </p>
            <ul className={`list-disc list-inside space-y-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>{t('privacy:section2.item4')}</li>
              <li>{t('privacy:section2.item5')}</li>
            </ul>
          </PolicySection>

          {/* Section 3 */}
          <PolicySection
            theme={theme}
            icon={<FileText className="size-6" />}
            title={t('privacy:section3.title')}
            iconColor="red"
          >
            <ul className={`list-disc list-inside space-y-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>{t('privacy:section3.item1')}</li>
              <li>{t('privacy:section3.item2')}</li>
              <li>
                {t('privacy:section3.item3')}
                <ul className="list-disc list-inside ml-6 mt-2 space-y-1">
                  <li>
                    {t('privacy:section3.item4')}
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
                    {t('privacy:section3.item5')}
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
            title={t('privacy:section4.title')}
            iconColor="yellow"
          >
            <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              {t('privacy:section4.intro')}
            </p>
            <ul className={`list-disc list-inside space-y-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>{t('privacy:section4.item1')}</li>
              <li>{t('privacy:section4.item2')}</li>
              <li>{t('privacy:section4.item3')}</li>
              <li>{t('privacy:section4.item4')}</li>
              <li>{t('privacy:section4.item5')}</li>
              <li>{t('privacy:section4.item6')}</li>
            </ul>
          </PolicySection>

          {/* Section 5 */}
          <PolicySection
            theme={theme}
            icon={<AlertCircle className="size-6" />}
            title={t('privacy:section5.title')}
            iconColor="orange"
          >
            <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              {t('privacy:section5.intro')}
            </p>
            <ul className={`list-disc list-inside space-y-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>{t('privacy:section5.item1')}</li>
              <li>{t('privacy:section5.item2')}</li>
              <li>
                {t('privacy:section5.item3')}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline ml-1"
                >
                  https://policies.google.com/privacy
                </a>
              </li>
              <li>{t('privacy:section5.item4')}</li>
              <li>{t('privacy:section5.item5')}</li>
            </ul>
          </PolicySection>

          {/* Section 5.5 */}
          <PolicySection
            theme={theme}
            icon={<Shield className="size-6" />}
            title={t('privacy:section5_5.title')}
            iconColor="indigo"
          >
            <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              {t('privacy:section5_5.intro')}
            </p>
            <ul className={`list-disc list-inside space-y-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>{t('privacy:section5_5.item1')}</li>
              <li>{t('privacy:section5_5.item2')}</li>
              <li>{t('privacy:section5_5.item3')}</li>
              <li>{t('privacy:section5_5.item4')}</li>
              <li>{t('privacy:section5_5.item5')}</li>
            </ul>
          </PolicySection>

          {/* Section 6 */}
          <PolicySection
            theme={theme}
            icon={<Users className="size-6" />}
            title={t('privacy:section6.title')}
            iconColor="cyan"
          >
            <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              {t('privacy:section6.intro')}
            </p>
            <ul className={`list-disc list-inside space-y-2 mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>{t('privacy:section6.item1')}</li>
              <li>{t('privacy:section6.item2')}</li>
              <li>{t('privacy:section6.item3')}</li>
              <li>{t('privacy:section6.item4')}</li>
            </ul>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              {t('privacy:section6.contact')}
              <a
                href="mailto:feedback@multistreaming.org"
                className="text-blue-500 hover:underline ml-1"
              >
                feedback@multistreaming.org
              </a>
              {t('privacy:section6.responseTime')}
            </p>
          </PolicySection>

          {/* Section 7 */}
          <PolicySection
            theme={theme}
            icon={<Shield className="size-6" />}
            title={t('privacy:section7.title')}
            iconColor="pink"
          >
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              {t('privacy:section7.content')}
            </p>
          </PolicySection>

          {/* Section 8 */}
          <PolicySection
            theme={theme}
            icon={<FileText className="size-6" />}
            title={t('privacy:section8.title')}
            iconColor="teal"
          >
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              {t('privacy:section8.content')}
            </p>
          </PolicySection>

          {/* Section 9 */}
          <PolicySection
            theme={theme}
            icon={<AlertCircle className="size-6" />}
            title={t('privacy:section9.title')}
            iconColor="purple"
          >
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              {t('privacy:section9.content')}
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
            {t('privacy:footerNote')}
          </p>
        </div>

        {/* Footer Navigation */}
        <footer className={`text-center pt-8 mt-8 border-t ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}>
          <div className="flex justify-center gap-8 mb-6">
            <Button
              variant="link"
              onClick={onBack}
              className={`hover:underline ${theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'}`}
            >
              {t('privacy:home')}
            </Button>
            {onNavigateToAbout && (
              <Button
                variant="link"
                onClick={onNavigateToAbout}
                className={`hover:underline ${theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'}`}
              >
                {t('privacy:about')}
              </Button>
            )}
            {onNavigateToTerms && (
              <Button
                variant="link"
                onClick={onNavigateToTerms}
                className={`hover:underline ${theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'}`}
              >
                {t('privacy:terms')}
              </Button>
            )}
          </div>

          <p className={`text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-600'}`}>
            {t('about:copyright')}
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
