import React from 'react';
import { Tag } from '../../features/favorites/types';
import { TagChip } from './TagChip';
import { cn } from './utils';

interface TagListProps {
    tags: Tag[];
    className?: string;
    onTagClick?: (tag: Tag) => void;
}

export const TagList: React.FC<TagListProps> = ({ tags, className, onTagClick }) => {
    if (!tags || tags.length === 0) return null;

    return (
        <div className={cn("flex flex-wrap gap-1.5 items-center", className)}>
            {tags.map(tag => (
                <TagChip
                    key={tag.id}
                    tag={tag}
                    onClick={onTagClick ? () => onTagClick(tag) : undefined}
                />
            ))}
        </div>
    );
};
