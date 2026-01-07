import { ScrollArea } from '../ui/scroll-area';
import { useTranslation } from 'react-i18next';
import { History, GitCommit, Sparkles, Wrench } from 'lucide-react';



export const VersionUpdatesWidget = () => {
    const { t } = useTranslation(['versionHistory', 'common']);

    // Construct version data from i18n to ensure sync with VersionHistory.tsx
    // Since i18n doesn't store 'type' (feat/fix), we'll default to 'feat' or 'chore' based on text or just generic.
    // For this widget, we can try to guess or just use a default icon.
    // Note: In a real app we might want to move this data structure to a shared hook.

    // Helper for icon
    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'feat':
                return <Sparkles className="h-3 w-3 text-purple-400" />;
            case 'fix':
                return <Wrench className="h-3 w-3 text-blue-400" />;
            default:
                return <GitCommit className="h-3 w-3 text-gray-400" />;
        }
    };

    const versions = [
        {
            version: 'v2.3.0',
            date: t('versionHistory:v2.3.0.date'),
            changes: [
                { type: 'feat', content: t('versionHistory:v2.3.0.change1') },
                { type: 'feat', content: t('versionHistory:v2.3.0.change2') },
                { type: 'feat', content: t('versionHistory:v2.3.0.change3') },
            ]
        },
        {
            version: 'v2.2.1',
            date: t('versionHistory:v2.2.1.date'),
            changes: [
                { type: 'fix', content: t('versionHistory:v2.2.1.change1') },
                { type: 'fix', content: t('versionHistory:v2.2.1.change2') },
            ]
        },
        {
            version: 'v2.2.0',
            date: t('versionHistory:v2.2.0.date'),
            changes: [
                { type: 'feat', content: t('versionHistory:v2.2.0.change1') },
                { type: 'feat', content: t('versionHistory:v2.2.0.change2') },
                { type: 'feat', content: t('versionHistory:v2.2.0.change3') },
                { type: 'feat', content: t('versionHistory:v2.2.0.change4') },
            ]
        }
    ];

    const changeLogs = versions;
    const currentVersion = __APP_VERSION__;

    return (
        <div className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 shadow-xl backdrop-blur-sm transition-all hover:bg-white dark:hover:bg-white/10 h-full flex flex-col">
            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-blue-500/10 blur-3xl" />

            <div className="flex items-center justify-between mb-4 relative z-10">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <History className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    {t('version.title') || 'Version Updates'}
                </h3>
                <span className="text-xs font-mono text-gray-500 bg-gray-100 dark:text-white/40 dark:bg-white/5 px-2 py-1 rounded-md">
                    {currentVersion}
                </span>
            </div>

            <div className="flex-1 min-h-0 relative z-10">
                <ScrollArea className="flex-1 h-full pr-4">
                    <div className="space-y-6">
                        {changeLogs.map((log) => (
                            <div key={log.version} className="relative pl-4 border-l border-gray-200 dark:border-white/10 pb-2">
                                <div className="absolute -left-[5px] top-0 h-2.5 w-2.5 rounded-full bg-blue-500/50 ring-4 ring-white dark:ring-black/20" />
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-gray-900 dark:text-white/90">{log.version}</span>
                                    <span className="text-xs text-gray-400 dark:text-white/40">{log.date}</span>
                                </div>
                                <div className="space-y-2">
                                    {log.changes.map((change, i) => (
                                        <div key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-white/70">
                                            <div className="mt-1 flex-shrink-0">
                                                {getTypeIcon(change.type)}
                                            </div>
                                            <span className="leading-snug">{change.content}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </div>
        </div>
    );
};
