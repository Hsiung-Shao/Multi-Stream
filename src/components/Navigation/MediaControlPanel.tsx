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
        <div ref={setNodeRef} style={style} {...attributes}>
            <StreamListItem {...props} dragListeners={listeners} isDragging={isDragging} />
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

    // 處理雙擊總靜音 (解鎖所有的單獨靜音)
    const handleMasterMuteDoubleClick = () => {
        // 使用者要求：快速連點來解除所有的單獨靜音 (Unmute All Streams)
        // 且 "右上角的靜音switch 依舊保持開關音效的功能" -> 意味著雙擊不應更改 Master Mute 本身?
        // 但如果 Master Mute 是開啟的 (靜音中)，解除個別靜音後是否要有聲音?
        // 根據 "單獨靜音歸單獨靜音... 不應解除全部靜音"，我們僅操作 setAllMuted(false)。

        useStreamStore.getState().setAllMuted(false);
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
        updateStream(streamId, { isMuted: !streams.find(s => s.id === streamId)?.isMuted });

        // Removed: setMasterMuted(false) 
        // User Request: "When individual mute is released, it should not release all mute"
    };

    // 處理串流音量變更
    const handleVolumeChange = (streamId: number, volume: number) => {
        updateStream(streamId, { volume });

        // 如果音量 > 0 且目前是靜音狀態,自動取消靜音
        const stream = streams.find(s => s.id === streamId);
        if (stream && stream.isMuted && volume > 0) {
            updateStream(streamId, { isMuted: false });
        }

        // Removed: setMasterMuted(false)
        // User Request: "When individual mute is released, it should not release all mute"
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
                        <Label
                            className="text-white text-sm font-medium cursor-pointer select-none"
                            onDoubleClick={handleMasterMuteDoubleClick}
                            title="雙擊此處可切換全部靜音/解除全部靜音"
                        >
                            {t('controlPanel:masterVolume') || '總音量'}
                        </Label>
                        <div className="flex items-center gap-2">
                            <span className="text-purple-400 text-sm min-w-[48px] text-right">
                                {masterMuted ? '0%' : `${masterVolume}%`}
                            </span>
                            <Switch
                                checked={!masterMuted}
                                onCheckedChange={(checked: boolean) => {
                                    // checked = true (Sound On) -> Muted = false
                                    // checked = false (Sound Off) -> Muted = true
                                    const newMuted = !checked;
                                    setMasterMuted(newMuted);

                                    // Master Switch acts as Batch Controller
                                    // User Requirement: "總靜音開關功能依舊保持可以開關音量的功能"
                                    // This means toggling this switch should Mute/Unmute everything.
                                    useStreamStore.getState().setAllMuted(newMuted);
                                }}
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
                            const newVal = value[0];
                            setMasterVolume(newVal);

                            // Volume 0 -> Auto Mute (Batch)
                            if (newVal === 0 && !masterMuted) {
                                setMasterMuted(true);
                                useStreamStore.getState().setAllMuted(true);
                            }
                            // Volume > 0 -> Auto Unmute (Batch) from Muted state
                            else if (newVal > 0 && masterMuted) {
                                setMasterMuted(false);
                                useStreamStore.getState().setAllMuted(false);
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
