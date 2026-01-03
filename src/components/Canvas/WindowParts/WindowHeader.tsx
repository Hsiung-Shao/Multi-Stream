import { GripHorizontal, X } from 'lucide-react';
import { Button } from '../../ui/button';

interface WindowHeaderProps {
    title: string;
    width: number;
    height: number;
    onRemove: () => void;
}

export function WindowHeader({ title, width, height, onRemove }: WindowHeaderProps) {
    return (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-1 p-1 pl-3 pr-1 bg-black/80 backdrop-blur-md rounded-full border border-white/10 shadow-lg transition-opacity opacity-0 group-hover:opacity-100">
            {/* Drag Handle - Must match draggableHandle in GridEngine */}
            <div className="grid-item-drag-handle cursor-move mr-2 flex items-center text-white/70 hover:text-white">
                <GripHorizontal size={14} />
                <span className="text-[10px] font-medium ml-2 max-w-[100px] truncate select-none">
                    {title}
                </span>
                <span className="text-xs font-bold text-yellow-300 ml-2 select-none">
                    {width} x {height}
                </span>
            </div>

            <div className="h-3 w-[1px] bg-white/20 mx-1" />

            <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-full hover:bg-white/20 text-white/70 hover:text-white"
                onMouseDown={(e: React.MouseEvent) => e.stopPropagation()} // Prevent drag start on button click
                onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    onRemove();
                }}
            >
                <X size={12} />
            </Button>
        </div>
    );
}
