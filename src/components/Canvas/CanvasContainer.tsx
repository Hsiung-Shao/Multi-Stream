import { useEffect, useState } from 'react';
import { useStreamStore } from '../../store/useStreamStore';
import { CanvasItemWrapper } from './CanvasItemWrapper';

export function CanvasContainer() {
    const canvasItems = useStreamStore(s => s.canvasItems);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    return (
        <div className="w-full h-full relative overflow-hidden bg-muted/10">
            <div className="w-full h-full relative" style={{ minWidth: '100%', minHeight: '100%' }}>
                {canvasItems.map(item => (
                    <CanvasItemWrapper
                        key={item.i}
                        item={item}
                    />
                ))}
            </div>

            {/* Empty State / Instructional */}
            {canvasItems.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground pointer-events-none">
                    <p>Canvas is empty.</p>
                    <p className="text-sm">Use the editor to add Stream or Chat windows.</p>
                </div>
            )}
        </div>
    );
}
