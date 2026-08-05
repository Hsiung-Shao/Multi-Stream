import { useCallback } from 'react';
import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { cn } from './ui/utils';
import { getTwitchChatPopoutUrl, getYouTubeChatPopoutUrl } from '../utils/chatUtils';

interface ChatPopoutButtonProps {
    platform: 'twitch' | 'youtube';
    channelId: string;
    videoId?: string;
    className?: string;
}

/**
 * 在新視窗開啟原生聊天室。
 *
 * 內嵌的 iframe 屬第三方情境，瀏覽器封鎖第三方 cookie 時取不到登入態，使用者就無法發言。
 * 這是瀏覽器層的限制，前端無法繞過，因此提供這顆按鈕讓使用者在遇到問題時自行脫困——
 * 新視窗是第一方情境，登入態正常，必定能發言。
 *
 * 刻意不做自動偵測、不自動彈窗：無法可靠判斷 iframe 內是否已登入，誤判會變成騷擾。
 */
export function ChatPopoutButton({ platform, channelId, videoId, className }: ChatPopoutButtonProps) {
    const { t } = useTranslation('common');

    const handleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();

        const url = platform === 'twitch'
            ? getTwitchChatPopoutUrl(channelId)
            : videoId
                ? getYouTubeChatPopoutUrl(videoId)
                : null;

        if (!url) return;

        // noopener 防止開啟的第三方頁面透過 window.opener 反向操作本站
        window.open(url, '_blank', 'noopener,noreferrer,width=420,height=640');
    }, [platform, channelId, videoId]);

    // YouTube 沒有 videoId 就無從組出聊天室網址（頻道未開台時會是這種狀態）
    if (platform === 'youtube' && !videoId) return null;

    const label = t('chat.popout');

    return (
        <Button
            variant="ghost"
            size="icon"
            className={cn(
                'h-6 w-6 rounded-full text-white/70 hover:bg-white/20 hover:text-white nodrag',
                className,
            )}
            onClick={handleClick}
            title={label}
            aria-label={label}
        >
            <ExternalLink size={12} />
        </Button>
    );
}
