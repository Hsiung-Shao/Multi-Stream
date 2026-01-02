import { useEffect, useState } from 'react';
import { useStreamStore } from '../../store/useStreamStore';
import { CanvasItemWrapper } from './CanvasItemWrapper';
import { ScrollArea, ScrollBar } from '../ui/scroll-area';

import { registerStandardBlocks } from './blocks';

export function CanvasContainer() {
    const canvasItems = useStreamStore(s => s.canvasItems);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        registerStandardBlocks();
        setMounted(true);
    }, []);

    if (!mounted) return null;

    return (
        <ScrollArea className="w-full h-full bg-muted/10">
            <div className="w-full h-full relative" style={{ minWidth: '100%', minHeight: '100%' }}>
                {canvasItems.map(item => (
                    <CanvasItemWrapper
                        key={item.i}
                        item={item}
                    />
                ))}
            </div>

            {/* Empty State / Instructional - Absolute within relative container might need adjustment or put inside ScrollArea viewport?
               Shadcn ScrollArea renders a viewport. Absolute children to ScrollArea might be relative to viewport. 
               Let's keep it simple. If I put it inside ScrollArea, it scrolls.
               If I want it centered on screen regardless of scroll, I might need to put it outside ScrollArea?
               But CanvasContainer returns the whole area.
               If it's empty, scroll area doesn't matter much.
            */}
            {canvasItems.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground pointer-events-none z-0">
                    <p>Canvas is empty.</p>
                    <p className="text-sm">Use the editor to add Stream or Chat windows.</p>
                </div>
            )}
            <ScrollBar orientation="horizontal" />
            <ScrollBar orientation="vertical" />
        </ScrollArea>
    );
}
