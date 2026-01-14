import { Volume2, VolumeX, RefreshCw, X, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import { Button } from '../ui/button';
import { Slider } from '../ui/slider';
import { cn } from '../ui/utils';
import { StreamData } from '../../utils/streamUtils';
import { TFunction } from 'i18next';

interface StreamListItemProps {
    stream: StreamData;
    index: number;
    isDragging?: boolean;
    masterMuted: boolean;
    totalStreams: number;
    onToggleMute: (id: number) => void;
    onVolumeChange: (id: number, volume: number) => void;
    onMoveUp: (index: number) => void;
    onMoveDown: (index: number) => void;
    onRefresh: (id: number) => void;
    onRemove: (id: number) => void;
    t: TFunction<["common", "controlPanel"]>;
    dragListeners?: any;
}

export const StreamListItem = ({
    stream,
    index,
    isDragging,
    masterMuted,
    totalStreams,
    onToggleMute,
    onVolumeChange,
    onMoveUp,
    onMoveDown,
    onRefresh,
    onRemove,
    t,
    dragListeners
}: StreamListItemProps) => {

    // 獲取串流顯示名稱
    const getStreamDisplayName = (stream: any) => {
        return stream.displayName || stream.name || stream.videoId || `串流 #${stream.id}`;
    };

    return (
        <div
            className={cn(
                "rounded-lg border transition-all text-white",
                isDragging
                    ? "!bg-purple-500 !border-purple-300 shadow-2xl ring-4 ring-purple-300/50 scale-105 !text-white"
                    : "bg-gray-800/50 border-gray-700"
            )}
        >
            {/* 串流項目標題列 */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700">
                <div
                    className="cursor-grab active:cursor-grabbing hover:text-white text-gray-500 flex-shrink-0 touch-none"
                    {...dragListeners}
                >
                    <GripVertical className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-300 truncate" title={getStreamDisplayName(stream)}>
                        #{index + 1} - {getStreamDisplayName(stream)}
                    </div>
                </div>

                {/* 控制按鈕 */}
                <div className="flex items-center gap-1 flex-shrink-0">
                    {/* 靜音按鈕 */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                            "h-6 w-6 p-0",
                            stream.isMuted
                                ? "text-red-400 hover:bg-red-900/30"
                                : "text-gray-400 hover:bg-gray-700"
                        )}
                        onClick={() => onToggleMute(stream.id)}
                        title={stream.isMuted ? '取消靜音' : '靜音'}
                    >
                        {stream.isMuted ? (
                            <VolumeX className="size-3" />
                        ) : (
                            <Volume2 className="size-3" />
                        )}
                    </Button>

                    {/* 上移按鈕 */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 p-0 text-gray-400 hover:bg-gray-700"
                        onClick={() => onMoveUp(index)}
                        disabled={index === 0}
                        title={t('controlPanel:moveUp') || '上移'}
                    >
                        <ChevronUp className="size-3" />
                    </Button>

                    {/* 下移按鈕 */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 p-0 text-gray-400 hover:bg-gray-700"
                        onClick={() => onMoveDown(index)}
                        disabled={index === totalStreams - 1}
                        title={t('controlPanel:moveDown') || '下移'}
                    >
                        <ChevronDown className="size-3" />
                    </Button>

                    {/* 重整按鈕 */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 p-0 text-gray-400 hover:bg-gray-700"
                        onClick={() => onRefresh(stream.id)}
                        title={'重整'}
                    >
                        <RefreshCw className="size-3" />
                    </Button>

                    {/* 關閉按鈕 */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 p-0 text-gray-400 hover:bg-red-900/30 hover:text-red-400"
                        onClick={() => onRemove(stream.id)}
                        title={t('controlPanel:remove') || '關閉'}
                    >
                        <X className="size-3" />
                    </Button>
                </div>
            </div>

            {/* 音量控制 */}
            <div className="px-3 py-2 space-y-2">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">
                        🔊 {t('controlPanel:volume') || '音量'}
                    </span>
                    <Slider
                        value={[stream.volume || 100]}
                        onValueChange={(vals) => onVolumeChange(stream.id, vals[0])}
                        min={0}
                        max={100}
                        step={1}
                        className="flex-1"
                    />
                    <span className="text-xs min-w-[40px] text-right text-purple-400">
                        {masterMuted ? `0% (${stream.volume || 100}%)` : `${stream.volume || 100}%`}
                    </span>
                </div>
            </div>
        </div>
    );
};
