import { X, Tv, Search, Layout, MessageCircle, Volume2, RefreshCw, Star, Radio, Database, Settings, Smartphone, Zap } from 'lucide-react';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import { logEvent } from '../utils/analytics';

interface TutorialProps {
    theme: 'light' | 'dark';
    onClose: () => void;
}

export function Tutorial({ theme, onClose }: TutorialProps) {
    const { t } = useTranslation('tutorial');

    useEffect(() => {
        logEvent('Tutorial', 'open_modal');
    }, []);

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className={`max-w-5xl w-full ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-lg shadow-2xl max-h-[90vh] flex flex-col`}>
                {/* Header */}
                <div className={`flex items-center justify-between p-6 border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div>
                        <h2 className={theme === 'dark' ? 'text-white' : 'text-black'}>{t('title')}</h2>
                        <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                            {t('subtitle')}
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className={theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'}
                    >
                        <X className="size-5" />
                    </Button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    <Tabs defaultValue="basic" className="flex flex-col h-full" onValueChange={(value: string) => {
                        logEvent('Tutorial', 'switch_tab', value);
                    }}>
                        <div className="px-6 pt-6 flex-shrink-0">
                            <TabsList className={`grid w-full grid-cols-3 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'}`}>
                                <TabsTrigger value="basic">{t('basic')}</TabsTrigger>
                                <TabsTrigger value="advanced">{t('advanced')}</TabsTrigger>
                                <TabsTrigger value="tips">{t('tips')}</TabsTrigger>
                            </TabsList>
                        </div>

                        <TabsContent value="basic" className="flex-1 min-h-0 mt-0">
                            <ScrollArea className="h-[800px]">
                                <div className="p-6 space-y-6 pr-4">
                                    <Section
                                        theme={theme}
                                        icon={<Tv className="size-5" />}
                                        title={t('addStream.title')}
                                        content={
                                            <>
                                                <ol className="list-decimal list-inside space-y-2 mb-3">
                                                    <li>{t('addStream.step1')}</li>
                                                    <li>{t('addStream.step2')}</li>
                                                    <li>{t('addStream.step3')}</li>
                                                </ol>
                                                <Tip theme={theme} text={t('addStream.tip1')} />
                                                <ul className={`list-disc list-inside ml-4 space-y-1 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                                    <li>{t('addStream.tip2')}</li>
                                                    <li>{t('addStream.tip3')}</li>
                                                </ul>
                                                <Tip theme={theme} text={t('addStream.tip4')} />
                                            </>
                                        }
                                    />

                                    <Section
                                        theme={theme}
                                        icon={<Search className="size-5" />}
                                        title={t('search.title')}
                                        content={
                                            <>
                                                <ol className="list-decimal list-inside space-y-2 mb-3">
                                                    <li>{t('search.step1')}</li>
                                                    <li>{t('search.step2')}</li>
                                                    <li>{t('search.step3')}</li>
                                                </ol>
                                                <Tip theme={theme} text={t('search.tip')} />
                                            </>
                                        }
                                    />

                                    <Section
                                        theme={theme}
                                        icon={<Layout className="size-5" />}
                                        title={t('layout.title')}
                                        content={
                                            <>
                                                <div className="space-y-4">
                                                    <div>
                                                        <h4 className={`mb-2 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>
                                                            {t('layout.basic.title')}
                                                        </h4>
                                                        <ol className="list-decimal list-inside space-y-2">
                                                            <li>{t('layout.basic.step1')}</li>
                                                            <li>{t('layout.basic.step2')}</li>
                                                            <li>{t('layout.basic.step3')}</li>
                                                        </ol>
                                                    </div>
                                                    <div>
                                                        <h4 className={`mb-2 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>
                                                            {t('layout.sideChat.title')}
                                                        </h4>
                                                        <ol className="list-decimal list-inside space-y-2">
                                                            <li>{t('layout.sideChat.step1')}</li>
                                                            <li>{t('layout.sideChat.step2')}</li>
                                                            <li>{t('layout.sideChat.step3')}</li>
                                                            <li>{t('layout.sideChat.step4')}</li>
                                                        </ol>
                                                        <Tip theme={theme} text={t('layout.sideChat.tip')} />
                                                    </div>
                                                </div>
                                            </>
                                        }
                                    />

                                    <Section
                                        theme={theme}
                                        icon={<MessageCircle className="size-5" />}
                                        title={t('chat.title')}
                                        content={
                                            <>
                                                <div className="space-y-4">
                                                    <div>
                                                        <h4 className={`mb-2 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>
                                                            {t('chat.basic.title')}
                                                        </h4>
                                                        <ul className="list-disc list-inside space-y-2">
                                                            <li>{t('chat.basic.step1')}</li>
                                                            <li>{t('chat.basic.step2')}</li>
                                                            <li>{t('chat.basic.step3')}</li>
                                                        </ul>
                                                    </div>
                                                    <div>
                                                        <h4 className={`mb-2 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>
                                                            {t('chat.sideLayout.title')}
                                                        </h4>
                                                        <ul className="list-disc list-inside space-y-2">
                                                            <li>{t('chat.sideLayout.step1')}</li>
                                                            <li>{t('chat.sideLayout.step2')}</li>
                                                            <li>{t('chat.sideLayout.step3')}</li>
                                                            <li>{t('chat.sideLayout.step4')}</li>
                                                            <li>{t('chat.sideLayout.step5')}</li>
                                                        </ul>
                                                    </div>
                                                </div>
                                                <Warning theme={theme} text={t('chat.warning')} />
                                            </>
                                        }
                                    />

                                    <Section
                                        theme={theme}
                                        icon={<Volume2 className="size-5" />}
                                        title={t('volume.title')}
                                        content={
                                            <>
                                                <ul className="list-disc list-inside space-y-2">
                                                    <li>{t('volume.step1')}</li>
                                                    <li>{t('volume.step2')}</li>
                                                    <li>{t('volume.step3')}</li>
                                                    <li>{t('volume.step4')}</li>
                                                    <li>{t('volume.step5')}</li>
                                                </ul>
                                            </>
                                        }
                                    />

                                    <Section
                                        theme={theme}
                                        icon={<RefreshCw className="size-5" />}
                                        title={t('reload.title')}
                                        content={
                                            <>
                                                <ol className="list-decimal list-inside space-y-2">
                                                    <li>{t('reload.step1')}</li>
                                                    <li>{t('reload.step2')}</li>
                                                </ol>
                                            </>
                                        }
                                    />
                                </div>
                            </ScrollArea>
                        </TabsContent>

                        <TabsContent value="advanced" className="flex-1 min-h-0 mt-0">
                            <ScrollArea className="h-[800px]">
                                <div className="p-6 space-y-6 pr-4">
                                    <Section
                                        theme={theme}
                                        icon={<Star className="size-5" />}
                                        title={t('favorite.title')}
                                        content={
                                            <>
                                                <ol className="list-decimal list-inside space-y-2 mb-3">
                                                    <li>{t('favorite.step1')}</li>
                                                    <li>{t('favorite.step2')}
                                                        <ul className="list-disc list-inside ml-6 mt-1">
                                                            <li>{t('favorite.step2Item1')}</li>
                                                            <li>{t('favorite.step2Item2')}</li>
                                                            <li>{t('favorite.step2Item3')}</li>
                                                        </ul>
                                                    </li>
                                                    <li>{t('favorite.step3')}</li>
                                                    <li>{t('favorite.step4')}
                                                        <ul className="list-disc list-inside ml-6 mt-1">
                                                            <li>{t('favorite.step4Item1')}</li>
                                                            <li>{t('favorite.step4Item2')}</li>
                                                        </ul>
                                                    </li>
                                                </ol>
                                                <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-blue-900/20 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'} mb-3`}>
                                                    <p className={`text-sm font-medium mb-2 ${theme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>
                                                        {t('favorite.batchImport.title')}
                                                    </p>
                                                    <ol className={`list-decimal list-inside ml-4 space-y-1 text-sm ${theme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>
                                                        <li>{t('favorite.batchImport.step1')}</li>
                                                        <li>{t('favorite.batchImport.step2')}</li>
                                                        <li>{t('favorite.batchImport.step3')}</li>
                                                        <li>{t('favorite.batchImport.step4')}</li>
                                                    </ol>
                                                </div>
                                                <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-blue-900/20 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'}`}>
                                                    <p className={`text-sm ${theme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>
                                                        {t('favorite.step5')}
                                                    </p>
                                                    <ul className={`list-disc list-inside ml-4 mt-2 text-sm ${theme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>
                                                        <li>{t('favorite.step5Item1')}</li>
                                                        <li>{t('favorite.step5Item2')}</li>
                                                        <li>{t('favorite.step5Item3')}</li>
                                                    </ul>
                                                </div>
                                            </>
                                        }
                                    />

                                    <Section
                                        theme={theme}
                                        icon={<Radio className="size-5" />}
                                        title={t('liveStatus.title')}
                                        content={
                                            <>
                                                <ul className="list-disc list-inside space-y-2">
                                                    <li>{t('liveStatus.step1')}</li>
                                                    <li>{t('liveStatus.step2')}</li>
                                                    <li>{t('liveStatus.step3')}</li>
                                                    <li>{t('liveStatus.step4')}</li>
                                                    <li>{t('liveStatus.step5')}</li>
                                                </ul>
                                                <Tip theme={theme} text={t('liveStatus.tip')} />
                                            </>
                                        }
                                    />

                                    <Section
                                        theme={theme}
                                        icon={<Tv className="size-5" />}
                                        title={t('youtubeLiveStatus.title')}
                                        content={
                                            <>
                                                <ol className="list-decimal list-inside space-y-2 mb-3">
                                                    <li>{t('youtubeLiveStatus.step1')}</li>
                                                    <li>{t('youtubeLiveStatus.step2')}</li>
                                                    <li>{t('youtubeLiveStatus.step3')}</li>
                                                    <li>{t('youtubeLiveStatus.step4')}</li>
                                                    <li>{t('youtubeLiveStatus.step5')}</li>
                                                </ol>
                                                <Tip theme={theme} text={t('youtubeLiveStatus.tip')} />
                                            </>
                                        }
                                    />

                                    <Section
                                        theme={theme}
                                        icon={<Database className="size-5" />}
                                        title={t('backup.title')}
                                        content={
                                            <>
                                                <ul className="list-disc list-inside space-y-2 mb-3">
                                                    <li>{t('backup.step1')}</li>
                                                    <li>{t('backup.step2')}</li>
                                                </ul>
                                                <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-green-900/20 border border-green-500/30' : 'bg-green-50 border border-green-200'} mb-3`}>
                                                    <p className={`text-sm ${theme === 'dark' ? 'text-green-300' : 'text-green-700'}`}>
                                                        {t('backup.step3')}
                                                    </p>
                                                </div>
                                                <ul className="list-disc list-inside space-y-2">
                                                    <li>{t('backup.step4')}</li>
                                                    <li>{t('backup.step5')}</li>
                                                </ul>
                                                <Tip theme={theme} text={t('backup.tip')} />
                                            </>
                                        }
                                    />

                                    <Section
                                        theme={theme}
                                        icon={<Settings className="size-5" />}
                                        title={t('controlPanel.title')}
                                        content={
                                            <>
                                                <ul className="list-disc list-inside space-y-2">
                                                    <li>{t('controlPanel.step1')}</li>
                                                    <li>{t('controlPanel.step2')}</li>
                                                    <li>{t('controlPanel.step3')}</li>
                                                </ul>
                                            </>
                                        }
                                    />

                                    <Section
                                        theme={theme}
                                        icon={<Smartphone className="size-5" />}
                                        title={t('mobile.title')}
                                        content={
                                            <>
                                                <ul className="list-disc list-inside space-y-2">
                                                    <li>{t('mobile.step1')}</li>
                                                    <li>{t('mobile.step2')}</li>
                                                    <li>{t('mobile.step3')}</li>
                                                </ul>
                                            </>
                                        }
                                    />
                                </div>
                            </ScrollArea>
                        </TabsContent>

                        <TabsContent value="tips" className="flex-1 min-h-0 mt-0">
                            <ScrollArea className="h-[800px]">
                                <div className="p-6 space-y-6 pr-4">
                                    <Section
                                        theme={theme}
                                        icon={<Zap className="size-5" />}
                                        title={t('tips.title')}
                                        content={
                                            <>
                                                <div className="grid gap-4">
                                                    <TipCard
                                                        theme={theme}
                                                        title={t('tips.card1.title')}
                                                        description={t('tips.card1.description')}
                                                    />
                                                    <TipCard
                                                        theme={theme}
                                                        title={t('tips.card2.title')}
                                                        description={t('tips.card2.description')}
                                                    />
                                                    <TipCard
                                                        theme={theme}
                                                        title={t('tips.card3.title')}
                                                        description={t('tips.card3.description')}
                                                    />
                                                    <TipCard
                                                        theme={theme}
                                                        title={t('tips.card4.title')}
                                                        description={t('tips.card4.description')}
                                                    />
                                                    <TipCard
                                                        theme={theme}
                                                        title={t('tips.card5.title')}
                                                        description={t('tips.card5.description')}
                                                    />
                                                    <TipCard
                                                        theme={theme}
                                                        title={t('tips.card6.title')}
                                                        description={t('tips.card6.description')}
                                                    />
                                                </div>
                                            </>
                                        }
                                    />
                                </div>
                            </ScrollArea>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </div>
    );
}

function Section({
    theme,
    icon,
    title,
    content,
}: {
    theme: 'light' | 'dark';
    icon: React.ReactNode;
    title: string;
    content: React.ReactNode;
}) {
    return (
        <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
            <div className="flex items-center gap-2 mb-3">
                <div className={`size-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white`}>
                    {icon}
                </div>
                <h3 className={theme === 'dark' ? 'text-white' : 'text-black'}>{title}</h3>
            </div>
            <div className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} space-y-3`}>
                {content}
            </div>
        </div>
    );
}

function Tip({ theme, text }: { theme: 'light' | 'dark'; text: string }) {
    return (
        <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-blue-900/20 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'}`}>
            <p className={`text-sm ${theme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>
                💡 {text}
            </p>
        </div>
    );
}

function Warning({ theme, text }: { theme: 'light' | 'dark'; text: string }) {
    return (
        <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-yellow-900/20 border border-yellow-500/30' : 'bg-yellow-50 border border-yellow-200'}`}>
            <p className={`text-sm ${theme === 'dark' ? 'text-yellow-300' : 'text-yellow-700'}`}>
                ⚠️ {text}
            </p>
        </div>
    );
}

function TipCard({ theme, title, description }: { theme: 'light' | 'dark'; title: string; description: string }) {
    return (
        <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-purple-500/30' : 'bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200'}`}>
            <h4 className={`mb-1 ${theme === 'dark' ? 'text-purple-300' : 'text-purple-700'}`}>{title}</h4>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>{description}</p>
        </div>
    );
}
