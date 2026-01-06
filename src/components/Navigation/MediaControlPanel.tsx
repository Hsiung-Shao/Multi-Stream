
import React from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';
import { ScrollArea } from '../ui/scroll-area';
import { Label } from '../ui/label';
import { StreamListItem } from './StreamListItem';
import { useUIStore } from '../../store/useUIStore';
import { useStreamStore } from '../../store/useStreamStore';
import { cn } from '../ui/utils';
import { useTranslation } from 'react-i18next';

// Wrapper for Sortable Item
const SortableStreamItem = (props: any) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: props.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        position: 'relative' as 'relative',
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <StreamListItem {...props} isDragging={isDragging} />
        </div>
    );
};

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

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // 處理拖曳結束
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (active.id !== over?.id) {
            const oldIndex = streams.findIndex((s) => s.id.toString() === active.id);
            const newIndex = streams.findIndex((s) => s.id.toString() === over?.id);

            if (oldIndex !== -1 && newIndex !== -1) {
                moveStream(oldIndex, newIndex);
            }
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
                <div className="h-3 w-[1px] bg-white/10" />

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
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={streams.map(s => s.id.toString())}
                                strategy={verticalListSortingStrategy}
                            >
                                <ScrollArea className="h-[300px] pr-2">
                                    <div className="space-y-2">
                                        {streams.map((stream, index) => (
                                            <SortableStreamItem
                                                key={stream.id}
                                                id={stream.id.toString()}
                                                stream={stream}
                                                index={index}
                                                masterMuted={masterMuted}
                                                totalStreams={streams.length}
                                                onToggleMute={handleToggleMute}
                                                onVolumeChange={handleVolumeChange}
                                                onMoveUp={handleMoveUp}
                                                onMoveDown={handleMoveDown}
                                                onRefresh={handleRefreshStream}
                                                onRemove={removeStream}
                                                t={t}
                                            />
                                        ))}
                                    </div>
                                </ScrollArea>
                            </SortableContext>
                        </DndContext>
                    )}
                </div>
            </div>
        </div>
    );
};
