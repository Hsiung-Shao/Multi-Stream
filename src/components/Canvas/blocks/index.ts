import { MonitorPlay, MessageSquare } from 'lucide-react';
import { blockRegistry } from '../BlockRegistry';
import { StreamBlock } from './StreamBlock';
import { ChatBlock } from './ChatBlock';

// Register standard blocks
export function registerStandardBlocks() {
    blockRegistry.register({
        type: 'stream',
        label: 'Stream',
        icon: MonitorPlay, // Note: Passing generic Icon component might need wrapping if type strict
        component: StreamBlock,
        customHeader: true, // StreamBlock handles its own header (via StreamBox)
        resizable: true
    } as any); // Cast to any/BlockDefinition to avoid icon type strictness for now

    blockRegistry.register({
        type: 'chat',
        label: 'Chat',
        icon: MessageSquare,
        component: ChatBlock,
        customHeader: false,
        resizable: true
    } as any);
}
