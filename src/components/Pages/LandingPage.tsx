import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../store/useUIStore';
import { Button } from '../ui/button';
import { MonitorPlay, MessageSquare, Layout, Zap, ArrowRight, Github, Twitch, Youtube, HelpCircle, BookOpen, Check, Trophy, Users, Laptop, Sun, Moon, Globe, UserRound, LogOut, Pencil, Settings, MessageSquareHeart } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { SEO } from '../SEO';
import { useAuthContext } from '../../contexts/AuthContext';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { EditProfileDialog } from '../Dialogs/EditProfileDialog';

export function LandingPage() {
    const { t, i18n } = useTranslation();
    const setPage = useUIStore(s => s.setPage);
    const theme = useUIStore(s => s.theme);
    const toggleTheme = useUIStore(s => s.toggleTheme);
    const openModal = useUIStore(s => s.openModal);
    const { isLoggedIn, profile, logout } = useAuthContext();
    const [editProfileOpen, setEditProfileOpen] = useState(false);

    const languages = [
        { value: 'zh-TW', label: '繁體中文' },
        { value: 'zh-CN', label: '簡體中文' },
        { value: 'en', label: 'English' },
        { value: 'ja', label: '日本語' },
        { value: 'ko', label: '한국어' },
    ];


    return (
        <>
        <div className="min-h-screen bg-background text-foreground flex flex-col overflow-x-hidden selection:bg-primary selection:text-primary-foreground">
            <SEO
                title={t('seo:home.title')}
                description={t('seo:home.description')}
                keywords={t('seo:home.keywords')}
                pathWithoutLang="/"
            />
            <FaqJsonLd />

            {/* Header */}
            <header className="fixed top-0 w-full z-50 border-b border-white/10 bg-background/80 backdrop-blur-md">
                <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <img src="/icon.png" alt="MultiStream Hub" width="40" height="40" className="w-10 h-10 rounded-lg shadow-lg" />
                        <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                            MultiStream Hub
                        </span>
                    </div>
                    <nav className="flex items-center gap-1 sm:gap-2">
                        <Button variant="ghost" size="sm" className="hidden sm:inline-flex text-muted-foreground hover:text-foreground text-sm" onClick={() => setPage('about')}>
                            {t('landing.footer.about')}
                        </Button>
                        <Button variant="ghost" size="sm" className="hidden sm:inline-flex text-muted-foreground hover:text-foreground text-sm" onClick={() => setPage('instructions')}>
                            {t('landing.footer.tutorial')}
                        </Button>
                        <Button variant="ghost" size="sm" className="hidden sm:inline-flex text-muted-foreground hover:text-foreground text-sm" onClick={() => setPage('faq')}>
                            {t('landing.footer.faq')}
                        </Button>
                        <Button variant="ghost" size="sm" className="hidden sm:inline-flex text-muted-foreground hover:text-foreground text-sm gap-1.5" onClick={() => setPage('recommendations')}>
                            {t('landing.footer.recommendations', '推薦')}
                            <span className="px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-pink-500/15 text-pink-400 border border-pink-500/30">New</span>
                        </Button>
                        <a
                            href="https://github.com/Hsiung-Shao/Multi-Stream"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground transition-colors p-2"
                        >
                            <Github className="w-5 h-5" />
                        </a>
                        {isLoggedIn && profile ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="rounded-full">
                                        <Avatar className="w-7 h-7">
                                            <AvatarImage src={profile.avatar_url || undefined} />
                                            <AvatarFallback className="text-xs">{profile.display_name?.[0] || 'U'}</AvatarFallback>
                                        </Avatar>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>{profile.display_name || '使用者'}</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onSelect={() => setEditProfileOpen(true)}>
                                        <Pencil className="w-4 h-4 mr-2" />
                                        {t('common:editDisplayName', '修改名稱')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => setPage('account')}>
                                        <Settings className="w-4 h-4 mr-2" />
                                        {t('account:menuLabel', '帳號設定')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => openModal('feedback')}>
                                        <MessageSquareHeart className="w-4 h-4 mr-2" />
                                        {t('navbar:feedback', '意見回饋')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => logout()}>
                                        <LogOut className="w-4 h-4 mr-2" />
                                        {t('auth:logout', '登出')}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openModal('login')}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <UserRound className="w-5 h-5" />
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleTheme}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                        </Button>
                        <Button
                            onClick={() => setPage('canvas')}
                            className="font-semibold"
                        >
                            {t('landing.start_button')}
                        </Button>
                    </nav>
                </div>
            </header>

            {/* Hero Section */}
            <main className="flex-1 flex flex-col">
                <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden">
                    {/* Background Effects */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] opacity-30 pointer-events-none">
                        <div className="absolute inset-0 bg-gradient-to-b from-primary/40 to-transparent blur-[100px] rounded-full" />
                    </div>

                    <div className="container mx-auto px-4 relative z-10 text-center">
                        <div className="animate-fade-in-up duration-700">
                            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6">
                                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-200 to-gray-400 pb-2">
                                    {t('landing.hero_title')}
                                </span>
                            </h1>
                            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-10 leading-relaxed">
                                {t('landing.hero_subtitle')}
                            </p>

                            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                <Button
                                    size="lg"
                                    className="h-14 px-8 text-lg rounded-full group bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all hover:scale-105"
                                    onClick={() => setPage('canvas')}
                                    id="landing-start-btn"
                                >
                                    {t('landing.start_button')}
                                    <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </Button>
                            </div>
                        </div>

                        {/* Feature Preview / UI Mockup placeholder */}
                        {/* min-h 預留 hero mockup 空間，避免下方 features 區段 fade-in 動畫造成 layout shift（CLS） */}
                        <div className="mt-20 relative animate-fade-in-up delay-200 duration-1000 min-h-[260px] md:min-h-[400px]">
                            <div className="relative rounded-xl border border-white/10 bg-black/40 backdrop-blur-sm shadow-2xl p-2 md:p-4 max-w-5xl mx-auto overflow-hidden group">
                                <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent z-10 h-32 bottom-0 w-full" />
                                {/* Conceptual UI representation */}
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4 opacity-80 group-hover:opacity-100 transition-opacity duration-500">
                                    {[1, 2, 3].map((i) => (
                                        <div key={i} className="aspect-video bg-gray-800/50 rounded-lg border border-white/5 animate-pulse" style={{ animationDuration: `${i * 2}s` }} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Features Section */}
                <section className="py-20 bg-secondary/20">
                    <div className="container mx-auto px-4">
                        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                            <FeatureCard
                                icon={<MonitorPlay className="w-8 h-8 text-blue-400" />}
                                title={t('landing.feature.multiview')}
                                desc={t('landing.feature.multiview_desc')}
                                delay="0"
                            />
                            <FeatureCard
                                icon={<MessageSquare className="w-8 h-8 text-green-400" />}
                                title={t('landing.feature.chat')}
                                desc={t('landing.feature.chat_desc')}
                                delay="100"
                            />
                            <FeatureCard
                                icon={<Layout className="w-8 h-8 text-purple-400" />}
                                title={t('landing.feature.layout')}
                                desc={t('landing.feature.layout_desc')}
                                delay="200"
                            />
                            <FeatureCard
                                icon={<Zap className="w-8 h-8 text-yellow-400" />}
                                title={t('landing.feature.performance')}
                                desc={t('landing.feature.performance_desc')}
                                delay="300"
                            />
                        </div>
                    </div>
                </section>

                {/* Use Cases Section */}
                <section className="py-20 bg-background relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
                    <div className="container mx-auto px-4 relative z-10">
                        <div className="text-center mb-16">
                            <h2 className="text-3xl md:text-4xl font-bold mb-4">{t('landing.usecases.title')}</h2>
                        </div>
                        <div className="grid md:grid-cols-3 gap-8">
                            <UseCaseCard
                                icon={<Trophy className="w-10 h-10 text-yellow-500" />}
                                title={t('landing.usecases.esports')}
                                desc={t('landing.usecases.esports_desc')}
                                delay="0"
                            />
                            <UseCaseCard
                                icon={<Users className="w-10 h-10 text-pink-500" />}
                                title={t('landing.usecases.collabs')}
                                desc={t('landing.usecases.collabs_desc')}
                                delay="100"
                            />
                            <UseCaseCard
                                icon={<Laptop className="w-10 h-10 text-blue-500" />}
                                title={t('landing.usecases.multitasking')}
                                desc={t('landing.usecases.multitasking_desc')}
                                delay="200"
                            />
                        </div>
                    </div>
                </section>

                {/* How it Works Section */}
                <section className="py-20 border-y border-white/5">
                    <div className="container mx-auto px-4">
                        <h2 className="text-3xl font-bold text-center mb-16">{t('landing.howto.title')}</h2>
                        <div className="grid md:grid-cols-3 gap-8 relative">
                            {/* Connecting Line (Mobile Hidden) */}
                            <div className="hidden md:block absolute top-12 left-[20%] right-[20%] h-0.5 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

                            <HowToStep
                                step="1"
                                icon={<BookOpen className="w-6 h-6" />}
                                title={t('landing.howto.step1')}
                                desc={t('landing.howto.step1_desc')}
                            />
                            <HowToStep
                                step="2"
                                icon={<Layout className="w-6 h-6" />}
                                title={t('landing.howto.step2')}
                                desc={t('landing.howto.step2_desc')}
                            />
                            <HowToStep
                                step="3"
                                icon={<MonitorPlay className="w-6 h-6" />}
                                title={t('landing.howto.step3')}
                                desc={t('landing.howto.step3_desc')}
                            />
                        </div>
                    </div>
                </section>

                {/* Supported Platforms Section */}
                <section className="py-20 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/50 pointer-events-none" />
                    <div className="container mx-auto px-4 relative z-10 text-center">
                        <h2 className="text-3xl md:text-4xl font-bold mb-12 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-red-600">
                            {t('landing.platforms.title')}
                        </h2>
                        <div className="flex flex-col md:flex-row items-center justify-center gap-12 font-bold mb-12">
                            {/* Twitch */}
                            <div className="flex flex-col items-center gap-4 group">
                                <div className="p-6 rounded-2xl bg-[#9146FF]/10 border border-[#9146FF]/20 flex items-center justify-center shadow-lg shadow-purple-900/10 group-hover:scale-110 transition-transform duration-300">
                                    <Twitch className="w-16 h-16 text-[#9146FF]" />
                                </div>
                                <span className="text-xl text-[#9146FF]">{t('landing.platforms.twitch')}</span>
                            </div>

                            <div className="text-4xl text-muted-foreground/30 font-light">+</div>

                            {/* YouTube */}
                            <div className="flex flex-col items-center gap-4 group">
                                <div className="p-6 rounded-2xl bg-[#FF0000]/10 border border-[#FF0000]/20 flex items-center justify-center shadow-lg shadow-red-900/10 group-hover:scale-110 transition-transform duration-300">
                                    <Youtube className="w-16 h-16 text-[#FF0000]" />
                                </div>
                                <span className="text-xl text-[#FF0000]">{t('landing.platforms.youtube')}</span>
                            </div>
                        </div>
                        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                            {t('landing.platforms.desc')}
                        </p>
                    </div>
                </section>

                {/* Privacy & Stats */}
                <section className="py-20 bg-secondary/10">
                    <div className="container mx-auto px-4">
                        <div className="grid md:grid-cols-2 gap-12 items-center">
                            <div className="order-2 md:order-1">
                                <div className="bg-card/30 rounded-2xl p-8 border border-white/5 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-4 opacity-10">
                                        <Layout className="w-40 h-40" />
                                    </div>
                                    <div className="relative z-10 space-y-4">
                                        <div className="flex items-center gap-3 text-green-400 mb-6">
                                            <div className="p-2 bg-green-400/10 rounded-full">
                                                <Zap className="w-6 h-6" />
                                            </div>
                                            <span className="font-semibold tracking-wider text-sm uppercase">Local First</span>
                                        </div>
                                        <h3 className="text-2xl font-bold">{t('landing.privacy.title')}</h3>
                                        <p className="text-muted-foreground leading-relaxed">
                                            {t('landing.privacy.desc')}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="order-1 md:order-2 space-y-6">
                                <h3 className="text-3xl font-bold mb-4">{t('landing.favorites.title')}</h3>
                                <p className="text-lg text-muted-foreground mb-6">
                                    {t('landing.favorites.desc')}
                                </p>
                                <ul className="space-y-4">
                                    <li className="flex items-center gap-3">
                                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary">
                                            <Check className="w-4 h-4" />
                                        </div>
                                        <span className="text-foreground/80">Twitch Follows Import</span>
                                    </li>
                                    <li className="flex items-center gap-3">
                                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary">
                                            <Check className="w-4 h-4" />
                                        </div>
                                        <span className="text-foreground/80">Custom Grouping</span>
                                    </li>

                                </ul>
                            </div>
                        </div>
                    </div>
                </section>

                {/* FAQ Section */}
                <section className="py-20 border-t border-white/5">
                    <div className="container mx-auto px-4 max-w-3xl">
                        <div className="text-center mb-12">
                            <h2 className="text-3xl font-bold flex items-center justify-center gap-2">
                                <HelpCircle className="w-8 h-8 text-primary" />
                                {t('landing.faq.title')}
                            </h2>
                        </div>
                        <Accordion type="single" collapsible className="w-full">
                            <AccordionItem value="item-brave">
                                <AccordionTrigger>{t('landing.faq.q_brave')}</AccordionTrigger>
                                <AccordionContent className="text-muted-foreground">
                                    {t('landing.faq.a_brave')}
                                    <Button
                                        variant="link"
                                        className="px-1 h-auto text-primary"
                                        onClick={() => setPage('faq')}
                                    >
                                        {t('landing.faq.brave_link')}
                                    </Button>
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem value="item-1">
                                <AccordionTrigger>{t('landing.faq.q1')}</AccordionTrigger>
                                <AccordionContent className="text-muted-foreground">
                                    {t('landing.faq.a1')}
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem value="item-2">
                                <AccordionTrigger>{t('landing.faq.q2')}</AccordionTrigger>
                                <AccordionContent className="text-muted-foreground">
                                    {t('landing.faq.a2')}
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem value="item-3">
                                <AccordionTrigger>{t('landing.faq.q3')}</AccordionTrigger>
                                <AccordionContent className="text-muted-foreground">
                                    {t('landing.faq.a3')}
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </div>
                </section>

                {/* CTA Section */}
                <section className="py-32 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-t from-primary/10 via-transparent to-transparent opacity-50" />
                    <div className="container mx-auto px-4 text-center relative z-10">
                        <h2 className="text-4xl md:text-5xl font-bold mb-8">
                            {t('landing.cta.title')}
                        </h2>
                        <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto">
                            {t('landing.cta.desc')}
                        </p>
                        <Button
                            size="lg"
                            className="h-16 px-10 text-xl rounded-full shadow-2xl shadow-primary/30 hover:scale-105 transition-transform"
                            onClick={() => setPage('canvas')}
                        >
                            {t('landing.start_button')}
                        </Button>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="py-8 border-t border-white/10 bg-background text-center text-muted-foreground text-sm">
                <div className="container mx-auto px-4 flex flex-col gap-4">
                    {/* Mobile-only nav links (hidden on sm+, shown in header there) */}
                    <div className="flex flex-wrap justify-center gap-4 sm:hidden">
                        <Button variant="link" size="sm" className="text-muted-foreground hover:text-foreground text-xs" onClick={() => setPage('about')}>
                            {t('landing.footer.about')}
                        </Button>
                        <Button variant="link" size="sm" className="text-muted-foreground hover:text-foreground text-xs" onClick={() => setPage('instructions')}>
                            {t('landing.footer.tutorial')}
                        </Button>
                        <Button variant="link" size="sm" className="text-muted-foreground hover:text-foreground text-xs" onClick={() => setPage('faq')}>
                            {t('landing.footer.faq')}
                        </Button>
                        <Button variant="link" size="sm" className="text-muted-foreground hover:text-foreground text-xs gap-1" onClick={() => setPage('recommendations')}>
                            {t('landing.footer.recommendations', '推薦')}
                            <span className="px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-pink-500/15 text-pink-400 border border-pink-500/30">New</span>
                        </Button>
                        <Button variant="link" size="sm" className="text-muted-foreground hover:text-foreground text-xs" onClick={() => setPage('privacy')}>
                            {t('landing.footer.privacy')}
                        </Button>
                        <Button variant="link" size="sm" className="text-muted-foreground hover:text-foreground text-xs" onClick={() => openModal('feedback')}>
                            {t('navbar:feedback', '意見回饋')}
                        </Button>
                    </div>
                    <div className="flex flex-col gap-2">
                        <p>{t('landing.footer.copyright')}</p>
                        <p className="text-xs opacity-50 max-w-2xl mx-auto">
                            {t('landing.footer.disclaimer')}
                        </p>
                    </div>

                    {/* Language Switcher */}
                    <div className="flex justify-center mt-4">
                        <Select value={i18n.language} onValueChange={(value: string) => i18n.changeLanguage(value)}>
                            <SelectTrigger className="w-[140px] h-9 bg-background/50 border-white/10">
                                <div className="flex items-center gap-2">
                                    <Globe className="w-4 h-4" />
                                    <SelectValue />
                                </div>
                            </SelectTrigger>
                            <SelectContent>
                                {languages.map((lang) => (
                                    <SelectItem key={lang.value} value={lang.value}>
                                        {lang.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </footer>
        </div>

        <EditProfileDialog open={editProfileOpen} onClose={() => setEditProfileOpen(false)} />
        </>
    );
}

function FeatureCard({ icon, title, desc, delay }: { icon: React.ReactNode, title: string, desc: string, delay: string }) {
    return (
        <div
            className="p-6 rounded-2xl bg-card/50 border border-white/5 hover:border-primary/50 hover:bg-card transition-all duration-300 hover:-translate-y-1 group animate-fade-in-up"
            style={{ animationDelay: `${delay}ms` }}
        >
            <div className="mb-4 p-3 rounded-lg bg-secondary/50 inline-block group-hover:scale-110 transition-transform duration-300">
                {icon}
            </div>
            <h3 className="text-xl font-bold mb-2 text-foreground">{title}</h3>
            <p className="text-muted-foreground leading-relaxed">{desc}</p>
        </div>
    );
}

function HowToStep({ step, icon, title, desc }: { step: string, icon: React.ReactNode, title: string, desc: string }) {
    return (
        <div className="relative text-center group">
            <div className="w-16 h-16 mx-auto rounded-full bg-secondary border border-white/10 flex items-center justify-center mb-6 relative z-10 group-hover:scale-110 group-hover:bg-primary group-hover:border-primary transition-all duration-300">
                <div className="text-foreground group-hover:text-white transition-colors duration-300">
                    {icon}
                </div>
                <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold border-2 border-background">
                    {step}
                </div>
            </div>
            <h3 className="text-xl font-bold mb-2">{title}</h3>
            <p className="text-muted-foreground">{desc}</p>
        </div>
    )
}

function UseCaseCard({ icon, title, desc, delay }: { icon: React.ReactNode, title: string, desc: string, delay: string }) {
    return (
        <div
            className="group relative p-8 rounded-2xl bg-secondary/30 border border-white/5 hover:bg-secondary/50 transition-all duration-300 animate-fade-in-up overflow-hidden"
            style={{ animationDelay: `${delay}ms` }}
        >
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-150 transition-transform duration-500 pointer-events-none">
                {icon}
            </div>
            <div className="relative z-10">
                <div className="mb-6 p-4 rounded-xl bg-background/50 inline-block border border-white/5 shadow-sm group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                    {icon}
                </div>
                <h3 className="text-2xl font-bold mb-3">{title}</h3>
                <p className="text-muted-foreground leading-relaxed">{desc}</p>
            </div>
        </div>
    );
}

// FAQPage JSON-LD：取 5 個核心 FAQ 項目，讓 Google 有機會在 SERP 顯示富摘要。
// i18n 切換語言時會 re-render，schema 內容跟著切到對應語言版本。
const FAQ_KEYS = [
    'dynamic_island',
    'favorites_manager',
    'media_control',
    'layout_control',
    'twitch_linking',
] as const;

function FaqJsonLd() {
    const { t } = useTranslation('faq');
    const data = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: FAQ_KEYS.map(key => ({
            '@type': 'Question',
            name: t(`items.${key}.title`),
            acceptedAnswer: {
                '@type': 'Answer',
                text: t(`items.${key}.content`),
            },
        })),
    };
    // Escape `<` 為 `<`，避免 i18n 內容若含 `</script>` 破壞 close tag（Google 官方建議）
    const safeJson = JSON.stringify(data).replace(/</g, '\\u003c');
    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: safeJson }}
        />
    );
}
