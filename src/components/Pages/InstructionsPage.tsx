import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../store/useUIStore';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import {
    Home,
    LayoutDashboard,
    Search,
    Settings,
    MessageSquare,
    Tv,
    LayoutGrid,
    Heart,
    Volume2,
    Github,
    ArrowRight
} from 'lucide-react';

import { SEO } from '../SEO';

export function InstructionsPage() {
    const { t } = useTranslation('tutorial');
    const { t: tCommon } = useTranslation('common');
    const setPage = useUIStore(s => s.setPage);
    const theme = useUIStore(s => s.theme);

    const features = [
        {
            icon: <LayoutGrid className="w-8 h-8 text-blue-500" />,
            titleKey: 'features.canvas.title',
            descKey: 'features.canvas.description',
            tab: 'basics'
        },
        {
            icon: <Tv className="w-8 h-8 text-purple-500" />,
            titleKey: 'features.island.title',
            descKey: 'features.island.description',
            tab: 'advanced'
        },
        {
            icon: <Search className="w-8 h-8 text-green-500" />,
            titleKey: 'features.search.title',
            descKey: 'features.search.description',
            tab: 'basics'
        },
        {
            icon: <Heart className="w-8 h-8 text-red-500" />,
            titleKey: 'features.favorites.title',
            descKey: 'features.favorites.description',
            tab: 'advanced'
        },
        {
            icon: <Volume2 className="w-8 h-8 text-yellow-500" />,
            titleKey: 'features.media.title',
            descKey: 'features.media.description',
            tab: 'advanced'
        },
        {
            icon: <Settings className="w-8 h-8 text-gray-500" />,
            titleKey: 'features.settings.title',
            descKey: 'features.settings.description',
            tab: 'advanced'
        }
    ];

    const faqs = ['q1', 'q2', 'q3', 'q4'];

    return (
        <div className={`min-h-screen ${theme === 'dark' ? 'bg-black text-white' : 'bg-gray-50 text-gray-900'}`}>
            <SEO
                title={t('seo:instructions.title')}
                description={t('seo:instructions.description')}
                keywords={t('seo:instructions.keywords')}
                pathWithoutLang="/instructions"
            />
            {/* Navbar Placeholder / Back Button */}
            <div className="sticky top-0 z-50 p-4 border-b bg-background/80 backdrop-blur-md flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" onClick={() => setPage('home')}>
                        <Home className="w-4 h-4 mr-2" />
                        {tCommon('common.home')}
                    </Button>
                </div>
                <h1 className="text-lg font-bold hidden md:block">{t('pageTitle')}</h1>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setPage('canvas')}>
                        <LayoutDashboard className="w-4 h-4 mr-2" />
                        {t('tabs.basics')}
                    </Button>
                </div>
            </div>

            <main className="container mx-auto px-4 py-12 max-w-6xl">
                {/* Hero Section */}
                <div className="text-center mb-16 space-y-6">
                    <Badge variant="secondary" className="mb-4 text-primary">{t('hero.badge')}</Badge>
                    <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent pb-2">
                        {t('hero.title')}
                    </h1>
                    <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                        {t('hero.subtitle')}
                    </p>
                    <div className="flex justify-center gap-4 pt-4">
                        <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-8" onClick={() => setPage('canvas')}>
                            {t('hero.start')} <ArrowRight className="ml-2 w-4 h-4" />
                        </Button>
                        <Button size="lg" variant="outline" className="rounded-full px-8" onClick={() => window.open('https://github.com/Hsiung-Shao/Multi-Stream', '_blank')}>
                            <Github className="mr-2 w-4 h-4" /> {t('hero.github')}
                        </Button>
                    </div>
                </div>

                {/* Feature Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
                    {features.map((feature, idx) => (
                        <Card key={idx} className="hover:shadow-lg transition-shadow duration-300 border-opacity-50">
                            <CardHeader>
                                <div className="mb-4">{feature.icon}</div>
                                <CardTitle>{t(feature.titleKey as any)}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-muted-foreground">{t(feature.descKey as any)}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Detailed Tabs */}
                <Tabs defaultValue="basics" className="mb-16">
                    <TabsList className="grid w-full grid-cols-3 md:grid-cols-3 lg:w-[450px] mx-auto mb-8">
                        <TabsTrigger value="basics">{t('tabs.basics')}</TabsTrigger>
                        <TabsTrigger value="advanced">{t('tabs.advanced')}</TabsTrigger>
                        <TabsTrigger value="faq">{t('tabs.faq')}</TabsTrigger>
                    </TabsList>

                    {/* Basics Tab */}
                    <TabsContent value="basics" className="space-y-8 animate-in fade-in-50">
                        <div className="grid md:grid-cols-2 gap-8">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <LayoutGrid className="w-5 h-5 text-blue-500" />
                                        {t('features.canvas.title')}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="bg-muted/50 p-4 rounded-lg">
                                        <h4 className="font-semibold mb-2">{t('features.canvas.autoLayout')}</h4>
                                        <p className="text-sm text-muted-foreground">{t('features.canvas.autoLayout.desc')}</p>
                                    </div>
                                    <div className="bg-muted/50 p-4 rounded-lg">
                                        <h4 className="font-semibold mb-2">{t('features.canvas.dragDrop')}</h4>
                                        <p className="text-sm text-muted-foreground">{t('features.canvas.dragDrop.desc')}</p>
                                    </div>
                                    <div className="bg-muted/50 p-4 rounded-lg">
                                        <h4 className="font-semibold mb-2">{t('features.canvas.contextMenu')}</h4>
                                        <p className="text-sm text-muted-foreground">{t('features.canvas.contextMenu.desc')}</p>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Search className="w-5 h-5 text-green-500" />
                                        {t('features.search.title')}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="bg-muted/50 p-4 rounded-lg">
                                        <h4 className="font-semibold mb-2">{t('features.search.twitch')}</h4>
                                        <p className="text-sm text-muted-foreground">{t('features.search.twitch.desc')}</p>
                                    </div>
                                    <div className="bg-muted/50 p-4 rounded-lg">
                                        <h4 className="font-semibold mb-2">{t('features.search.url')}</h4>
                                        <p className="text-sm text-muted-foreground">{t('features.search.url.desc')}</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    {/* Advanced Tab */}
                    <TabsContent value="advanced" className="space-y-8 animate-in fade-in-50">
                        <div className="grid md:grid-cols-2 gap-8">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Tv className="w-5 h-5 text-purple-500" />
                                        {t('features.island.title')}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <p className="text-muted-foreground mb-4">{t('features.island.description')}</p>
                                    <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
                                        <li>{t('features.island.quickActions.desc')}</li>
                                        <li>{t('features.island.status.desc')}</li>
                                    </ul>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Heart className="w-5 h-5 text-red-500" />
                                        {t('features.favorites.title')}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="bg-muted/50 p-4 rounded-lg">
                                        <Badge className="mb-2 bg-purple-600">{t('features.favorites.proTip')}</Badge>
                                        <h4 className="font-semibold mb-1">{t('features.favorites.import')}</h4>
                                        <p className="text-sm text-muted-foreground">{t('features.favorites.import.desc')}</p>
                                    </div>
                                    <div className="p-2">
                                        <h4 className="font-semibold mb-1">{t('features.favorites.group')}</h4>
                                        <p className="text-sm text-muted-foreground">{t('features.favorites.group.desc')}</p>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Volume2 className="w-5 h-5 text-yellow-500" />
                                        {t('features.media.title')}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-muted-foreground text-sm">{t('features.media.global.desc')}</p>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Settings className="w-5 h-5 text-gray-500" />
                                        {t('features.settings.title')}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="grid gap-2 text-sm text-muted-foreground">
                                    <div className="flex justify-between border-b pb-2">
                                        <span>{t('features.settings.general')}</span>
                                        <span className="text-xs opacity-70">{t('features.settings.general.desc')}</span>
                                    </div>
                                    <div className="flex justify-between border-b pb-2">
                                        <span>{t('features.settings.performance')}</span>
                                        <span className="text-xs opacity-70">{t('features.settings.performance.desc')}</span>
                                    </div>
                                    <div className="flex justify-between border-b pb-2">
                                        <span>{t('features.settings.data')}</span>
                                        <span className="text-xs opacity-70">{t('features.settings.data.desc')}</span>
                                    </div>
                                    <div className="flex justify-between pt-2">
                                        <span>{t('features.settings.twitch')}</span>
                                        <span className="text-xs opacity-70">{t('features.settings.twitch.desc')}</span>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    {/* FAQ Tab */}
                    <TabsContent value="faq" className="animate-in fade-in-50">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <MessageSquare className="w-5 h-5 text-blue-400" />
                                    {t('faq.title')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {faqs.map((q, idx) => (
                                    <div key={idx} className="border-b last:border-0 pb-4 last:pb-0">
                                        <h4 className="font-semibold text-lg mb-2 flex items-center gap-2">
                                            <Badge variant="outline" className="h-6 w-6 flex items-center justify-center rounded-full p-0">Q</Badge>
                                            {t(`faq.${q}`)}
                                        </h4>
                                        <p className="text-muted-foreground leading-relaxed pl-8">
                                            {t(`faq.a${idx + 1}`)}
                                        </p>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>

            </main>

            {/* Footer */}
            <footer className="border-t bg-background/50 py-8 text-center text-sm text-muted-foreground">
                <p>{t('footer.copyright')}</p>
                <div className="mt-4 flex justify-center gap-4">
                    <Button variant="link" size="sm" onClick={() => window.open('https://github.com/Hsiung-Shao/Multi-Stream', '_blank')}>
                        {t('footer.github')}
                    </Button>
                    <Button variant="link" size="sm">
                        {t('footer.license')}
                    </Button>
                </div>
            </footer>
        </div>
    );
}

export default InstructionsPage;
