import { Download, Upload, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { useTranslation } from 'react-i18next';
import { backupService } from '../../backup/index';
import { favoritesService } from '../FavoritesService';
import { tagsService } from '../TagsService';
import { logEvent } from '../../../utils/analytics';
import { useState } from 'react';

interface BackupSectionProps {
    theme: 'light' | 'dark';
    onSuccess: (message: string) => void;
    onError: (message: string) => void;
}

export function BackupSection({ onSuccess, onError }: BackupSectionProps) {
    const { t } = useTranslation(['favorites', 'common']);
    const [isProcessing, setIsProcessing] = useState(false);

    const handleExportJSON = () => {
        try {
            const data = backupService.getAllData();
            const jsonStr = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `multistream-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            logEvent('Favorites', 'export_json');
            onSuccess(t('backup.export_success'));
        } catch (error) {
            onError(t('backup.export_error', { error: error instanceof Error ? error.message : t('backup.unknown_error') }));
        }
    };

    const handleImportJSON = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            setIsProcessing(true);
            try {
                const text = await file.text();
                const data = JSON.parse(text);

                if (!data.version && (!data.favoriteStreams || !Array.isArray(data.favoriteStreams))) {
                    throw new Error(t('backup.invalid_format'));
                }

                // 恢復邏輯與原版 FavoritesManager.tsx (Line 694-716) 一致
                if (data.version) {
                    if (data.userSettings) localStorage.setItem('userSettings', JSON.stringify(data.userSettings));
                    if (data.favoriteStreams) favoritesService.saveFavorites(data.favoriteStreams);
                    if (data.favoriteCategories) favoritesService.saveCategories(data.favoriteCategories);
                    if (data.preference_tags) tagsService.saveTags(data.preference_tags);
                    if (data.multiStreamLayout) localStorage.setItem('multiStreamLayout', JSON.stringify(data.multiStreamLayout));
                }

                tagsService.initializeDefaults();
                if (backupService.isEnabled()) await backupService.backup();

                logEvent('Favorites', 'import_json', 'file_upload');
                onSuccess(t('backup.import_success'));
                setTimeout(() => window.location.reload(), 1000); // 重新啟動以載入全新數據庫
            } catch (error) {
                onError(t('backup.import_error', { error: error instanceof Error ? error.message : t('backup.unknown_error') }));
            } finally {
                setIsProcessing(false);
            }
        };
        input.click();
    };

    return (
        <div className="flex-1 flex flex-col gap-8 max-w-2xl mx-auto w-full py-4 overflow-y-auto pr-4">
            {/* Export Section */}
            <div className="p-8 rounded-3xl border border-border bg-card">
                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-500">
                        <Download className="size-6" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold font-normal text-foreground">{t('export')}</h3>
                        <p className="text-sm text-muted-foreground">{t('backup.export_desc')}</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="p-4 rounded-xl flex items-start gap-3 bg-muted/50">
                        <ShieldCheck className="size-5 text-green-500 mt-0.5" />
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            {t('backup.export_helper')}
                        </p>
                    </div>
                    <Button
                        onClick={handleExportJSON}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white h-12 rounded-xl text-md font-medium"
                    >
                        {t('backup.export_btn')}
                    </Button>
                </div>
            </div>

            {/* Import Section */}
            <div className="p-8 rounded-3xl border border-dashed border-border bg-muted/30">
                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-500">
                        <Upload className="size-6" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold font-normal text-foreground">{t('import')}</h3>
                        <p className="text-sm text-muted-foreground">{t('backup.import_desc')}</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="p-4 rounded-xl flex items-start gap-3 bg-red-500/5 border border-red-500/15">
                        <AlertTriangle className="size-5 text-red-500 mt-0.5" />
                        <p className="text-xs text-red-500 font-medium leading-relaxed">
                            {t('backup.import_warning_detail')}
                        </p>
                    </div>
                    <Button
                        onClick={handleImportJSON}
                        disabled={isProcessing}
                        variant="outline"
                        className="w-full h-12 rounded-xl text-md font-medium border-border hover:bg-accent"
                    >
                        {isProcessing ? t('backup.processing') : t('backup.select_file')}
                    </Button>
                </div>
            </div>
        </div>
    );
}
