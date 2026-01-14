import React from 'react';
import { LayoutSlot } from '../../types/canvas';
import { cn } from '../../components/ui/utils';

interface LayoutPreviewProps {
    slots: LayoutSlot[];
    className?: string;
}

export const LayoutPreview: React.FC<LayoutPreviewProps> = ({ slots, className }) => {
    const maxH = Math.max(...slots.map(s => s.y + s.h), 24);

    return (
        <div
            className={cn("relative w-full bg-muted/20 border rounded-md overflow-hidden", className)}
            style={{
                aspectRatio: `24 / ${maxH}`,
            }}
        >
            {slots.map((slot, i) => (
                <div
                    key={i}
                    className={cn(
                        "absolute border border-primary/20 bg-primary/10",
                        slot.type === 'chat' ? "bg-secondary/20 border-secondary/30" : ""
                    )}
                    style={{
                        left: `${(slot.x / 24) * 100}%`,
                        top: `${(slot.y / maxH) * 100}%`,
                        width: `${(slot.w / 24) * 100}%`,
                        height: `${(slot.h / maxH) * 100}%`,
                    }}
                />
            ))}
        </div>
    );
};
