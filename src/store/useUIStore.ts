import { create } from 'zustand';

interface ModalState {
    history: boolean;
    tutorial: boolean;
    favorites: boolean;
    feedback: boolean;
    ytRisk: boolean;
}

export type PageType = 'home' | 'about' | 'settings' | 'canvas' | 'instructions' | 'privacy' | 'faq' | 'admin' | 'not-found';

interface UIState {
    theme: 'light' | 'dark' | 'system';
    page: PageType;
    isPanelCollapsed: boolean;
    isSearchFocused: boolean;
    modals: ModalState;
    favoritesTab: string; // 'favorites' | 'layouts' | 'twitch_import' etc.
    masterVolume: number;
    masterMuted: boolean;
    showPerformanceOverlay: boolean;
    // Actions
    setTheme: (theme: 'light' | 'dark' | 'system') => void;
    toggleTheme: () => void;
    setPanelCollapsed: (collapsed: boolean) => void;
    togglePanelCollapsed: () => void;
    openModal: (name: keyof ModalState, tab?: string) => void;
    closeModal: (name: keyof ModalState) => void;
    toggleModal: (name: keyof ModalState) => void;
    setFavoritesTab: (tab: string) => void;
    setMasterVolume: (volume: number | ((prev: number) => number)) => void;
    setMasterMuted: (muted: boolean | ((prev: boolean) => boolean)) => void;
    setPage: (page: PageType) => void;
    setSearchFocused: (focused: boolean) => void;
    togglePerformanceOverlay: () => void;
    // Playback / detection settings
    autoMuteNewStream: boolean;
    setAutoMuteNewStream: (v: boolean) => void;
    youtubeRiskWarning: boolean;
    setYoutubeRiskWarning: (v: boolean) => void;
    bgLiveDetect: boolean;
    setBgLiveDetect: (v: boolean) => void;
    // Window functionality
    closeWindowMode: 'remove' | 'empty';
    setCloseWindowMode: (mode: 'remove' | 'empty') => void;
    // Hotkey & Hover State
    hoveredWindowId: string | null;
    setHoveredWindowId: (id: string | null) => void;
    theaterWindowId: string | null;
    setTheaterWindowId: (id: string | null) => void;
    isHotkeyHelpOpen: boolean;
    toggleHotkeyHelp: () => void;
    setHotkeyHelpOpen: (open: boolean) => void;
}

// 把單一設定寫進 localStorage 的 userSettings(所有 persist 類 setter 共用)
function persistUserSetting(key: string, value: unknown) {
    try {
        const saved = localStorage.getItem('userSettings');
        const settings = saved ? JSON.parse(saved) : {};
        settings[key] = value;
        localStorage.setItem('userSettings', JSON.stringify(settings));
    } catch (e) { }
}

export const useUIStore = create<UIState>((set) => ({
    theme: 'dark',
    page: 'home',
    isPanelCollapsed: false,
    isSearchFocused: false,
    modals: {
        history: false,
        tutorial: false,
        favorites: false,
        feedback: false,
        ytRisk: false,
    },
    favoritesTab: 'favorites',
    masterVolume: 100,
    masterMuted: false,
    showPerformanceOverlay: false,

    setTheme: (theme) => {
        set({ theme });
        persistUserSetting('theme', theme);
    },
    toggleTheme: () => set((state) => {
        const newTheme = state.theme === 'light' ? 'dark' : 'light';
        persistUserSetting('theme', newTheme);
        return { theme: newTheme };
    }),

    setPanelCollapsed: (collapsed) => set({ isPanelCollapsed: collapsed }),
    togglePanelCollapsed: () => set((state) => ({ isPanelCollapsed: !state.isPanelCollapsed })),

    openModal: (name, tab) => set((state) => ({
        modals: { ...state.modals, [name]: true },
        favoritesTab: (name === 'favorites' && tab) ? tab : state.favoritesTab
    })),
    closeModal: (name) => set((state) => ({ modals: { ...state.modals, [name]: false } })),
    toggleModal: (name) => set((state) => ({ modals: { ...state.modals, [name]: !state.modals[name] } })),
    setFavoritesTab: (tab) => set({ favoritesTab: tab }),

    setMasterVolume: (volume) => set((state) => {
        const newVolume = typeof volume === 'function' ? volume(state.masterVolume) : volume;
        persistUserSetting('masterVolume', newVolume);
        return { masterVolume: newVolume };
    }),
    setMasterMuted: (muted) => set((state) => {
        const newMuted = typeof muted === 'function' ? muted(state.masterMuted) : muted;

        // Persist/Logic for mute (saving previous volume logic handled in App currently, but we can do basic persistence here if needed)
        // Note: App.tsx's handleMasterMuteChange was complex (restoring previous volume). 
        // We will keep simple state update here and let App.tsx or a service handle the complex logic if we don't fully move it yet.
        // However, the plan said "Refactor Volume Management to useUIStore".
        // Let's at least persist the muted state if we want, but userSettings in App.tsx didn't seem to persist 'masterMuted' explicitly, 
        // only 'masterVolume' and 'previousMasterVolume'.
        // So for now, we just update state. 

        return { masterMuted: newMuted };
    }),
    setPage: (page) => set({ page }),
    setSearchFocused: (focused) => set({ isSearchFocused: focused }),
    togglePerformanceOverlay: () => set((state) => ({ showPerformanceOverlay: !state.showPerformanceOverlay })),

    // Playback / detection settings(persist 到 userSettings)
    autoMuteNewStream: true,
    setAutoMuteNewStream: (v) => {
        set({ autoMuteNewStream: v });
        persistUserSetting('autoMuteNewStream', v);
    },
    youtubeRiskWarning: true,
    setYoutubeRiskWarning: (v) => {
        set({ youtubeRiskWarning: v });
        persistUserSetting('youtubeRiskWarning', v);
    },
    bgLiveDetect: false,
    setBgLiveDetect: (v) => {
        set({ bgLiveDetect: v });
        persistUserSetting('bgLiveDetect', v);
    },

    // Window functionality
    closeWindowMode: 'remove',
    setCloseWindowMode: (mode) => {
        set({ closeWindowMode: mode });
        persistUserSetting('closeWindowMode', mode);
    },

    // Hotkey & Hover State
    hoveredWindowId: null,
    setHoveredWindowId: (id) => set({ hoveredWindowId: id }),
    theaterWindowId: null,
    setTheaterWindowId: (id) => set({ theaterWindowId: id }),
    isHotkeyHelpOpen: false,
    toggleHotkeyHelp: () => set((state) => ({ isHotkeyHelpOpen: !state.isHotkeyHelpOpen })),
    setHotkeyHelpOpen: (open) => set({ isHotkeyHelpOpen: open }),
}));

// Initialize state from localStorage
try {
    const saved = localStorage.getItem('userSettings');
    if (saved) {
        const settings = JSON.parse(saved);
        if (settings.masterVolume !== undefined) {
            useUIStore.setState({ masterVolume: settings.masterVolume });
        }
        if (settings.theme) {
            useUIStore.setState({ theme: settings.theme });
        }
        if (settings.closeWindowMode) {
            useUIStore.setState({ closeWindowMode: settings.closeWindowMode });
        }
        if (settings.autoMuteNewStream !== undefined) {
            useUIStore.setState({ autoMuteNewStream: settings.autoMuteNewStream });
        }
        if (settings.youtubeRiskWarning !== undefined) {
            useUIStore.setState({ youtubeRiskWarning: settings.youtubeRiskWarning });
        }
        if (settings.bgLiveDetect !== undefined) {
            useUIStore.setState({ bgLiveDetect: settings.bgLiveDetect });
        }
    }
} catch (e) { }

