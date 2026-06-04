import { ArrowLeft, Globe, Sun, Moon, Tv, Grid, MessageCircle, Volume2, Star, Smartphone, Languages, Shield, Search, Radio, Youtube, Zap, RefreshCw, Code, Radio as Broadcast, Database, Gauge, Users, Mail, MessageSquare } from 'lucide-react';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useTranslation } from 'react-i18next';
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

  // page_view 由 useRouter 統一發送（Navigation/page_view），這裡不再重複

  const languages = [
    { value: 'zh-TW' as const, label: t('common:chineseTraditional') },
    { value: 'zh-CN' as const, label: t('common:chineseSimplified') },
    { value: 'en' as const, label: t('common:english') },
    { value: 'ja' as const, label: t('common:japanese') },
    { value: 'ko' as const, label: t('common:korean') },
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

          <div className="flex items-center gap-2">
            <Select value={locale} onValueChange={(value: string) => i18n.changeLanguage(value)}>
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
                logEvent('AboutPage', 'toggle_theme', theme === 'dark' ? 'light' : 'dark');
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
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-8 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500">
            <div className="relative">
              <div className="absolute inset-0 bg-white rounded-full blur-sm opacity-50"></div>
              <svg className="size-12 text-white relative" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </div>
          </div>

          <p className="max-w-3xl mx-auto text-lg leading-relaxed text-muted-foreground">
            {t('about:intro')}
          </p>
        </div>

        {/* Website Intro Section */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 rounded-lg bg-primary/10">
              <MessageSquare className="size-6 text-primary" />
            </div>
            <h2 className="text-foreground">{t('about:websiteIntro')}</h2>
          </div>

          <div className="p-6 rounded-xl bg-card border border-border">
            <p className="mb-4 text-muted-foreground">
              {t('about:intro')}
            </p>
            <p className="text-muted-foreground">
              {t('about:intro2')}
            </p>
          </div>
        </section>

        {/* Main Features */}
        <section className="mb-16">
          <h2 className="mb-8 text-center text-foreground">
            {t('about:featuresTitle')}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard
              icon={<Tv className="size-6" />}
              title={t('about:feature1.title')}
              description={t('about:feature1.description')}
              gradient="from-pink-500 to-purple-500"
              large
            />

            <FeatureCard
              icon={<Grid className="size-6" />}
              title={t('about:feature2.title')}
              description={t('about:feature2.description')}
            />

            <FeatureCard
              icon={<MessageCircle className="size-6" />}
              title={t('about:feature3.title')}
              description={t('about:feature3.description')}
            />

            <FeatureCard
              icon={<Volume2 className="size-6" />}
              title={t('about:feature4.title')}
              description={t('about:feature4.description')}
            />

            <FeatureCard
              icon={<Star className="size-6" />}
              title={t('about:feature5.title')}
              description={t('about:feature5.description')}
            />

            <FeatureCard
              icon={<Smartphone className="size-6" />}
              title={t('about:feature6.title')}
              description={t('about:feature6.description')}
              gradient="from-purple-500 to-indigo-500"
            />

            <FeatureCard
              icon={<Languages className="size-6" />}
              title={t('about:feature7.title')}
              description={t('about:feature7.description')}
              gradient="from-blue-500 to-cyan-500"
            />

            <FeatureCard
              icon={<Shield className="size-6" />}
              title={t('about:feature8.title')}
              description={t('about:feature8.description')}
              gradient="from-pink-600 to-red-600"
            />

            <FeatureCard
              icon={<Search className="size-6" />}
              title={t('about:feature9.title')}
              description={t('about:feature9.description')}
              gradient="from-purple-600 to-purple-800"
            />

            <FeatureCard
              icon={<Radio className="size-6" />}
              title={t('about:feature10.title')}
              description={t('about:feature10.description')}
              gradient="from-blue-600 to-indigo-700"
            />

            <FeatureCard
              icon={<Youtube className="size-6" />}
              title={t('about:feature11.title')}
              description={t('about:feature11.description')}
            />

            <FeatureCard
              icon={<Zap className="size-6" />}
              title={t('about:feature12.title')}
              description={t('about:feature12.description')}
              gradient="from-purple-500 to-pink-500"
            />

            <FeatureCard
              icon={<RefreshCw className="size-6" />}
              title={t('about:feature13.title')}
              description={t('about:feature13.description')}
            />
          </div>
        </section>

        {/* Technical Features */}
        <section className="mb-16">
          <h2 className="mb-8 text-center text-foreground">
            {t('about:techTitle')}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TechFeatureCard
              icon={<Code className="size-6 text-blue-400" />}
              title={t('about:tech1.title')}
              description={t('about:tech1.description')}
            />

            <TechFeatureCard
              icon={<Broadcast className="size-6 text-purple-400" />}
              title={t('about:tech2.title')}
              description={t('about:tech2.description')}
            />

            <TechFeatureCard
              icon={<Database className="size-6 text-green-400" />}
              title={t('about:tech3.title')}
              description={t('about:tech3.description')}
            />

            <TechFeatureCard
              icon={<Globe className="size-6 text-cyan-400" />}
              title={t('about:tech4.title')}
              description={t('about:tech4.description')}
            />

            <TechFeatureCard
              icon={<Gauge className="size-6 text-orange-400" />}
              title={t('about:tech5.title')}
              description={t('about:tech5.description')}
            />
          </div>
        </section>

        {/* Creator Info */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Users className="size-6 text-blue-500" />
            </div>
            <h2 className="text-foreground">{t('about:creatorTitle')}</h2>
          </div>

          <div className="p-6 rounded-xl bg-card border border-border">
            <p className="mb-4 text-muted-foreground">
              {t('about:creatorInfo1')}
            </p>
            <p className="mb-4 text-muted-foreground">
              {t('about:creatorInfo2')}
            </p>
            <p className="text-muted-foreground">
              {t('about:creatorInfo3')}
            </p>
          </div>
        </section>

        {/* Contact Us */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 rounded-lg bg-primary/10">
              <MessageSquare className="size-6 text-primary" />
            </div>
            <h2 className="text-foreground">{t('about:contactTitle')}</h2>
          </div>

          <div className="p-6 rounded-xl bg-card border border-border">
            <p className="mb-6 text-muted-foreground">
              {t('about:contactIntro')}
            </p>

            <div className="space-y-4">
              <a
                href="https://forms.gle/AjG922YrXFbyAdBa6"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => logEvent('AboutPage', 'click_social', 'feedback_form')}
                className="flex items-start gap-4 p-4 rounded-lg bg-muted hover:bg-accent transition-colors"
              >
                <Mail className="size-6 flex-shrink-0 text-blue-500" />
                <div>
                  <h3 className="mb-1 text-foreground">
                    {t('about:feedbackForm')}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t('about:feedbackFormDesc')}
                  </p>
                </div>
              </a>

              <a
                href="https://discord.gg/47kauArepY"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => logEvent('AboutPage', 'click_social', 'discord')}
                className="flex items-start gap-4 p-4 rounded-lg bg-muted hover:bg-accent transition-colors"
              >
                <MessageSquare className="size-6 flex-shrink-0 text-primary" />
                <div>
                  <h3 className="mb-1 text-foreground">
                    {t('about:discordCommunity')}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t('about:discordCommunityDesc')}
                  </p>
                </div>
              </a>
            </div>
          </div>
        </section>

        {/* Terms of Use */}
        <section className="mb-16">
          <h2 className="mb-8 text-foreground">
            {t('about:termsTitle')}
          </h2>

          <div className="p-6 rounded-xl bg-card border border-border">
            <p className="mb-4 text-muted-foreground">
              {t('about:terms1')}
            </p>
            <p className="mb-4 text-muted-foreground">
              {t('about:terms2')}
            </p>
            <p className="text-muted-foreground">
              {t('about:terms3')}
            </p>
          </div>
        </section>

        {/* Privacy & Security */}
        <section className="mb-16">
          <h2 className="mb-8 text-foreground">
            {t('about:privacyTitle')}
          </h2>

          <div className="p-6 rounded-xl bg-card border border-border">
            <p className="mb-4 text-muted-foreground">
              {t('about:privacy1')}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('about:privacy2')}: {t('about:privacyPolicy')}
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center pt-8 border-t border-border">
          <div className="flex justify-center gap-8 mb-6">
            <Button
              variant="link"
              onClick={onBack}
              className="text-muted-foreground hover:text-foreground hover:underline"
            >
              {t('about:home')}
            </Button>
            {onNavigateToPrivacy && (
              <Button
                variant="link"
                onClick={onNavigateToPrivacy}
                className="text-muted-foreground hover:text-foreground hover:underline"
              >
                {t('about:privacyPolicy')}
              </Button>
            )}
            <a
              href="https://forms.gle/AjG922YrXFbyAdBa6"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => logEvent('AboutPage', 'click_social', 'feedback_footer')}
              className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              {t('about:giveFeedback')}
            </a>
          </div>

          <p className="text-sm text-muted-foreground">
            {t('about:copyright')}
          </p>
          <p className="text-sm mt-1 text-muted-foreground">
            {t('about:lastUpdated')}
          </p>
        </footer>
      </div>
    </div>
  );
}

// Feature Card Component
interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  gradient?: string;
  large?: boolean;
}

function FeatureCard({ icon, title, description, gradient, large }: FeatureCardProps) {
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
    <div className="p-6 rounded-xl bg-card border border-border transition-all hover:scale-105 hover:border-primary/50">
      <div className="flex items-start gap-4">
        <div className="p-2 rounded-lg flex-shrink-0 bg-muted">
          <div className="text-primary">{icon}</div>
        </div>
        <div>
          <h3 className="mb-2 text-foreground">{title}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

// Tech Feature Card Component
interface TechFeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function TechFeatureCard({ icon, title, description }: TechFeatureCardProps) {
  return (
    <div className="p-6 rounded-xl bg-card border border-border">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">{icon}</div>
        <div>
          <h3 className="mb-2 text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}
