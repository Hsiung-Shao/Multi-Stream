import { useTranslation } from 'react-i18next';
import { useUIStore } from '../store/useUIStore';
import { Button } from './ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { ArrowLeft, MonitorPlay, HelpCircle, Download, ExternalLink } from 'lucide-react';
import { SEO } from './SEO';

const MODHEADER_URL = 'https://chromewebstore.google.com/detail/modheader-modify-http-hea/idgpnmonknjnojddfkpgkljpfnnfcklj';
const PROFILE_DOWNLOAD_PATH = '/docs/brave-fix/twitch.json';
const STEP_IMAGES = [
    '/docs/brave-fix/step0.png',
    '/docs/brave-fix/step1.png',
    '/docs/brave-fix/step2.png',
    '/docs/brave-fix/step3.png',
];

export function FAQPage() {
    const { t } = useTranslation(['faq', 'common']);
    const setPage = useUIStore(s => s.setPage);

    // FAQ items keys matching the i18n structure
    const faqItems = [
        'brave_twitch',
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
                pathWithoutLang="/faq"
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

                                    {/* Special: Brave Twitch tutorial with steps */}
                                    {item === 'brave_twitch' && (
                                        <BraveTwitchGuide t={t} />
                                    )}

                                    {/* Optional: Add tip if exists */}
                                    {item !== 'brave_twitch' && t(`faq:items.${item}.tip` as any, { defaultValue: '' }) && (
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

function BraveTwitchGuide({ t }: { t: (key: any, options?: any) => string }) {
    const stepKeys = ['step0', 'step1', 'step2', 'step3'] as const;

    return (
        <div className="mt-4 space-y-4">
            {/* Action buttons */}
            <div className="flex flex-wrap gap-3">
                <a
                    href={MODHEADER_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors"
                >
                    <ExternalLink className="w-4 h-4" />
                    {t('faq:items.brave_twitch.install_btn' as any)}
                </a>
                <a
                    href={PROFILE_DOWNLOAD_PATH}
                    download="twitch.json"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground font-medium text-sm hover:bg-secondary/80 transition-colors"
                >
                    <Download className="w-4 h-4" />
                    {t('faq:items.brave_twitch.download_btn' as any)}
                </a>
            </div>

            {/* Steps */}
            <div className="space-y-6">
                {stepKeys.map((stepKey, index) => (
                    <div key={stepKey} className="space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-sm font-bold flex items-center justify-center">
                                {index + 1}
                            </span>
                            <span className="font-medium text-foreground">
                                {t(`faq:items.brave_twitch.${stepKey}` as any)}
                            </span>
                        </div>
                        <div className="ml-8 rounded-lg overflow-hidden border border-white/10">
                            <img
                                src={STEP_IMAGES[index]}
                                alt={`Step ${index + 1}`}
                                className="w-full max-w-lg"
                                loading="lazy"
                            />
                        </div>
                    </div>
                ))}
            </div>

            {/* Tip */}
            <div className="p-3 bg-secondary/30 rounded-lg border-l-2 border-primary text-sm">
                <span className="font-bold text-primary block mb-1">Tip:</span>
                {t('faq:items.brave_twitch.tip' as any)}
            </div>
        </div>
    );
}
