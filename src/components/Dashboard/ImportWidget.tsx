
import { useTranslation } from 'react-i18next';
import { ArrowDownToLine, FileJson, Twitch } from 'lucide-react';
import { Button } from '../ui/button';
import { useUIStore } from '../../store/useUIStore';

export const ImportWidget = () => {
    const { t } = useTranslation(['welcome', 'favorites']);
    const openModal = useUIStore(s => s.openModal);

    return (
        <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur-sm transition-all hover:bg-white/10 group">
            <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-pink-500/10 blur-3xl group-hover:bg-pink-500/20 transition-all duration-500" />

            <h3 className="mb-4 text-xl font-semibold text-white flex items-center gap-2">
                <ArrowDownToLine className="h-5 w-5 text-pink-400" />
                {t('welcome:import.title') || 'Import Tools'}
            </h3>

            <div className="grid grid-cols-2 gap-3 relative z-10">
                <Button
                    variant="outline"
                    className="flex flex-col items-center gap-2 h-auto py-4 border-white/5 bg-black/20 hover:bg-purple-600 hover:border-purple-500 hover:text-white group/btn transition-all"
                    onClick={() => openModal('favorites', 'twitch_import')}
                >
                    <div className="rounded-full bg-white/5 p-2 group-hover/btn:bg-white/20 transition-colors">
                        <Twitch className="h-5 w-5 text-purple-400 group-hover/btn:text-white" />
                    </div>
                    <span className="text-xs text-white/60 group-hover/btn:text-white">Twitch</span>
                </Button>

                <Button
                    variant="outline"
                    className="flex flex-col items-center gap-2 h-auto py-4 border-white/5 bg-black/20 hover:bg-blue-600 hover:border-blue-500 hover:text-white group/btn transition-all"
                    onClick={() => openModal('favorites', 'batch')}
                >
                    <div className="rounded-full bg-white/5 p-2 group-hover/btn:bg-white/20 transition-colors">
                        <FileJson className="h-5 w-5 text-blue-400 group-hover/btn:text-white" />
                    </div>
                    <span className="text-xs text-white/60 group-hover/btn:text-white">JSON / Text</span>
                </Button>
            </div>
        </div>
    );
};
