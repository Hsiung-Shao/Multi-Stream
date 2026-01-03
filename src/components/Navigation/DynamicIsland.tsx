import { useRef, useState } from 'react';
import Draggable from 'react-draggable';
import { Home, Plus, Layout, Settings, Star, Tv } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useUIStore } from '../../store/useUIStore';
import { AddWindowDialog } from '../Dialogs/AddWindowDialog';
import { SettingsDialog } from '../Dialogs/SettingsDialog';
import { MediaSettingsDialog } from '../Dialogs/MediaSettingsDialog';

export const DynamicIsland = () => {
    const nodeRef = useRef(null);
    const setPage = useUIStore(s => s.setPage);
    const openModal = useUIStore(s => s.openModal);

    const [addDialogOpen, setAddDialogOpen] = useState(false);
    const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
    const [mediaDialogOpen, setMediaDialogOpen] = useState(false);

    return (
        <>
            <Draggable
                nodeRef={nodeRef}
                bounds="parent"
                defaultPosition={{ x: 0, y: 0 }} // Center or specific position
            >
                <div
                    ref={nodeRef}
                    className="fixed z-50 bottom-8 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md rounded-full px-4 py-2 flex items-center gap-2 border border-white/10 shadow-2xl transition-all hover:scale-105 active:scale-95 cursor-move pointer-events-auto"
                    style={{ position: 'fixed' }} // Ensure it works with draggable 'fixed' logic if needed, but Draggable handles absolute by default usually. Let's start simple.
                >
                    <div className="flex items-center gap-1 on-drag-cancel cursor-auto" onMouseDown={(e) => e.stopPropagation()}>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full hover:bg-white/10 text-white"
                            onClick={() => setPage('home')}
                            title="返回首頁"
                        >
                            <Home size={20} />
                        </Button>

                        <div className="w-[1px] h-6 bg-white/20 mx-1" />

                        <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full hover:bg-white/10 text-white"
                            onClick={() => setAddDialogOpen(true)}
                            title="新增視窗"
                        >
                            <Plus size={20} />
                        </Button>

                        <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full hover:bg-white/10 text-white"
                            onClick={() => { /* TODO: Open Layout Dialog */ }}
                            title="佈局設定"
                        >
                            <Layout size={20} />
                        </Button>

                        <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full hover:bg-white/10 text-white"
                            onClick={() => setMediaDialogOpen(true)}
                            title="媒體控制"
                        >
                            <Tv size={20} />
                        </Button>

                        <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full hover:bg-white/10 text-white"
                            onClick={() => openModal('favorites')}
                            title="收藏清單"
                        >
                            <Star size={20} />
                        </Button>

                        <div className="w-[1px] h-6 bg-white/20 mx-1" />

                        <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full hover:bg-white/10 text-white"
                            onClick={() => setSettingsDialogOpen(true)}
                            title="全域設定"
                        >
                            <Settings size={20} />
                        </Button>
                    </div>
                </div>
            </Draggable>

            <AddWindowDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} />
            <SettingsDialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen} />
            <MediaSettingsDialog open={mediaDialogOpen} onOpenChange={setMediaDialogOpen} />
        </>
    );
};
