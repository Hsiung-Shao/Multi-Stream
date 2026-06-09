// 動態島共用 design tokens(對齊 design DynamicIsland.jsx)
//
// FN:每個功能一個語意色 + glow,讓島上按鈕一眼可辨識。
// 島上按鈕(DynamicIsland)與各功能面板(IslandSearch / IslandLayoutPicker /
// MediaControlPanel / IslandFavoritesMenu)都從這裡取色,避免色票漂移。

import type { CSSProperties } from 'react';

export const FN = {
    search: { c: '#5b9bff', glow: 'rgba(91,155,255,0.45)' },
    add: { c: '#4ade80', glow: 'rgba(74,222,128,0.45)' },
    layout: { c: '#c084fc', glow: 'rgba(192,132,252,0.45)' },
    media: { c: '#22d3ee', glow: 'rgba(34,211,238,0.45)' },
    fav: { c: '#fbbf24', glow: 'rgba(251,191,36,0.45)' },
    save: { c: '#f472b6', glow: 'rgba(244,114,182,0.45)' },
    screen: { c: '#a5b4fc', glow: 'rgba(165,180,252,0.4)' },
    clear: { c: '#f87171', glow: 'rgba(248,113,113,0.45)' },
    home: { c: '#cbd5e1', glow: 'rgba(203,213,225,0.35)' },
    settings: { c: '#cbd5e1', glow: 'rgba(203,213,225,0.35)' },
} as const;

export type FnKey = keyof typeof FN;

/** 島上彈出面板的玻璃容器(LayoutPicker / MediaControlPanel / FavoritesMenu 共用) */
export const ISLAND_PANEL_STYLE: CSSProperties = {
    background: 'rgba(12,12,17,0.92)',
    backdropFilter: 'blur(22px)',
    WebkitBackdropFilter: 'blur(22px)',
    borderRadius: 20,
    border: '1px solid rgba(255,255,255,0.12)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 30px 60px -18px rgba(0,0,0,0.75)',
};

/** 面板 header 的 30×30 功能色 icon chip */
export function islandHeaderChipStyle(accent: string): CSSProperties {
    return {
        width: 30,
        height: 30,
        borderRadius: 9,
        background: `${accent}1f`,
        color: accent,
        boxShadow: `inset 0 0 0 1px ${accent}40`,
    };
}
