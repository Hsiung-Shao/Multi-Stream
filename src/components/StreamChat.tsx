import { useEffect, useRef, useState } from 'react';
import { getTwitchChatUrl, getYouTubeChatUrl } from '../utils/chatUtils';
import { Button } from './ui/button';
import { RefreshCw } from 'lucide-react';
import { ChatPopoutButton } from './ChatPopoutButton';
import { cn } from './ui/utils';

interface StreamChatProps {
    platform: 'twitch' | 'youtube';
    channelId: string;
    videoId?: string;
    className?: string; // For layout/sizing
    theme?: 'light' | 'dark';
    // 自帶的迷你工具列（目前只放「另開視窗」）。呼叫端若已有自己的視窗工具列，
    // 傳 false 改把 ChatPopoutButton 併進該工具列，避免疊兩條 bar。
    showToolbar?: boolean;
}

export function StreamChat({ platform, channelId, videoId, className, theme, showToolbar = true }: StreamChatProps) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [retryCount, setRetryCount] = useState(0);
    const [isError, setIsError] = useState(false);
    const [loadKey, setLoadKey] = useState(0); // For forcing re-render/iframe reload

    // Watchdog Configuration
    const MAX_RETRIES = 3;
    const LOAD_TIMEOUT = 10000;

    useEffect(() => {
        // Only YouTube needs monitoring for "video unavailable" etc in chat iframe (if possible)
        // Or general load monitoring.
        // Twitch chat is usually reliable or handles itself.
        if (platform !== 'youtube') return;

        if (!iframeRef.current) return;

        let loadTimer: NodeJS.Timeout;

        const handleLoad = () => {
            // Success
            setIsError(false);
            setRetryCount(0);
            clearTimeout(loadTimer);
        };

        const handleError = () => {
            if (retryCount < MAX_RETRIES) {
                const delay = 2000 * Math.pow(2, retryCount); // Exponential backoff
                setTimeout(() => {
                    setRetryCount(prev => prev + 1);
                    setLoadKey(prev => prev + 1); // Reload
                }, delay);
            } else {
                setIsError(true);
            }
        };

        // Attach listeners
        const iframe = iframeRef.current;

        // Note: cross-origin iframes might not fire onerror reliable or allow content access
        // But we check what we can.
        iframe.addEventListener('load', handleLoad);
        iframe.addEventListener('error', handleError);

        // Watchdog Timeout (if load doesn't fire)
        loadTimer = setTimeout(() => {
            // If we haven't loaded by now, assume stuck
            handleError();
        }, LOAD_TIMEOUT);

        return () => {
            iframe.removeEventListener('load', handleLoad);
            iframe.removeEventListener('error', handleError);
            clearTimeout(loadTimer);
        };
    }, [platform, loadKey, retryCount, theme]); // Depend on loadKey to re-attach on reload

    // Construct URL
    let src = '';
    if (platform === 'twitch') {
        src = getTwitchChatUrl(channelId, theme);
    } else if (platform === 'youtube' && videoId) {
        src = getYouTubeChatUrl(videoId, theme);
    } else {
        // If missing IDs
        return <div className="flex items-center justify-center h-full text-gray-400 text-xs">No Chat Configured</div>;
    }

    if (isError) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-gray-900 text-white p-4 text-center">
                <span className="text-sm mb-2">無法載入聊天室</span>
                <Button size="sm" variant="outline" onClick={() => {
                    setRetryCount(0);
                    setIsError(false);
                    setLoadKey(prev => prev + 1);
                }}>
                    <RefreshCw className="w-3 h-3 mr-1" /> 重試
                </Button>
            </div>
        );
    }

    const iframe = (
        <iframe
            ref={iframeRef}
            key={`${loadKey}-${theme}`} // Force recreation on reload or theme change
            src={src}
            className={showToolbar ? 'w-full flex-1 min-h-0 border-0' : `w-full h-full border-0 ${className || ''}`}
            title={`chat-${platform}-${channelId}`}
            // allow-forms：送出訊息需要表單提交
            // allow-storage-access-by-user-activation：讓 Twitch/YouTube 能透過 Storage Access API
            //   向瀏覽器索取第三方 cookie 權限，這是 iframe 內能維持登入態（進而能發言）的前提
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-storage-access-by-user-activation"
        />
    );

    if (!showToolbar) return iframe;

    return (
        <div className={cn('w-full h-full flex flex-col bg-black', className)}>
            <div className="flex h-7 shrink-0 items-center justify-end gap-1 border-b border-white/10 bg-black/80 px-1">
                <ChatPopoutButton platform={platform} channelId={channelId} videoId={videoId} />
            </div>
            {iframe}
        </div>
    );
}
