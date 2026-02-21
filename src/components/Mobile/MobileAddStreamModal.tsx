import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus, Link as LinkIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { useStreamStore } from '../../store/useStreamStore';

interface MobileAddStreamModalProps {
    open: boolean;
    onClose: () => void;
}

export function MobileAddStreamModal({ open, onClose }: MobileAddStreamModalProps) {
    const { t } = useTranslation();
    const addStream = useStreamStore(s => s.addStream);
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = useCallback(async () => {
        if (!url.trim()) return;
        setLoading(true);
        setError('');

        try {
            const result = await addStream(url.trim());
            if (result.success) {
                setUrl('');
                onClose();
            } else {
                setError(result.message || t('mobile.add_stream.error', '無法新增串流'));
            }
        } catch {
            setError(t('mobile.add_stream.error', '無法新增串流'));
        } finally {
            setLoading(false);
        }
    }, [url, addStream, onClose, t]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[60] flex flex-col bg-gray-950/98 backdrop-blur-sm animate-in fade-in duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-4 h-14 border-b border-white/10">
                <h2 className="text-lg font-semibold text-white">
                    {t('mobile.add_stream.title', '新增串流')}
                </h2>
                <button onClick={onClose} className="p-2 text-muted-foreground hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col p-4 gap-4">
                <p className="text-sm text-muted-foreground">
                    {t('mobile.add_stream.desc', '輸入 Twitch 或 YouTube 頻道網址、頻道名稱或影片 ID')}
                </p>

                <div className="relative">
                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="url"
                        value={url}
                        onChange={(e) => { setUrl(e.target.value); setError(''); }}
                        placeholder="twitch.tv/channel 或 youtube.com/watch?v=..."
                        className="w-full h-12 pl-10 pr-4 rounded-xl bg-gray-900 border border-white/10 text-white placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 text-sm"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    />
                </div>

                {error && (
                    <p className="text-sm text-red-400">{error}</p>
                )}

                <Button
                    onClick={handleSubmit}
                    disabled={!url.trim() || loading}
                    className="h-12 rounded-xl text-base font-semibold"
                    size="lg"
                >
                    <Plus className="w-5 h-5 mr-2" />
                    {loading
                        ? t('mobile.add_stream.loading', '新增中...')
                        : t('mobile.add_stream.submit', '新增串流')
                    }
                </Button>

                {/* Quick tips */}
                <div className="mt-4 p-4 rounded-xl bg-gray-900/50 border border-white/5">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                        {t('mobile.add_stream.tips_title', '支援格式')}
                    </p>
                    <ul className="space-y-1.5 text-xs text-muted-foreground/70">
                        <li>• twitch.tv/channelname</li>
                        <li>• youtube.com/watch?v=VIDEO_ID</li>
                        <li>• youtube.com/@channelname/live</li>
                        <li>• {t('mobile.add_stream.tips_direct', '直接輸入 Twitch 頻道名稱')}</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
