import { ComponentType, memo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { CanvasItem } from '../../../types/canvas';

interface WindowContentProps {
    item: CanvasItem;
    BlockComponent?: ComponentType<any>;
    onUpdate: (updates: Partial<CanvasItem>) => void;
    onRemove: () => void;
    resizingDimensions?: { w: number, h: number };
}

export const WindowContent = memo(function WindowContent({
    item,
    BlockComponent,
    onUpdate,
    onRemove,
    resizingDimensions
}: WindowContentProps) {
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
                resizingDimensions={resizingDimensions}
            />
        </div>
    );
}, (prevProps, nextProps) => {
    // Custom comparison for performance
    return (
        prevProps.item.i === nextProps.item.i &&
        prevProps.item.contentId === nextProps.item.contentId &&
        prevProps.item.type === nextProps.item.type &&
        prevProps.BlockComponent === nextProps.BlockComponent &&
        prevProps.onUpdate === nextProps.onUpdate &&
        prevProps.onRemove === nextProps.onRemove &&
        prevProps.resizingDimensions?.w === nextProps.resizingDimensions?.w &&
        prevProps.resizingDimensions?.h === nextProps.resizingDimensions?.h
    );
});
