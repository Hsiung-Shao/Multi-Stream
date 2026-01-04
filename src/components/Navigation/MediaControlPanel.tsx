import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import { Volume2, VolumeX, RefreshCw, X, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import { Button } from '../ui/button';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';
import { ScrollArea } from '../ui/scroll-area';
import { Label } from '../ui/label';
import { useUIStore } from '../../store/useUIStore';
import { useStreamStore } from '../../store/useStreamStore';
import { cn } from '../ui/utils';
import { useTranslation } from 'react-i18next';

interface MediaControlPanelProps {
    isExpanded: boolean;
    onMouseLeave?: () => void;
}

export const MediaControlPanel = ({ isExpanded, onMouseLeave }: MediaControlPanelProps) => {
    const { t } = useTranslation(['common', 'controlPanel']);

    // UI Store
    const masterVolume = useUIStore(s => s.masterVolume);
    const masterMuted = useUIStore(s => s.masterMuted);
    const setMasterVolume = useUIStore(s => s.setMasterVolume);
    const setMasterMuted = useUIStore(s => s.setMasterMuted);

    // Stream Store
    const streams = useStreamStore(s => s.streams);
    const moveStream = useStreamStore(s => s.moveStream);
    const removeStream = useStreamStore(s => s.removeStream);
    const updateStream = useStreamStore(s => s.updateStream);

    // 處理拖曳結束
    const handleDragEnd = (result: DropResult) => {
        if (!result.destination) return;

        const sourceIndex = result.source.index;
        const destinationIndex = result.destination.index;

        if (sourceIndex !== destinationIndex) {
            moveStream(sourceIndex, destinationIndex);
        }
    };

    // 處理串流重整
    const handleRefreshStream = (streamId: number) => {
        const stream = streams.find(s => s.id === streamId);
        if (stream) {
            updateStream(streamId, {
                _reloadKey: ((stream as any)._reloadKey || 0) + 1
            } as any);
        }
    };

    // 處理串流靜音切換
    const handleToggleMute = (streamId: number) => {
        const stream = streams.find(s => s.id === streamId);
        if (stream) {
            updateStream(streamId, { isMuted: !stream.isMuted });
        }
    };

    // 處理串流音量變更
    const handleVolumeChange = (streamId: number, volume: number) => {
        updateStream(streamId, { volume });

        // 如果音量 > 0 且目前是靜音狀態,自動取消靜音
        const stream = streams.find(s => s.id === streamId);
        if (stream && stream.isMuted && volume > 0) {
            updateStream(streamId, { isMuted: false });
        }
    };

    // 處理上下移動
    const handleMoveUp = (index: number) => {
        if (index > 0) {
            moveStream(index, index - 1);
        }
    };

    const handleMoveDown = (index: number) => {
        if (index < streams.length - 1) {
            moveStream(index, index + 1);
        }
    };

    // 獲取串流顯示名稱
    const getStreamDisplayName = (stream: any) => {
        return stream.displayName || stream.name || stream.channelId || stream.videoId || `串流 #${stream.id}`;
    };

    return (
        <div
            onMouseLeave={onMouseLeave}
            className={cn(
                "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[480px] bg-black/90 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden transition-all duration-500 ease-out origin-bottom",
                isExpanded
                    ? "opacity-100 scale-100 translate-y-0"
                    : "opacity-0 scale-95 translate-y-4 pointer-events-none"
            )}
            style={{ maxHeight: '500px' }}
        >
            <div className="p-4 space-y-4">
                {/* 總音量控制 */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Label className="text-white text-sm font-medium">
                            {t('controlPanel:masterVolume') || '總音量'}
                        </Label>
                        <div className="flex items-center gap-2">
                            <span className="text-purple-400 text-sm min-w-[48px] text-right">
                                {masterMuted ? '0%' : `${masterVolume}%`}
                            </span>
                            <Switch
                                checked={!masterMuted}
                                onCheckedChange={(checked: boolean) => setMasterMuted(!checked)}
                                className="data-[state=checked]:bg-purple-500"
                            />
                        </div>
                    </div>
                    <Slider
                        value={[masterVolume]}
                        min={0}
                        max={100}
                        step={1}
                        onValueChange={(value) => {
                            setMasterVolume(value[0]);
                            // 如果從靜音狀態拖動到非零值,自動取消靜音
                            if (value[0] > 0 && masterMuted) {
                                setMasterMuted(false);
                            }
                        }}
                        className="w-full"
                    />
                </div>

                {/* 分隔線 */}
                <div className="h-[1px] bg-white/10" />

                {/* 串流順序清單 */}
                <div className="space-y-2">
                    <Label className="text-white text-sm font-medium">
                        {t('controlPanel:streamOrder') || '串流順序'}
                    </Label>

                    {streams.length === 0 ? (
                        <div className="py-8 text-center text-sm text-gray-500">
                            {t('controlPanel:noStreams') || '目前沒有串流'}
                        </div>
                    ) : (
                        <DragDropContext onDragEnd={handleDragEnd}>
                            <Droppable droppableId="streams-list">
                                {(provided) => (
                                    <ScrollArea
                                        className="h-[300px] pr-2"
                                        {...provided.droppableProps}
                                        ref={provided.innerRef}
                                    >
                                        <div className="space-y-2">
                                            {streams.map((stream, index) => (
                                                <Draggable
                                                    key={stream.id}
                                                    draggableId={stream.id.toString()}
                                                    index={index}
                                                >
                                                    {(provided, snapshot) => (
                                                        <div
                                                            ref={provided.innerRef}
                                                            {...provided.draggableProps}
                                                            className={cn(
                                                                "rounded-lg border transition-all text-white",
                                                                snapshot.isDragging
                                                                    ? "!bg-purple-500 !border-purple-300 shadow-2xl ring-4 ring-purple-300/50 scale-105 !text-white"
                                                                    : "bg-gray-800/50 border-gray-700"
                                                            )}
                                                            style={provided.draggableProps.style}
                                                        >
                                                            {/* 串流項目標題列 */}
                                                            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700">
                                                                <div
                                                                    {...provided.dragHandleProps}
                                                                    className="cursor-grab active:cursor-grabbing"
                                                                >
                                                                    <GripVertical className="size-4 text-gray-500" />
                                                                </div>
                                                                <span className="text-sm font-medium flex-1 text-gray-300 truncate">
                                                                    #{index + 1} - {getStreamDisplayName(stream)}
                                                                </span>

                                                                {/* 控制按鈕 */}
                                                                <div className="flex gap-1">
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
                                                                        onClick={() => handleToggleMute(stream.id)}
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
                                                                        onClick={() => handleMoveUp(index)}
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
                                                                        onClick={() => handleMoveDown(index)}
                                                                        disabled={index === streams.length - 1}
                                                                        title={t('controlPanel:moveDown') || '下移'}
                                                                    >
                                                                        <ChevronDown className="size-3" />
                                                                    </Button>

                                                                    {/* 重整按鈕 */}
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-6 w-6 p-0 text-gray-400 hover:bg-gray-700"
                                                                        onClick={() => handleRefreshStream(stream.id)}
                                                                        title={'重整'}
                                                                    >
                                                                        <RefreshCw className="size-3" />
                                                                    </Button>

                                                                    {/* 關閉按鈕 */}
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-6 w-6 p-0 text-gray-400 hover:bg-red-900/30 hover:text-red-400"
                                                                        onClick={() => removeStream(stream.id)}
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
                                                                        onValueChange={(vals) => handleVolumeChange(stream.id, vals[0])}
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
                                                    )}
                                                </Draggable>
                                            ))}
                                            {provided.placeholder}
                                        </div>
                                    </ScrollArea>
                                )}
                            </Droppable>
                        </DragDropContext>
                    )}
                </div>
            </div>
        </div>
    );
};
