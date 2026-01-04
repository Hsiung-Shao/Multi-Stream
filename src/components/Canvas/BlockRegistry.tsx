import React from 'react';
import { CanvasItem } from '../../types/canvas';

// Base props every block receives
export interface BlockComponentProps {
    item: CanvasItem;
    // Helper to update self
    onUpdate: (updates: Partial<CanvasItem>) => void;
    // Helper to remove self
    onRemove: () => void;
    // Is the block currently being dragged or resized?
    isInteracting?: boolean;
    // Current resize dimensions (live)
    resizingDimensions?: { w: number; h: number };
}

export interface BlockDefinition {
    type: string;
    label: string;
    icon?: React.ReactNode;
    component: React.ComponentType<BlockComponentProps>;
    // Default size for this block type
    defaultSize?: { w: number; h: number };
    // Can this block be resized?
    resizable?: boolean;
    // Min/Max constraints
    minSize?: [number, number];
    maxSize?: [number, number];
    // Does the block render its own drag handle?
    customHeader?: boolean;
}

class BlockRegistry {
    private blocks: Map<string, BlockDefinition> = new Map();

    register(definition: BlockDefinition) {
        this.blocks.set(definition.type, definition);
    }

    get(type: string): BlockDefinition | undefined {
        return this.blocks.get(type);
    }

    getAll(): BlockDefinition[] {
        return Array.from(this.blocks.values());
    }
}

export const blockRegistry = new BlockRegistry();
