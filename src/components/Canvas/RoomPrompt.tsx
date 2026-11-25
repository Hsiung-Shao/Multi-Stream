import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../store/useUIStore';
import { track } from '../../utils/analytics';

/**
 * 舊外殼的使用者進畫布時，提示可以換成房間模式。按任一鍵後不再出現（設定裡仍可切換）。
 * fixed 浮層、不推擠版面（畫布首次導覽曾是 CLS 主嫌）。
 */
export const RoomPrompt = () => {
    const { t } = useTranslation('common');
    const islandStyle = useUIStore(s => s.islandStyle);
    const seen = useUIStore(s => s.roomPromptSeen);
    const visible = islandStyle !== 'room' && !seen;

    useEffect(() => {
        if (visible) track.roomPrompt('shown');
    }, [visible]);

    if (!visible) return null;

    const accept = () => {
        const ui = useUIStore.getState();
        track.canvasShellSwitch(ui.islandStyle, 'room', 'prompt');
        track.roomPrompt('accept');
        ui.setIslandStyle('room');
        ui.setRoomPromptSeen(true);
    };
    const dismiss = () => {
        track.roomPrompt('dismiss');
        useUIStore.getState().setRoomPromptSeen(true);
    };

    return (
        <div
            role="dialog"
            aria-labelledby="room-prompt-title"
            className="fixed top-4 right-4 z-[55] w-[340px] max-w-[calc(100%-32px)] rounded-xl border border-violet-500/60 bg-[#0f1119]/97 p-4 text-white shadow-[0_18px_50px_rgba(0,0,0,0.6)]"
        >
            <h2 id="room-prompt-title" className="text-sm font-semibold">{t('room.prompt_title')}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-white/70">{t('room.prompt_desc')}</p>
            <div className="mt-3 flex gap-2">
                <button type="button" onClick={accept} className="h-9 px-3 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-semibold">
                    {t('room.prompt_accept')}
                </button>
                <button type="button" onClick={dismiss} className="h-9 px-3 rounded-lg border border-white/15 hover:bg-white/10 text-xs">
                    {t('room.prompt_dismiss')}
                </button>
            </div>
        </div>
    );
};
