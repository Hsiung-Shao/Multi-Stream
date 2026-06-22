// Design-system primitives — 對齊 multistream-hub-design-system 的 primitives.jsx。
// 提供 long-form 頁面(About / Privacy / FAQ)共用的小元件,沿用 next 的 oklch token。

import type { ReactNode, CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';

/** uppercase 小標(section eyebrow),預設主色紫。 */
export function Eyebrow({ children, color }: { children: ReactNode; color?: string }) {
    return (
        <span
            className="text-xs font-semibold uppercase tracking-[0.08em]"
            style={{ color: color ?? 'var(--primary)' }}
        >
            {children}
        </span>
    );
}

/** long-form 頁 section header(eyebrow + title + 可選 sub),對齊 design 的 AbHeader。
 *  樣式為 index.css 的 .ds-head*;eyebrow 色用 color 參數(預設主色紫)。 */
export function SectionHead({ eyebrow, title, sub, color }: {
    eyebrow: string;
    title: string;
    sub?: string;
    color?: string;
}) {
    return (
        <div className="ds-head">
            <Eyebrow color={color}>{eyebrow}</Eyebrow>
            <h2 className="ds-head-title">{title}</h2>
            {sub && <p className="ds-head-sub">{sub}</p>}
        </div>
    );
}

/** 彩色 icon chip(對齊 design 的 AbChip / IconChip):hue 半透明底 + 同色 icon + 同色淡邊。 */
export function IconChip({
    icon: Icon,
    hue = '#c084fc',
    size = 44,
    iconSize,
    style,
}: {
    icon: LucideIcon;
    hue?: string;
    size?: number;
    iconSize?: number;
    style?: CSSProperties;
}) {
    const radius = size >= 56 ? 16 : size >= 44 ? 12 : 10;
    return (
        <div
            className="inline-flex items-center justify-center shrink-0"
            style={{
                width: size,
                height: size,
                borderRadius: radius,
                background: `${hue}1f`,
                color: hue,
                border: `1px solid ${hue}33`,
                ...style,
            }}
        >
            <Icon size={iconSize ?? Math.round(size * 0.42)} />
        </div>
    );
}

/** 背景模糊光暈(depth element)。絕對定位,父層需 relative + overflow-hidden。 */
export function BlurOrb({
    top,
    left,
    right,
    bottom,
    w = 600,
    h = 400,
    color = 'var(--primary)',
    opacity = 0.3,
}: {
    top?: number | string;
    left?: number | string;
    right?: number | string;
    bottom?: number | string;
    w?: number;
    h?: number;
    color?: string;
    opacity?: number;
}) {
    const style: CSSProperties = {
        position: 'absolute',
        top,
        left,
        right,
        bottom,
        width: w,
        height: h,
        background: color,
        opacity,
        filter: 'blur(100px)',
        borderRadius: '50%',
        pointerEvents: 'none',
        transform: left === '50%' ? 'translateX(-50%)' : undefined,
    };
    return <div style={style} aria-hidden />;
}
