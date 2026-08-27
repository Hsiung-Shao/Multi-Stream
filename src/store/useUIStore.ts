import { create } from 'zustand';
import { pathToPage } from '../config/routes';
import type { GuidePage } from '../config/guides';

interface ModalState {
    history: boolean;
    tutorial: boolean;
    favorites: boolean;
    feedback: boolean;
    ytRisk: boolean;
}

// 'instructions:<slug>' 為教學文章頁（見 src/config/guides.ts），slug 內嵌在 page 字串
export type PageType = 'home' | 'about' | 'creator' | 'compare' | 'settings' | 'canvas' | 'instructions' | 'privacy' | 'faq' | 'support' | 'admin' | 'not-found' | GuidePage;

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
    // 動態島樣式(桌面限定):original = 現行下緣浮現型態;edgeDock = 邊緣停靠型態
    islandStyle: 'original' | 'edgeDock';
    setIslandStyle: (style: 'original' | 'edgeDock') => void;
    islandEdgeSide: 'left' | 'right';
    setIslandEdgeSide: (side: 'left' | 'right') => void;
    islandEdgeSize: 'sm' | 'md' | 'lg';
    setIslandEdgeSize: (size: 'sm' | 'md' | 'lg') => void;
    islandEdgeY: number; // 凸起垂直位置,百分比 0-100
    setIslandEdgeY: (y: number) => void;
    // Hotkey & Hover State
    /** 游標所在視窗的「串流身分」：R / M / Delete / F 都用它去比對 streams */
    hoveredWindowId: string | null;
    /**
     * 游標所在視窗的「視窗身分」（canvasItems 的 i）。
     * 劇場模式必須用這個——一路串流可以同時有畫面視窗和聊天室視窗，兩者共用同一個
     * 串流 id，只靠串流身分會把兩個視窗一起放大。
     */
    hoveredCanvasItemId: string | null;
    setHoveredWindowId: (id: string | null, canvasItemId?: string | null) => void;
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
    // 初值直接由 URL 推導：避免首次 mount 時 page='home' 與 URL 不符而 pushState('/')，
    // 把 deep-link 的 query 砍掉、多塞一筆 history（routes.ts 對本檔只有 type import，無執行期循環）
    page: typeof window !== 'undefined' ? pathToPage(window.location.pathname) : 'home',
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

    // 動態島樣式與邊緣停靠設定
    islandStyle: 'original',
    setIslandStyle: (style) => {
        set({ islandStyle: style });
        persistUserSetting('islandStyle', style);
    },
    islandEdgeSide: 'left',
    setIslandEdgeSide: (side) => {
        set({ islandEdgeSide: side });
        persistUserSetting('islandEdgeSide', side);
    },
    islandEdgeSize: 'md',
    setIslandEdgeSize: (size) => {
        set({ islandEdgeSize: size });
        persistUserSetting('islandEdgeSize', size);
    },
    islandEdgeY: 50,
    setIslandEdgeY: (y) => {
        set({ islandEdgeY: y });
        persistUserSetting('islandEdgeY', y);
    },

    // Hotkey & Hover State
    hoveredWindowId: null,
    hoveredCanvasItemId: null,
    setHoveredWindowId: (id, canvasItemId = null) => set({ hoveredWindowId: id, hoveredCanvasItemId: canvasItemId }),
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
        if (settings.islandStyle) {
            useUIStore.setState({ islandStyle: settings.islandStyle });
        }
        if (settings.islandEdgeSide) {
            useUIStore.setState({ islandEdgeSide: settings.islandEdgeSide });
        }
        if (settings.islandEdgeSize) {
            useUIStore.setState({ islandEdgeSize: settings.islandEdgeSize });
        }
        if (settings.islandEdgeY !== undefined) {
            useUIStore.setState({ islandEdgeY: settings.islandEdgeY });
        }
    }
} catch (e) { }

