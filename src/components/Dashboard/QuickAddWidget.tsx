
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Youtube, Twitch, Play } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { useStreamStore } from '../../store/useStreamStore';
import { toast } from 'sonner';

export const QuickAddWidget = () => {
    const { t } = useTranslation(['common', 'welcome']);
    const [url, setUrl] = useState('');
    const addStream = useStreamStore(s => s.addStream);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!url.trim()) return;

        setIsLoading(true);
        try {
            const result = await addStream(url.trim());
            if (result.success) {
                setUrl('');
                toast.success(t('common:success') || 'Successfully added stream');
            } else {
                toast.error(result.message || 'Failed to add stream');
            }
        } catch (error) {
            toast.error('An error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 shadow-xl backdrop-blur-sm transition-all hover:bg-white dark:hover:bg-white/10 group">
            {/* Background Glow */}
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl group-hover:bg-blue-500/20 transition-all duration-500" />

            <h3 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Play className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                {t('welcome:quickAdd.title') || 'Quick Add'}
            </h3>

            <form onSubmit={handleSubmit} className="relative z-10 flex flex-col gap-3">
                <Input
                    placeholder={t('welcome:quickAdd.placeholder') || 'Paste Twitch or YouTube URL...'}
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-black/20 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:border-blue-500/50"
                />

                <div className="flex items-center justify-between">
                    <div className="flex gap-2 text-xs text-gray-500 dark:text-white/40">
                        <span className="flex items-center gap-1"><Twitch className="h-3 w-3" /> Twitch</span>
                        <span className="flex items-center gap-1"><Youtube className="h-3 w-3" /> YouTube</span>
                    </div>
                    <Button
                        type="submit"
                        disabled={!url.trim() || isLoading}
                        className="bg-blue-600 hover:bg-blue-500 text-white"
                    >
                        {isLoading ? '...' : (t('common:add') || 'Watch Now')}
                    </Button>
                </div>
            </form>
        </div>
    );
};
