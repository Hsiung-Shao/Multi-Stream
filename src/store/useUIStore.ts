import { create } from 'zustand';

interface ModalState {
    history: boolean;
    tutorial: boolean;
    favorites: boolean;
    feedback: boolean;
    about: boolean;
    privacy: boolean;
    history: boolean;
    tutorial: boolean;
    favorites: boolean;
    feedback: boolean;
    ytRisk: boolean;
    // Pages are handled separately, but we could treat them as modals if we wanted. 
    // For now, let's keep page state separate as per App.tsx logic.
}

export type PageType = 'home' | 'about' | 'privacy';

interface UIState {
    theme: 'light' | 'dark';
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
    setMasterVolume: (volume: number | ((prev: number) => number)) => void;
    setMasterMuted: (muted: boolean | ((prev: boolean) => boolean)) => void;
    setPage: (page: PageType) => void;
    setSearchFocused: (focused: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
    theme: 'dark',
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
        about: false, // Legacy/Unused if using page
        privacy: false, // Legacy/Unused if using page
        ytRisk: false,
    },
    masterVolume: 100,
    masterMuted: false,

    setTheme: (theme) => set({ theme }),
    toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),

    setPanelCollapsed: (collapsed) => set({ isPanelCollapsed: collapsed }),
    togglePanelCollapsed: () => set((state) => ({ isPanelCollapsed: !state.isPanelCollapsed })),

    openModal: (name) => set((state) => ({ modals: { ...state.modals, [name]: true } })),
    closeModal: (name) => set((state) => ({ modals: { ...state.modals, [name]: false } })),
    toggleModal: (name) => set((state) => ({ modals: { ...state.modals, [name]: !state.modals[name] } })),

    setMasterVolume: (volume) => set((state) => ({
        masterVolume: typeof volume === 'function' ? volume(state.masterVolume) : volume
    })),
    setMasterMuted: (muted) => set((state) => ({
        masterMuted: typeof muted === 'function' ? muted(state.masterMuted) : muted
    })),
    setPage: (page) => set({ page }),
    setSearchFocused: (focused) => set({ isSearchFocused: focused }),
}));
