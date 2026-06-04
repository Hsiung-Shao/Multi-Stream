import { ArrowLeft, Globe, Sun, Moon, Shield, Database, Lock, Eye, FileText, Users, AlertCircle, ShieldCheck } from 'lucide-react';
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

  // page_view 由 useRouter 統一發送（Navigation/page_view），這裡不再重複

  const languages = [
    { value: 'zh-TW' as const, label: t('chineseTraditional') },
    { value: 'zh-CN' as const, label: t('chineseSimplified') },
    { value: 'en' as const, label: t('english') },
    { value: 'ja' as const, label: t('japanese') },
    { value: 'ko' as const, label: t('korean') },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header Navigation */}
      <div className="border-b border-border bg-card/80 backdrop-blur-md px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4 mr-2" />
            {t('about:backToHome')}
          </Button>

          <div className="flex items-center gap-4">
            <Select value={locale} onValueChange={(value: string) => setLocale(value as any)}>
              <SelectTrigger className="min-w-[140px]">
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
              className="text-muted-foreground hover:text-foreground"
            >
              {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-16">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-8 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500">
            <Shield className="size-12 text-white" />
          </div>

          <h1 className="mb-4 text-foreground">
            {t('privacy:title')}
          </h1>

          <div className="flex items-center justify-center gap-8 mb-6 text-muted-foreground">
            <p>
              <strong>{t('privacy:effectiveDate')}</strong>{t('privacy:effectiveDateValue')}
            </p>
            <p>
              <strong>{t('privacy:lastUpdated')}</strong>{t('privacy:lastUpdatedValue')}
            </p>
          </div>

          <p className="max-w-3xl mx-auto text-lg leading-relaxed text-muted-foreground">
            {t('privacy:intro')}
          </p>
        </div>

        {/* Local-first highlight (design Pages.jsx) */}
        <div className="mb-12 flex items-start gap-4 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-emerald-500/[0.02] p-6">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-wider text-emerald-500">
              Local first
            </div>
            <h3 className="mb-1.5 text-base font-bold text-foreground">
              {t('privacy:section1_5.title')}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t('privacy:section1_5.intro')}
            </p>
          </div>
        </div>

        {/* Privacy Sections */}
        <div className="space-y-8">
          {/* Section 1 */}
          <PolicySection
            icon={<Eye className="size-6" />}
            title={t('privacy:section1.title')}
            iconColor="blue"
          >
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>{t('privacy:section1.item1')}</li>
              <li>{t('privacy:section1.item2')}</li>
              <li>{t('privacy:section1.item3')}</li>
            </ul>
          </PolicySection>

          {/* Section 1.5 */}
          <PolicySection
            icon={<Database className="size-6" />}
            title={t('privacy:section1_5.title')}
            iconColor="green"
          >
            <p className="mb-4 text-muted-foreground">
              {t('privacy:section1_5.intro')}
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
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
                  className="text-primary hover:underline ml-1"
                >
                  https://policies.google.com/privacy
                </a>
              </li>
            </ul>
          </PolicySection>

          {/* Section 2 */}
          <PolicySection
            icon={<Database className="size-6" />}
            title={t('privacy:section2.title')}
            iconColor="purple"
          >
            <p className="mb-4 text-muted-foreground">
              {t('privacy:section2.intro')}
            </p>
            <ul className="list-disc list-inside space-y-2 mb-4 text-muted-foreground">
              <li>{t('privacy:section2.item1')}</li>
              <li>{t('privacy:section2.item2')}</li>
              <li>{t('privacy:section2.item3')}</li>
            </ul>
            <p className="mb-2 text-muted-foreground">
              <strong>{t('privacy:section2.youCan')}</strong>
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>{t('privacy:section2.item4')}</li>
              <li>{t('privacy:section2.item5')}</li>
            </ul>
          </PolicySection>

          {/* Section 3 */}
          <PolicySection
            icon={<FileText className="size-6" />}
            title={t('privacy:section3.title')}
            iconColor="red"
          >
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
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
                      className="text-primary hover:underline ml-1"
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
                      className="text-primary hover:underline ml-1"
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
            icon={<Lock className="size-6" />}
            title={t('privacy:section4.title')}
            iconColor="yellow"
          >
            <p className="mb-4 text-muted-foreground">
              {t('privacy:section4.intro')}
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
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
            icon={<AlertCircle className="size-6" />}
            title={t('privacy:section5.title')}
            iconColor="orange"
          >
            <p className="mb-4 text-muted-foreground">
              {t('privacy:section5.intro')}
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>{t('privacy:section5.item1')}</li>
              <li>{t('privacy:section5.item2')}</li>
              <li>
                {t('privacy:section5.item3')}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline ml-1"
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
            icon={<Shield className="size-6" />}
            title={t('privacy:section5_5.title')}
            iconColor="indigo"
          >
            <p className="mb-4 text-muted-foreground">
              {t('privacy:section5_5.intro')}
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>{t('privacy:section5_5.item1')}</li>
              <li>{t('privacy:section5_5.item2')}</li>
              <li>{t('privacy:section5_5.item3')}</li>
              <li>{t('privacy:section5_5.item4')}</li>
              <li>{t('privacy:section5_5.item5')}</li>
            </ul>
          </PolicySection>

          {/* Section 6 */}
          <PolicySection
            icon={<Users className="size-6" />}
            title={t('privacy:section6.title')}
            iconColor="cyan"
          >
            <p className="mb-4 text-muted-foreground">
              {t('privacy:section6.intro')}
            </p>
            <ul className="list-disc list-inside space-y-2 mb-4 text-muted-foreground">
              <li>{t('privacy:section6.item1')}</li>
              <li>{t('privacy:section6.item2')}</li>
              <li>{t('privacy:section6.item3')}</li>
              <li>{t('privacy:section6.item4')}</li>
            </ul>
            <p className="text-muted-foreground">
              {t('privacy:section6.contact')}
              <a
                href="mailto:feedback@multistreaming.org"
                className="text-primary hover:underline ml-1"
              >
                feedback@multistreaming.org
              </a>
              {t('privacy:section6.responseTime')}
            </p>
          </PolicySection>

          {/* Section 7 */}
          <PolicySection
            icon={<Shield className="size-6" />}
            title={t('privacy:section7.title')}
            iconColor="pink"
          >
            <p className="text-muted-foreground">
              {t('privacy:section7.content')}
            </p>
          </PolicySection>

          {/* Section 8 */}
          <PolicySection
            icon={<FileText className="size-6" />}
            title={t('privacy:section8.title')}
            iconColor="teal"
          >
            <p className="text-muted-foreground">
              {t('privacy:section8.content')}
            </p>
          </PolicySection>

          {/* Section 9 */}
          <PolicySection
            icon={<AlertCircle className="size-6" />}
            title={t('privacy:section9.title')}
            iconColor="purple"
          >
            <p className="text-muted-foreground">
              {t('privacy:section9.content')}
              <a
                href="mailto:feedback@multistreaming.org"
                className="text-primary hover:underline ml-1"
              >
                feedback@multistreaming.org
              </a>
            </p>
          </PolicySection>
        </div>

        {/* Footer Note */}
        <div className="mt-16 pt-8 border-t border-border">
          <p className="text-sm text-muted-foreground">
            {t('privacy:footerNote')}
          </p>
        </div>

        {/* Footer Navigation */}
        <footer className="text-center pt-8 mt-8 border-t border-border">
          <div className="flex justify-center gap-8 mb-6">
            <Button
              variant="link"
              onClick={onBack}
              className="text-muted-foreground hover:text-foreground hover:underline"
            >
              {t('privacy:home')}
            </Button>
            {onNavigateToAbout && (
              <Button
                variant="link"
                onClick={onNavigateToAbout}
                className="text-muted-foreground hover:text-foreground hover:underline"
              >
                {t('privacy:about')}
              </Button>
            )}
            {onNavigateToTerms && (
              <Button
                variant="link"
                onClick={onNavigateToTerms}
                className="text-muted-foreground hover:text-foreground hover:underline"
              >
                {t('privacy:terms')}
              </Button>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            {t('about:copyright')}
          </p>
        </footer>
      </div>
    </div>
  );
}

// Policy Section Component
interface PolicySectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  iconColor?: 'blue' | 'green' | 'purple' | 'red' | 'yellow' | 'orange' | 'indigo' | 'cyan' | 'pink' | 'teal';
}

function PolicySection({ icon, title, children, iconColor = 'blue' }: PolicySectionProps) {
  const colorMap = {
    blue: 'bg-blue-500/10 text-blue-500',
    green: 'bg-emerald-500/10 text-emerald-500',
    purple: 'bg-purple-500/10 text-purple-500',
    red: 'bg-red-500/10 text-red-500',
    yellow: 'bg-yellow-500/10 text-yellow-500',
    orange: 'bg-orange-500/10 text-orange-500',
    indigo: 'bg-indigo-500/10 text-indigo-500',
    cyan: 'bg-cyan-500/10 text-cyan-500',
    pink: 'bg-pink-500/10 text-pink-500',
    teal: 'bg-teal-500/10 text-teal-500',
  };

  return (
    <section className="p-6 rounded-xl bg-card border border-border">
      <div className="flex items-start gap-4 mb-4">
        <div className={`p-2 rounded-lg flex-shrink-0 ${colorMap[iconColor]}`}>
          {icon}
        </div>
        <h2 className="text-foreground">{title}</h2>
      </div>
      <div className="ml-14">
        {children}
      </div>
    </section>
  );
}
