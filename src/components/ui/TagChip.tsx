import React from 'react';
import { Badge } from './badge';
import { Tag } from '../../features/favorites/types';
import { X } from 'lucide-react';
import { cn } from './utils';

interface TagChipProps {
    tag: Tag;
    onDelete?: (e: React.MouseEvent) => void;
    onClick?: (e: React.MouseEvent) => void;
    className?: string;
    showDelete?: boolean;
}

export const TagChip: React.FC<TagChipProps> = ({ tag, onDelete, onClick, className, showDelete }) => {
    return (
        <Badge
            className={cn(
                "cursor-pointer hover:opacity-90 transition-opacity px-2 py-0.5 text-xs font-semibold text-white border-0",
                className
            )}
            style={{ backgroundColor: tag.color }}
            onClick={onClick}
        >
            {tag.name}
            {(showDelete || onDelete) && (
                <div
                    role="button"
                    className="ml-1 hover:bg-black/20 rounded-full p-0.5"
                    onClick={(e) => {
                        e.stopPropagation();
                        if (onDelete) onDelete(e);
                    }}
                >
                    <X className="h-3 w-3" />
                </div>
            )}
        </Badge>
    );
};
