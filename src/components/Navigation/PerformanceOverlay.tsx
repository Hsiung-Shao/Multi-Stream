import { useEffect, useState, useRef, memo, useCallback } from 'react';
import { X, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { useUIStore } from '../../store/useUIStore';
import { usePlayerStore } from '../../store/playerStore';
import { useStreamStore } from '../../store/useStreamStore';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';

interface PerformanceStats {
    browserFps: number;
    memory?: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
    };
    twitchStats: Array<{
        id: number;
        name: string;
        videoFps?: number;
        droppedFrames?: number;
        hlsLatency?: number;
    }>;
}

// Extend Performance interface for Chrome memory API
declare global {
    interface Performance {
        memory?: {
            usedJSHeapSize: number;
            totalJSHeapSize: number;
            jsHeapSizeLimit: number;
        };
    }
}

export const PerformanceOverlay = memo(function PerformanceOverlay() {
    const showOverlay = useUIStore(s => s.showPerformanceOverlay);
    const toggleOverlay = useUIStore(s => s.togglePerformanceOverlay);
    const players = usePlayerStore(s => s.players);
    const streams = useStreamStore(s => s.streams);

    const [stats, setStats] = useState<PerformanceStats>({
        browserFps: 0,
        twitchStats: []
    });

    const [isCollapsed, setIsCollapsed] = useState(false);
    const [position, setPosition] = useState({ x: 20, y: 20 });
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const overlayRef = useRef<HTMLDivElement>(null);

    // FPS calculation refs
    const frameCountRef = useRef(0);
    const lastTimeRef = useRef(performance.now());
    const animationFrameRef = useRef<number | undefined>(undefined);

    // Calculate browser FPS using requestAnimationFrame
    useEffect(() => {
        if (!showOverlay) return;

        const calculateFps = () => {
            frameCountRef.current++;
            const now = performance.now();
            const elapsed = now - lastTimeRef.current;

            if (elapsed >= 1000) { // Update every second
                const fps = Math.round((frameCountRef.current * 1000) / elapsed);
                frameCountRef.current = 0;
                lastTimeRef.current = now;

                // Collect stats
                const newStats: PerformanceStats = {
                    browserFps: fps,
                    twitchStats: []
                };

                // Memory (Chrome only)
                if (performance.memory) {
                    newStats.memory = {
                        usedJSHeapSize: performance.memory.usedJSHeapSize,
                        totalJSHeapSize: performance.memory.totalJSHeapSize
                    };
                }

                // Twitch player stats
                Object.entries(players).forEach(([id, playerEntry]) => {
                    if (playerEntry?.type === 'twitch' && playerEntry.player) {
                        try {
                            const playbackStats = playerEntry.player.getPlaybackStats?.();
                            if (playbackStats) {
                                const stream = streams.find(s => s.id === Number(id));
                                newStats.twitchStats.push({
                                    id: Number(id),
                                    name: stream?.displayName || stream?.channelId || `Stream ${id}`,
                                    videoFps: playbackStats.videoFrameRate,
                                    droppedFrames: playbackStats.droppedFrames,
                                    hlsLatency: playbackStats.hlsLatencyBroadcaster
                                });
                            }
                        } catch (e) {
                            // Player might not be ready
                        }
                    }
                });

                setStats(newStats);
            }

            animationFrameRef.current = requestAnimationFrame(calculateFps);
        };

        animationFrameRef.current = requestAnimationFrame(calculateFps);

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [showOverlay, players, streams]);

    // Keyboard shortcut (F3)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F3') {
                e.preventDefault();
                toggleOverlay();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [toggleOverlay]);

    // Drag handlers
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (overlayRef.current) {
            setIsDragging(true);
            dragOffset.current = {
                x: e.clientX - position.x,
                y: e.clientY - position.y
            };
        }
    }, [position]);

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            setPosition({
                x: Math.max(0, Math.min(window.innerWidth - 200, e.clientX - dragOffset.current.x)),
                y: Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.current.y))
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    // Format bytes to MB
    const formatBytes = (bytes: number) => {
        return (bytes / 1024 / 1024).toFixed(1);
    };

    if (!showOverlay) return null;

    return (
        <div
            ref={overlayRef}
            className={cn(
                "fixed z-[9999] bg-black/85 backdrop-blur-sm rounded-lg border border-white/20 shadow-2xl",
                "font-mono text-xs text-white select-none",
                isDragging && "cursor-grabbing"
            )}
            style={{
                left: position.x,
                top: position.y,
                minWidth: isCollapsed ? 'auto' : '220px'
            }}
        >
            {/* Header */}
            <div
                className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/10 cursor-grab"
                onMouseDown={handleMouseDown}
            >
                <div className="flex items-center gap-2">
                    <Activity size={14} className="text-green-400" />
                    <span className="font-semibold">效能監控</span>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 hover:bg-white/10"
                        onClick={() => setIsCollapsed(!isCollapsed)}
                    >
                        {isCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 hover:bg-red-500/20 hover:text-red-400"
                        onClick={toggleOverlay}
                    >
                        <X size={12} />
                    </Button>
                </div>
            </div>

            {/* Content */}
            {!isCollapsed && (
                <div className="px-3 py-2 space-y-2">
                    {/* Browser FPS */}
                    <div className="flex justify-between items-center">
                        <span className="text-white/60">瀏覽器 FPS</span>
                        <span className={cn(
                            "font-bold",
                            stats.browserFps >= 55 ? "text-green-400" :
                                stats.browserFps >= 30 ? "text-yellow-400" : "text-red-400"
                        )}>
                            {stats.browserFps}
                        </span>
                    </div>

                    {/* Memory (Chrome only) */}
                    {stats.memory && (
                        <div className="flex justify-between items-center">
                            <span className="text-white/60">記憶體</span>
                            <span className="text-blue-400">
                                {formatBytes(stats.memory.usedJSHeapSize)} / {formatBytes(stats.memory.totalJSHeapSize)} MB
                            </span>
                        </div>
                    )}

                    {/* Twitch Streams */}
                    {stats.twitchStats.length > 0 && (
                        <div className="border-t border-white/10 pt-2 mt-2">
                            <div className="text-white/40 text-[10px] uppercase tracking-wider mb-1">Twitch 串流</div>
                            {stats.twitchStats.map((ts) => (
                                <div key={ts.id} className="py-1 border-b border-white/5 last:border-0">
                                    <div className="text-white/80 truncate max-w-[180px]">{ts.name}</div>
                                    <div className="flex gap-3 text-[10px] mt-0.5">
                                        {ts.videoFps !== undefined && (
                                            <span className="text-green-400">{Math.round(ts.videoFps)} FPS</span>
                                        )}
                                        {ts.droppedFrames !== undefined && ts.droppedFrames > 0 && (
                                            <span className="text-orange-400">掉幀: {ts.droppedFrames}</span>
                                        )}
                                        {ts.hlsLatency !== undefined && (
                                            <span className="text-purple-400">{ts.hlsLatency.toFixed(1)}s 延遲</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Shortcut hint */}
                    <div className="text-white/30 text-[10px] text-center pt-1">
                        按 F3 切換顯示
                    </div>
                </div>
            )}
        </div>
    );
});
