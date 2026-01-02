import { useTranslation } from 'react-i18next';
import { MonitorPlay, ArrowLeftRight } from 'lucide-react';

import { BlockComponentProps } from '../BlockRegistry';
import { StreamBox } from '../../StreamBox';
import { useStreamStore } from '../../../store/useStreamStore';
import { useUIStore } from '../../../store/useUIStore';
import { Button } from '../../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';

export function StreamBlock({ item, onUpdate, onRemove }: BlockComponentProps) {
    const { t } = useTranslation('common');
    const streams = useStreamStore(s => s.streams);
    const updateCanvasItem = useStreamStore(s => s.updateCanvasItem);

    // Global UI State
    const theme = useUIStore(s => s.theme);
    const masterVolume = useUIStore(s => s.masterVolume);
    const masterMuted = useUIStore(s => s.masterMuted);

    // Resolve content
    const stream = item.contentId ? streams.find(s => s.id === item.contentId) : null;

    // Handle Stream Updates
    const handleVolumeChange = (id: number, volume: number) => {
        useStreamStore.getState().updateStream(id, { volume });
    };

    const handleReload = (id: number) => {
        const stream = streams.find(s => s.id === id);
        if (stream) {
            useStreamStore.getState().updateStream(id, {
                _reloadKey: (stream._reloadKey || 0) + 1
            } as any);
        }
    };

    // If no content, show Empty State (Selector)
    if (!stream) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/80 gap-3 p-4">
                <div className="flex flex-col items-center gap-1 opacity-50">
                    <MonitorPlay className="w-8 h-8" />
                    <span className="text-xs font-medium">
                        {t('layout.waiting_stream')}
                    </span>
                </div>

                <div className="flex flex-col gap-2 w-full max-w-[180px] z-20">
                    <Select
                        onValueChange={(value: string) => {
                            if (value) {
                                onUpdate({ contentId: Number(value) });
                            }
                        }}
                    >
                        <SelectTrigger
                            className="w-full h-8 text-xs bg-background/80 border rounded-md"
                            onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
                        >
                            {/* @ts-ignore */}
                            <SelectValue placeholder={t('layout.select_stream') || "Select Stream"} />
                        </SelectTrigger>
                        <SelectContent>
                            {streams.map(s => (
                                <SelectItem key={s.id} value={String(s.id)}>
                                    {s.displayName || s.name || `Stream ${s.id}`}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-2 w-full bg-background/50"
                        onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            // Switch type to chat
                            // Note: This changes the block type!
                            // We need access to parent's update mechanism which we have via onUpdate
                            // BUT onUpdate updates *this* item. Changing 'type' will cause Registry to re-render with new Component.
                            onUpdate({ type: 'chat' });
                        }}
                        onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
                    >
                        <ArrowLeftRight className="w-3 h-3" />
                        Switch to Chat
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <StreamBox
            streamData={stream}
            theme={theme}
            mode="stream-only"
            masterVolume={masterVolume}
            isMasterMuted={masterMuted}
            layoutStyle={{
                position: 'absolute',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%'
            }}
            onRemove={() => onRemove()}
            onReload={handleReload}
            onToggleChat={() => { }}
            onSeparateChat={() => { }}
            onVolumeChange={handleVolumeChange} // Connected to store update
            streamIndex={-1}
        />
    );
}
