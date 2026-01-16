import { useTranslation } from 'react-i18next';
import { useUIStore } from '../store/useUIStore';
import { Button } from './ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { ArrowLeft, MonitorPlay, HelpCircle } from 'lucide-react';
import { SEO } from './SEO';

export function FAQPage() {
    const { t } = useTranslation(['faq', 'common']);
    const setPage = useUIStore(s => s.setPage);

    // FAQ items keys matching the i18n structure
    const faqItems = [
        'dynamic_island',
        'favorites_manager',
        'media_control',
        'search_bar',
        'layout_control',
        'one_click_favorite',
        'clear_canvas',
        'fullscreen',
        'batch_import',
        'multi_tabs',
        'categories',
        'backup_restore',
        'twitch_linking',
        'live_detection',
        'empty_window'
    ];

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col">
            <SEO
                title={`${t('faq:title')} - MultiStream Hub`}
                description={t('faq:header_subtitle')}
                keywords="FAQ, MultiStream Hub, help, guide, features, multistreaming"
                url="https://multistreaming.org/faq"
            />
            {/* Header */}
            <header className="sticky top-0 w-full z-50 border-b border-white/10 bg-background/80 backdrop-blur-md">
                <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setPage('home')}
                            className="hover:bg-primary/10"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-400">
                            {t('faq:title' as any)}
                        </span>
                    </div>
                    <Button
                        onClick={() => setPage('canvas')}
                        className="font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
                    >
                        <MonitorPlay className="w-4 h-4 mr-2" />
                        {t('faq:go_to_canvas' as any)}
                    </Button>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
                <div className="mb-8 text-center">
                    <div className="inline-flex items-center justify-center p-3 rounded-full bg-primary/10 mb-4">
                        <HelpCircle className="w-8 h-8 text-primary" />
                    </div>
                    <h1 className="text-3xl font-bold mb-4">{t('faq:header_title' as any)}</h1>
                    <p className="text-muted-foreground">{t('faq:header_subtitle' as any)}</p>
                </div>

                <div className="bg-card/50 rounded-xl border border-white/5 p-6 backdrop-blur-sm">
                    <Accordion type="single" collapsible className="w-full space-y-2">
                        {faqItems.map((item) => (
                            <AccordionItem key={item} value={item} className="border border-white/5 rounded-lg px-4 data-[state=open]:bg-white/5 transition-colors">
                                <AccordionTrigger className="hover:no-underline py-4 text-left font-semibold text-lg">
                                    {t(`faq:items.${item}.title` as any)}
                                </AccordionTrigger>
                                <AccordionContent className="text-muted-foreground leading-relaxed pt-2 pb-4 text-base">
                                    {t(`faq:items.${item}.content` as any)}
                                    {/* Optional: Add tip if exists */}
                                    {t(`faq:items.${item}.tip` as any, { defaultValue: '' }) && (
                                        <div className="mt-3 p-3 bg-secondary/30 rounded-lg border-l-2 border-primary text-sm">
                                            <span className="font-bold text-primary block mb-1">Tip:</span>
                                            {t(`faq:items.${item}.tip` as any)}
                                        </div>
                                    )}
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </div>

                <div className="mt-12 text-center text-sm text-muted-foreground">
                    <p>{t('faq:footer_note' as any)}</p>
                </div>
            </main>
        </div>
    );
}
