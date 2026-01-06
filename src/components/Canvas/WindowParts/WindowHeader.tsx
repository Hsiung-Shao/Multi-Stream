import { useState, memo, useCallback } from 'react';
import { GripHorizontal, X, Volume2, VolumeX, RefreshCw, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../ui/button';
import { Slider } from '../../ui/slider';
import { useTranslation } from 'react-i18next';

// Top-level memoized subcomponents to prevent recreation on each render

interface DragHandleProps {
    title: string;
}

const DragHandle = memo(function DragHandle({ title }: DragHandleProps) {
    return (
        <div className="grid-item-drag-handle cursor-move flex items-center text-white/70 hover:text-white mr-1 gap-2">
            <GripHorizontal size={14} />
            <span className="text-[10px] font-medium max-w-[100px] truncate">
                {title}
            </span>
        </div>
    );
});

interface ActionButtonProps {
    onClick: (e: React.MouseEvent) => void;
    title: string;
    icon: React.ReactNode;
    className?: string;
}

const ActionButton = memo(function ActionButton({ onClick, title, icon, className = '' }: ActionButtonProps) {
    return (
        <Button
            variant="ghost"
            size="icon"
            className={`h-6 w-6 rounded-full ${className}`}
            onClick={onClick}
            title={title}
        >
            {icon}
        </Button>
    );
});

interface VolumeControlProps {
    isMuted: boolean;
    volume: number;
    onToggleMute: () => void;
    onVolumeChange: (val: number[]) => void;
    onVolumeCommit?: (val: number[]) => void;
}

const VolumeControl = memo(function VolumeControl({
    isMuted,
    volume,
    onToggleMute,
    onVolumeChange,
    onVolumeCommit
}: VolumeControlProps) {
    return (
        <div className="flex items-center gap-1 group/vol">
            <Button
                variant="ghost"
                size="icon"
                className={`h-6 w-6 rounded-full hover:bg-white/20 ${isMuted ? 'text-red-400' : 'text-white/70 hover:text-white'}`}
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); onToggleMute(); }}
            >
                {isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
            </Button>

            <div
                className="w-24 mx-1 flex items-center nodrag"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerMove={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
            >
                <Slider
                    value={[isMuted ? 0 : volume]}
                    max={100}
                    step={1}
                    onValueChange={onVolumeChange}
                    onValueCommit={onVolumeCommit}
                    className="cursor-pointer nodrag"
                />
            </div>
        </div>
    );
});

const Divider = memo(function Divider() {
    return <div className="h-3 w-[1px] bg-white/20 mx-1" />;
});

// Main WindowHeader component
interface WindowHeaderProps {
    title: string;
    width?: number;
    height?: number;
    onRemove: () => void;
    windowType?: 'stream' | 'chat' | 'default';
    onReload: () => void;
    onToggleChat?: () => void;
    onToggleMute?: () => void;
    onVolumeChange?: (val: number[]) => void;
    onVolumeCommit?: (val: number[]) => void;
    isMuted?: boolean;
    volume?: number;
    chatVisible?: boolean;
}

export const WindowHeader = memo(function WindowHeader({
    title,
    width,
    height,
    onRemove,
    windowType = 'default',
    onReload,
    onToggleChat,
    onToggleMute,
    onVolumeChange,
    onVolumeCommit,
    isMuted = false,
    volume = 100,
    chatVisible = false
}: WindowHeaderProps) {
    const { t } = useTranslation('common');
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Memoized handlers
    const handleRemove = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onRemove();
    }, [onRemove]);

    const handleReload = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onReload();
    }, [onReload]);

    const handleToggleChat = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onToggleChat?.();
    }, [onToggleChat]);

    const handleToggleMute = useCallback(() => {
        onToggleMute?.();
    }, [onToggleMute]);

    const handleToggleCollapse = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setIsCollapsed(prev => !prev);
    }, []);

    return (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-1 p-1 pl-3 pr-1 bg-black/80 backdrop-blur-md rounded-full border border-white/10 shadow-lg transition-opacity opacity-0 group-hover:opacity-100 select-none">

            {/* Stream Layout: ID (with grid size) | Close */}
            {windowType === 'stream' && (
                <>
                    <DragHandle title={title} />
                    <Divider />
                    <ActionButton
                        onClick={handleRemove}
                        title={t('common.close', '關閉')}
                        icon={<X size={12} />}
                        className="hover:bg-red-500/20 text-white/70 hover:text-red-400"
                    />
                </>
            )}

            {/* Chat Layout: ID (with grid size) | Close */}
            {windowType === 'chat' && (
                <>
                    <DragHandle title={title} />
                    <Divider />
                    <ActionButton
                        onClick={handleRemove}
                        title={t('common.close', '關閉')}
                        icon={<X size={12} />}
                        className="hover:bg-red-500/20 text-white/70 hover:text-red-400"
                    />
                </>
            )}

            {/* Default Layout (Fallback) */}
            {windowType === 'default' && (
                <>
                    <DragHandle title={title} />
                    <ActionButton
                        onClick={handleToggleCollapse}
                        title=""
                        icon={isCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
                        className="hover:bg-white/20 text-white/50 hover:text-white"
                    />

                    {!isCollapsed && (
                        <>
                            <Divider />
                            {onToggleMute && onVolumeChange && (
                                <VolumeControl
                                    isMuted={isMuted}
                                    volume={volume}
                                    onToggleMute={handleToggleMute}
                                    onVolumeChange={onVolumeChange}
                                    onVolumeCommit={onVolumeCommit}
                                />
                            )}
                            <Divider />
                            <ActionButton
                                onClick={handleReload}
                                title={t('common.reload', '重新整理')}
                                icon={<RefreshCw size={12} />}
                                className="hover:bg-white/20 text-white/70 hover:text-white"
                            />
                            {onToggleChat && <Divider />}
                            {onToggleChat && (
                                <ActionButton
                                    onClick={handleToggleChat}
                                    title={chatVisible ? t('layout.hide_chat', "隱藏聊天室") : t('layout.show_chat', "顯示聊天室")}
                                    icon={<MessageSquare size={12} />}
                                    className={`hover:bg-white/20 ${chatVisible ? 'text-purple-400' : 'text-white/70 hover:text-white'}`}
                                />
                            )}
                        </>
                    )}
                    <Divider />
                    <ActionButton
                        onClick={handleRemove}
                        title={t('common.close', '關閉')}
                        icon={<X size={12} />}
                        className="hover:bg-red-500/20 text-white/70 hover:text-red-400"
                    />
                </>
            )}

        </div>
    );
});
