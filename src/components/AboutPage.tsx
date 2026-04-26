import { ArrowLeft, Globe, Sun, Moon, Tv, Grid, MessageCircle, Volume2, Star, Smartphone, Languages, Shield, Search, Radio, Youtube, Zap, RefreshCw, Code, Radio as Broadcast, Database, Gauge, Users, Mail, MessageSquare } from 'lucide-react';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import { logEvent } from '../utils/analytics';

interface AboutPageProps {
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  onBack: () => void;
  onNavigateToPrivacy?: () => void;
}

export function AboutPage({ theme, onThemeToggle, onBack, onNavigateToPrivacy }: AboutPageProps) {
  const { t, i18n } = useTranslation(['about', 'common']);
  const locale = i18n.language;

  useEffect(() => {
    logEvent('AboutPage', 'page_view');
  }, []);

  const languages = [
    { value: 'zh-TW' as const, label: t('common:chineseTraditional') },
    { value: 'zh-CN' as const, label: t('common:chineseSimplified') },
    { value: 'en' as const, label: t('common:english') },
    { value: 'ja' as const, label: t('common:japanese') },
    { value: 'ko' as const, label: t('common:korean') },
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

          <div className="flex items-center gap-2">
            <Select value={locale} onValueChange={(value: string) => i18n.changeLanguage(value)}>
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
                logEvent('AboutPage', 'toggle_theme', theme === 'dark' ? 'light' : 'dark');
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
          <div className="inline-flex items-center justify-center w-20 h-20 mb-8 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500">
            <div className="relative">
              <div className="absolute inset-0 bg-white rounded-full blur-sm opacity-50"></div>
              <svg className="size-12 text-white relative" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </div>
          </div>

          <p className={`max-w-3xl mx-auto text-lg leading-relaxed ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            {t('about:intro')}
          </p>
        </div>

        {/* Website Intro Section */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-8">
            <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-purple-500/20' : 'bg-purple-100'}`}>
              <MessageSquare className={`size-6 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`} />
            </div>
            <h2 className={theme === 'dark' ? 'text-white' : 'text-black'}>{t('about:websiteIntro')}</h2>
          </div>

          <div className={`p-6 rounded-xl ${theme === 'dark' ? 'bg-gray-900/50' : 'bg-white'}`}>
            <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              {t('about:intro')}
            </p>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              {t('about:intro2')}
            </p>
          </div>
        </section>

        {/* Main Features */}
        <section className="mb-16">
          <h2 className={`mb-8 text-center ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
            {t('about:featuresTitle')}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard
              theme={theme}
              icon={<Tv className="size-6" />}
              title={t('about:feature1.title')}
              description={t('about:feature1.description')}
              gradient="from-pink-500 to-purple-500"
              large
            />

            <FeatureCard
              theme={theme}
              icon={<Grid className="size-6" />}
              title={t('about:feature2.title')}
              description={t('about:feature2.description')}
            />

            <FeatureCard
              theme={theme}
              icon={<MessageCircle className="size-6" />}
              title={t('about:feature3.title')}
              description={t('about:feature3.description')}
            />

            <FeatureCard
              theme={theme}
              icon={<Volume2 className="size-6" />}
              title={t('about:feature4.title')}
              description={t('about:feature4.description')}
            />

            <FeatureCard
              theme={theme}
              icon={<Star className="size-6" />}
              title={t('about:feature5.title')}
              description={t('about:feature5.description')}
            />

            <FeatureCard
              theme={theme}
              icon={<Smartphone className="size-6" />}
              title={t('about:feature6.title')}
              description={t('about:feature6.description')}
              gradient="from-purple-500 to-indigo-500"
            />

            <FeatureCard
              theme={theme}
              icon={<Languages className="size-6" />}
              title={t('about:feature7.title')}
              description={t('about:feature7.description')}
              gradient="from-blue-500 to-cyan-500"
            />

            <FeatureCard
              theme={theme}
              icon={<Shield className="size-6" />}
              title={t('about:feature8.title')}
              description={t('about:feature8.description')}
              gradient="from-pink-600 to-red-600"
            />

            <FeatureCard
              theme={theme}
              icon={<Search className="size-6" />}
              title={t('about:feature9.title')}
              description={t('about:feature9.description')}
              gradient="from-purple-600 to-purple-800"
            />

            <FeatureCard
              theme={theme}
              icon={<Radio className="size-6" />}
              title={t('about:feature10.title')}
              description={t('about:feature10.description')}
              gradient="from-blue-600 to-indigo-700"
            />

            <FeatureCard
              theme={theme}
              icon={<Youtube className="size-6" />}
              title={t('about:feature11.title')}
              description={t('about:feature11.description')}
            />

            <FeatureCard
              theme={theme}
              icon={<Zap className="size-6" />}
              title={t('about:feature12.title')}
              description={t('about:feature12.description')}
              gradient="from-purple-500 to-pink-500"
            />

            <FeatureCard
              theme={theme}
              icon={<RefreshCw className="size-6" />}
              title={t('about:feature13.title')}
              description={t('about:feature13.description')}
            />
          </div>
        </section>

        {/* Technical Features */}
        <section className="mb-16">
          <h2 className={`mb-8 text-center ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
            {t('about:techTitle')}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TechFeatureCard
              theme={theme}
              icon={<Code className="size-6 text-blue-400" />}
              title={t('about:tech1.title')}
              description={t('about:tech1.description')}
            />

            <TechFeatureCard
              theme={theme}
              icon={<Broadcast className="size-6 text-purple-400" />}
              title={t('about:tech2.title')}
              description={t('about:tech2.description')}
            />

            <TechFeatureCard
              theme={theme}
              icon={<Database className="size-6 text-green-400" />}
              title={t('about:tech3.title')}
              description={t('about:tech3.description')}
            />

            <TechFeatureCard
              theme={theme}
              icon={<Globe className="size-6 text-cyan-400" />}
              title={t('about:tech4.title')}
              description={t('about:tech4.description')}
            />

            <TechFeatureCard
              theme={theme}
              icon={<Gauge className="size-6 text-orange-400" />}
              title={t('about:tech5.title')}
              description={t('about:tech5.description')}
            />
          </div>
        </section>

        {/* Creator Info */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-8">
            <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
              <Users className={`size-6 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} />
            </div>
            <h2 className={theme === 'dark' ? 'text-white' : 'text-black'}>{t('about:creatorTitle')}</h2>
          </div>

          <div className={`p-6 rounded-xl ${theme === 'dark' ? 'bg-gray-900/50' : 'bg-white'}`}>
            <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              {t('about:creatorInfo1')}
            </p>
            <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              {t('about:creatorInfo2')}
            </p>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              {t('about:creatorInfo3')}
            </p>
          </div>
        </section>

        {/* Contact Us */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-8">
            <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-purple-500/20' : 'bg-purple-100'}`}>
              <MessageSquare className={`size-6 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`} />
            </div>
            <h2 className={theme === 'dark' ? 'text-white' : 'text-black'}>{t('about:contactTitle')}</h2>
          </div>

          <div className={`p-6 rounded-xl ${theme === 'dark' ? 'bg-gray-900/50' : 'bg-white'}`}>
            <p className={`mb-6 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              {t('about:contactIntro')}
            </p>

            <div className="space-y-4">
              <a
                href="https://forms.gle/AjG922YrXFbyAdBa6"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => logEvent('AboutPage', 'click_social', 'feedback_form')}
                className={`flex items-start gap-4 p-4 rounded-lg transition-colors ${theme === 'dark'
                  ? 'bg-gray-800 hover:bg-gray-750'
                  : 'bg-gray-50 hover:bg-gray-100'
                  }`}
              >
                <Mail className={`size-6 flex-shrink-0 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} />
                <div>
                  <h3 className={`mb-1 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                    {t('about:feedbackForm')}
                  </h3>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {t('about:feedbackFormDesc')}
                  </p>
                </div>
              </a>

              <a
                href="https://discord.gg/47kauArepY"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => logEvent('AboutPage', 'click_social', 'discord')}
                className={`flex items-start gap-4 p-4 rounded-lg transition-colors ${theme === 'dark'
                  ? 'bg-gray-800 hover:bg-gray-750'
                  : 'bg-gray-50 hover:bg-gray-100'
                  }`}
              >
                <MessageSquare className={`size-6 flex-shrink-0 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`} />
                <div>
                  <h3 className={`mb-1 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                    {t('about:discordCommunity')}
                  </h3>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {t('about:discordCommunityDesc')}
                  </p>
                </div>
              </a>
            </div>
          </div>
        </section>

        {/* Terms of Use */}
        <section className="mb-16">
          <h2 className={`mb-8 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
            {t('about:termsTitle')}
          </h2>

          <div className={`p-6 rounded-xl ${theme === 'dark' ? 'bg-gray-900/50' : 'bg-white'}`}>
            <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              {t('about:terms1')}
            </p>
            <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              {t('about:terms2')}
            </p>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              {t('about:terms3')}
            </p>
          </div>
        </section>

        {/* Privacy & Security */}
        <section className="mb-16">
          <h2 className={`mb-8 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
            {t('about:privacyTitle')}
          </h2>

          <div className={`p-6 rounded-xl ${theme === 'dark' ? 'bg-gray-900/50' : 'bg-white'}`}>
            <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              {t('about:privacy1')}
            </p>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              {t('about:privacy2')}: {t('about:privacyPolicy')}
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className={`text-center pt-8 border-t ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}>
          <div className="flex justify-center gap-8 mb-6">
            <Button
              variant="link"
              onClick={onBack}
              className={`hover:underline ${theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'}`}
            >
              {t('about:home')}
            </Button>
            {onNavigateToPrivacy && (
              <Button
                variant="link"
                onClick={onNavigateToPrivacy}
                className={`hover:underline ${theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'}`}
              >
                {t('about:privacyPolicy')}
              </Button>
            )}
            <a
              href="https://forms.gle/AjG922YrXFbyAdBa6"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => logEvent('AboutPage', 'click_social', 'feedback_footer')}
              className={`hover:underline ${theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'}`}
            >
              {t('about:giveFeedback')}
            </a>
          </div>

          <p className={`text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-600'}`}>
            {t('about:copyright')}
          </p>
          <p className={`text-sm mt-1 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-500'}`}>
            {t('about:lastUpdated')}
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
    <div className={`p-6 rounded-xl border transition-all hover:scale-105 ${theme === 'dark'
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