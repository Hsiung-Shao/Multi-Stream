import { useEffect, useRef, useState } from 'react';
import { getTwitchChatUrl, getYouTubeChatUrl } from '../utils/chatUtils';
import { Button } from './ui/button';
import { RefreshCw } from 'lucide-react';

interface StreamChatProps {
    platform: 'twitch' | 'youtube';
    channelId: string;
    videoId?: string;
    className?: string; // For layout/sizing
    theme?: 'light' | 'dark';
}

export function StreamChat({ platform, channelId, videoId, className, theme }: StreamChatProps) {
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

    return (
        <iframe
            ref={iframeRef}
            key={`${loadKey}-${theme}`} // Force recreation on reload or theme change
            src={src}
            className={`w-full h-full border-0 ${className || ''}`}
            title={`chat-${platform}-${channelId}`}
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        />
    );
}
