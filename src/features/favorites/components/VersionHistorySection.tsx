import { useTranslation } from 'react-i18next';
import { Calendar, Sparkles } from 'lucide-react';
import { ScrollArea } from '../../../components/ui/scroll-area';
import { versionHistoryData } from '../../../config/versionHistoryData';

interface VersionHistorySectionProps {
    theme: 'light' | 'dark';
}

export function VersionHistorySection({ theme }: VersionHistorySectionProps) {
    const { t } = useTranslation(['versionHistory']);

    // Map data for display
    const versions = versionHistoryData.map(v => ({
        version: v.version,
        date: t(v.dateKey as any),
        changes: v.changeKeys.map(key => t(key as any))
    }));

    return (
        <div className="flex-1 flex flex-col gap-6 overflow-hidden">
            <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500">
                        <Sparkles className="size-5" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold font-normal">{t('versionHistory:title')}</h3>
                        <p className="text-sm text-gray-500 mt-1">
                            {t('versionHistory:description' as any) || '查看所有功能更新與修正紀錄'}
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 overflow-hidden">
                <ScrollArea className="h-full">
                    <div className="p-6 space-y-8">
                        {versions.map((version, index) => (
                            <div key={version.version} className="relative pl-8 border-l border-gray-200 dark:border-gray-800 last:border-0 pb-8 last:pb-0">
                                {/* Timeline Dot */}
                                <div className={`absolute -left-1.5 top-1.5 size-3 rounded-full border-2 ${index === 0
                                    ? 'bg-purple-500 border-purple-500 ring-4 ring-purple-500/20'
                                    : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700'
                                    }`} />

                                <div className="space-y-4">
                                    <div className="flex items-baseline gap-3">
                                        <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                            {version.version}
                                        </h4>
                                        <div className="flex items-center gap-1.5 text-sm text-gray-500 font-medium">
                                            <Calendar className="size-3.5" />
                                            <span>{version.date}</span>
                                        </div>
                                    </div>

                                    <ul className="space-y-2.5">
                                        {version.changes.map((change, i) => (
                                            <li key={i} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300 leading-relaxed md:max-w-3xl">
                                                <span className={`mt-2 size-1.5 rounded-full shrink-0 ${index === 0 ? 'bg-purple-500' : 'bg-gray-400'
                                                    }`} />
                                                <span>{change}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </div>
        </div>
    );
}
