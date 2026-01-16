import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "../ui/dialog";
import { useUIStore } from "../../store/useUIStore";
import { useTranslation } from "react-i18next";
import { Keyboard, Search, Grid, Save, VolumeX, Monitor, RefreshCw, Trash2, Maximize, AppWindow } from "lucide-react";

export const HotkeyHelpDialog = () => {
    const { t } = useTranslation('common'); // We will add keys to common.ts later
    const isOpen = useUIStore((state) => state.isHotkeyHelpOpen);
    const setOpen = useUIStore((state) => state.setHotkeyHelpOpen);

    const globalHotkeys = [
        { keys: ["Ctrl", "/"], description: t('hotkeys.help', "Show this help"), icon: Keyboard },
        { keys: ["Ctrl", "K"], description: t('hotkeys.search', "Search / Add Stream"), icon: Search },
        { keys: ["Alt", "1-9"], description: t('hotkeys.layouts', "Switch Layouts"), icon: Grid },
        { keys: ["Ctrl", "S"], description: t('hotkeys.quick_save', "Quick Save Layout"), icon: Save },
        { keys: ["Ctrl", "M"], description: t('hotkeys.master_mute', "Master Mute Toggle"), icon: VolumeX },
        { keys: ["Shift", "F"], description: t('hotkeys.focus_mode', "Toggle Focus Mode"), icon: Monitor },
    ];

    const windowHotkeys = [
        { keys: ["R"], description: t('hotkeys.window_reload', "Reload Stream"), icon: RefreshCw },
        { keys: ["M"], description: t('hotkeys.window_mute', "Mute Window"), icon: VolumeX },
        { keys: ["Del"], description: t('hotkeys.window_remove', "Remove Window"), icon: Trash2 },
        { keys: ["F"], description: t('hotkeys.window_fullscreen', "Maximize Window"), icon: Maximize },
        { keys: ["T"], description: t('hotkeys.window_theater', "Theater Mode"), icon: AppWindow },
    ];

    return (
        <Dialog open={isOpen} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-[600px] bg-slate-900/95 border-white/10 text-white backdrop-blur-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <Keyboard className="w-6 h-6 text-purple-400" />
                        {t('hotkeys.title', "Keyboard Shortcuts")}
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                        {t('hotkeys.subtitle', "Manage your studio efficiently with these shortcuts.")}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-6 py-4">
                    {/* Global Hotkeys */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-medium text-purple-400 uppercase tracking-wider">
                            {t('hotkeys.section_global', "Global Controls")}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {globalHotkeys.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                                    <div className="flex items-center gap-2 text-sm text-slate-200">
                                        <item.icon size={14} className="text-slate-400" />
                                        <span>{item.description}</span>
                                    </div>
                                    <div className="flex gap-1">
                                        {item.keys.map((k, i) => (
                                            <kbd key={i} className="px-2 py-0.5 text-[10px] font-bold bg-black/40 rounded border border-white/10 text-slate-300 min-w-[20px] text-center">
                                                {k}
                                            </kbd>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Window Hotkeys */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-medium text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                            {t('hotkeys.section_window', "Window Actions")}
                            <span className="text-[10px] normal-case font-normal text-slate-500 bg-black/40 px-2 py-0.5 rounded-full">
                                {t('hotkeys.hover_tip', "Hover over a window to use")}
                            </span>
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {windowHotkeys.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                                    <div className="flex items-center gap-2 text-sm text-slate-200">
                                        <item.icon size={14} className="text-slate-400" />
                                        <span>{item.description}</span>
                                    </div>
                                    <div className="flex gap-1">
                                        {item.keys.map((k, i) => (
                                            <kbd key={i} className="px-2 py-0.5 text-[10px] font-bold bg-black/40 rounded border border-white/10 text-slate-300 min-w-[20px] text-center">
                                                {k}
                                            </kbd>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
