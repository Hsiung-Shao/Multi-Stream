import { create } from 'zustand';

interface ModalState {
    history: boolean;
    tutorial: boolean;
    favorites: boolean;
    feedback: boolean;
    about: boolean; // Legacy/Unused if using page
    privacy: boolean; // Legacy/Unused if using page
    ytRisk: boolean;
}

export type PageType = 'home' | 'about' | 'privacy';

interface UIState {
    theme: 'light' | 'dark';
    page: PageType;
    isPanelCollapsed: boolean;
    isSearchFocused: boolean;
    modals: ModalState;
    masterVolume: number;
    masterMuted: boolean;
    // Actions
    setTheme: (theme: 'light' | 'dark') => void;
    toggleTheme: () => void;
    setPanelCollapsed: (collapsed: boolean) => void;
    togglePanelCollapsed: () => void;
    openModal: (name: keyof ModalState) => void;
    closeModal: (name: keyof ModalState) => void;
    toggleModal: (name: keyof ModalState) => void;
    setMasterVolume: (volume: number | ((prev: number) => number)) => void;
    setMasterMuted: (muted: boolean | ((prev: boolean) => boolean)) => void;
    setPage: (page: PageType) => void;
    setSearchFocused: (focused: boolean) => void;
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
        about: false,
        privacy: false,
        ytRisk: false,
    },
    masterVolume: 100,
    masterMuted: false,

    setTheme: (theme) => {
        set({ theme });
        try {
            const saved = localStorage.getItem('userSettings');
            const settings = saved ? JSON.parse(saved) : {};
            settings.theme = theme;
            localStorage.setItem('userSettings', JSON.stringify(settings));
        } catch (e) { }
    },
    toggleTheme: () => set((state) => {
        const newTheme = state.theme === 'light' ? 'dark' : 'light';
        try {
            const saved = localStorage.getItem('userSettings');
            const settings = saved ? JSON.parse(saved) : {};
            settings.theme = newTheme;
            localStorage.setItem('userSettings', JSON.stringify(settings));
        } catch (e) { }
        return { theme: newTheme };
    }),

    setPanelCollapsed: (collapsed) => set({ isPanelCollapsed: collapsed }),
    togglePanelCollapsed: () => set((state) => ({ isPanelCollapsed: !state.isPanelCollapsed })),

    openModal: (name) => set((state) => ({ modals: { ...state.modals, [name]: true } })),
    closeModal: (name) => set((state) => ({ modals: { ...state.modals, [name]: false } })),
    toggleModal: (name) => set((state) => ({ modals: { ...state.modals, [name]: !state.modals[name] } })),

    setMasterVolume: (volume) => set((state) => {
        const newVolume = typeof volume === 'function' ? volume(state.masterVolume) : volume;

        // Persist to localStorage
        try {
            const saved = localStorage.getItem('userSettings');
            const settings = saved ? JSON.parse(saved) : {};
            settings.masterVolume = newVolume;
            localStorage.setItem('userSettings', JSON.stringify(settings));
        } catch (e) { }

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
    }
} catch (e) { }

