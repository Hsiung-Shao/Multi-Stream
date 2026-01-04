import { useState } from 'react';
import { GripHorizontal, X, Volume2, VolumeX, RefreshCw, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../ui/button';
import { Slider } from '../../ui/slider';
import { useTranslation } from 'react-i18next';

interface WindowHeaderProps {
    title: string;
    width?: number;
    height?: number;
    onRemove: () => void;
    windowType?: 'stream' | 'chat' | 'default';

    // Common Props
    onReload: () => void;

    // Stream Specific Props (Optional)
    onToggleChat?: () => void;
    onToggleMute?: () => void;
    onVolumeChange?: (val: number[]) => void;
    onVolumeCommit?: (val: number[]) => void;
    isMuted?: boolean;
    volume?: number;
    chatVisible?: boolean;
}

export function WindowHeader({
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

    // Common Components
    const DragHandle = () => (
        <div className="grid-item-drag-handle cursor-move flex items-center text-white/70 hover:text-white mr-1 gap-2">
            <GripHorizontal size={14} />
            <span className="text-[10px] font-medium max-w-[100px] truncate">
                {title}
            </span>
            {(width !== undefined && height !== undefined) && (
                <>
                    <div className="h-3 w-[1px] bg-white/20" />
                    <span className="text-xs font-bold text-white/70">
                        {width} x {height}
                    </span>
                </>
            )}
        </div>
    );

    const ReloadButton = () => (
        <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-full hover:bg-white/20 text-white/70 hover:text-white"
            onClick={(e: React.MouseEvent) => { e.stopPropagation(); onReload(); }}
            title={t('common.reload', '重新整理')}
        >
            <RefreshCw size={12} />
        </Button>
    );

    const CloseButton = () => (
        <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-full hover:bg-red-500/20 text-white/70 hover:text-red-400"
            onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onRemove();
            }}
            title={t('common.close', '關閉')}
        >
            <X size={12} />
        </Button>
    );

    const VolumeControl = () => (
        onToggleMute && onVolumeChange && (
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
        )
    );

    const ChatToggle = () => (
        onToggleChat && (
            <Button
                variant="ghost"
                size="icon"
                className={`h-6 w-6 rounded-full hover:bg-white/20 ${chatVisible ? 'text-purple-400' : 'text-white/70 hover:text-white'}`}
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); onToggleChat(); }}
                title={chatVisible ? t('layout.hide_chat', "隱藏聊天室") : t('layout.show_chat', "顯示聊天室")}
            >
                <MessageSquare size={12} />
            </Button>
        )
    );

    const Divider = () => <div className="h-3 w-[1px] bg-white/20 mx-1" />;

    return (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-1 p-1 pl-3 pr-1 bg-black/80 backdrop-blur-md rounded-full border border-white/10 shadow-lg transition-opacity opacity-0 group-hover:opacity-100 select-none">

            {/* Stream Layout: ID (with grid size) | Close */}
            {windowType === 'stream' && (
                <>
                    <DragHandle />
                    <Divider />
                    <CloseButton />
                </>
            )}

            {/* Chat Layout: ID (with grid size) | Close */}
            {windowType === 'chat' && (
                <>
                    <DragHandle />
                    <Divider />
                    <CloseButton />
                </>
            )}

            {/* Default Layout (Fallback) */}
            {windowType === 'default' && (
                <>
                    <DragHandle />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-full hover:bg-white/20 text-white/50 hover:text-white"
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); }}
                    >
                        {isCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
                    </Button>

                    {!isCollapsed && (
                        <>
                            <Divider />
                            <VolumeControl />
                            <Divider />
                            <ReloadButton />
                            {onToggleChat && <Divider />}
                            <ChatToggle />
                        </>
                    )}
                    <Divider />
                    <CloseButton />
                </>
            )}

        </div>
    );
}
