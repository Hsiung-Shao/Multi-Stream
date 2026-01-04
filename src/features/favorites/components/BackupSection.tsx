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

export function BackupSection({ theme, onSuccess, onError }: BackupSectionProps) {
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
            onSuccess('已成功匯出備份檔案');
        } catch (error) {
            onError(`匯出失敗: ${error instanceof Error ? error.message : '未知錯誤'}`);
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
                    throw new Error('無效的檔案格式');
                }

                // 恢復邏輯與原版 FavoritesManager.tsx (Line 694-716) 一致
                if (data.version) {
                    if (data.userSettings) localStorage.setItem('userSettings', JSON.stringify(data.userSettings));
                    if (data.favoriteStreams) favoritesService.saveFavorites(data.favoriteStreams);
                    if (data.favoriteCategories) favoritesService.saveCategories(data.favoriteCategories);
                    if (data.multiStreamLayout) localStorage.setItem('multiStreamLayout', JSON.stringify(data.multiStreamLayout));
                }

                tagsService.initializeDefaults();
                if (backupService.isEnabled()) await backupService.backup();

                logEvent('Favorites', 'import_json', 'file_upload');
                onSuccess('匯入成功，正在刷新資料...');
                setTimeout(() => window.location.reload(), 1000); // 重新啟動以載入全新數據庫
            } catch (error) {
                onError(`匯入失敗: ${error instanceof Error ? error.message : '未知錯誤'}`);
            } finally {
                setIsProcessing(false);
            }
        };
        input.click();
    };

    return (
        <div className="flex-1 flex flex-col gap-8 max-w-2xl mx-auto w-full py-4 overflow-y-auto pr-4">
            {/* Export Section */}
            <div className={`p-8 rounded-3xl border ${theme === 'dark' ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200 shadow-sm'
                }`}>
                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-500">
                        <Download className="size-6" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold font-normal">{t('exportJSON')}</h3>
                        <p className="text-sm text-gray-500">將您的所有收藏、分類與自定義設定下載為 JSON 檔案。</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className={`p-4 rounded-xl flex items-start gap-3 ${theme === 'dark' ? 'bg-gray-800/50' : 'bg-gray-50'}`}>
                        <ShieldCheck className="size-5 text-green-500 mt-0.5" />
                        <p className="text-xs text-gray-500 leading-relaxed">
                            這是最安全的備份方式。您可以將此檔案儲存在外部硬碟或雲端硬碟中，以便在其他電腦上恢復您的個人化配置。
                        </p>
                    </div>
                    <Button
                        onClick={handleExportJSON}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white h-12 rounded-xl text-md font-medium"
                    >
                        立即下載備份檔案 (.json)
                    </Button>
                </div>
            </div>

            {/* Import Section */}
            <div className={`p-8 rounded-3xl border border-dashed ${theme === 'dark' ? 'bg-gray-950/50 border-gray-700' : 'bg-gray-50/50 border-gray-300'
                }`}>
                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-500">
                        <Upload className="size-6" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold font-normal">{t('importJSON')}</h3>
                        <p className="text-sm text-gray-500">從先前備份的 JSON 檔案中恢復資料。</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className={`p-4 rounded-xl flex items-start gap-3 ${theme === 'dark' ? 'bg-red-500/5 border border-red-500/10' : 'bg-red-50 border border-red-100'}`}>
                        <AlertTriangle className="size-5 text-red-500 mt-0.5" />
                        <p className="text-xs text-red-600 font-medium leading-relaxed">
                            警告：匯入操作會「全數覆蓋」您目前在瀏覽器中的所有數據，包括收藏、標籤與佈局設定。匯入後頁面會自動重新整理。
                        </p>
                    </div>
                    <Button
                        onClick={handleImportJSON}
                        disabled={isProcessing}
                        variant="outline"
                        className={`w-full h-12 rounded-xl text-md font-medium ${theme === 'dark' ? 'border-gray-700 hover:bg-gray-800' : 'border-gray-300 hover:bg-white'
                            }`}
                    >
                        {isProcessing ? '正在處理並準備刷新...' : '選擇檔案並開始還原'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
