import { ComponentType } from 'react';
import { AlertTriangle } from 'lucide-react';
import { CanvasItem } from '../../../types/canvas';

interface WindowContentProps {
    item: CanvasItem;
    BlockComponent?: ComponentType<any>;
    onUpdate: (updates: Partial<CanvasItem>) => void;
    onRemove: () => void;
}

export function WindowContent({ item, BlockComponent, onUpdate, onRemove }: WindowContentProps) {
    if (!BlockComponent) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-destructive">
                <AlertTriangle className="w-8 h-8 mb-2" />
                <span>Unknown Block</span>
            </div>
        );
    }

    return (
        <div className="w-full h-full">
            <BlockComponent
                item={item}
                onUpdate={onUpdate}
                onRemove={onRemove}
            />
        </div>
    );
}
