/**
 * Admin 圖表共用主題設定(recharts)。
 * 顏色走 index.css 的 CSS 變數(SVG fill 支援 var()),跟隨主題。
 */

/** 分類色盤(--chart-1 ~ --chart-5,亮暗兩版都已在 index.css 定義) */
export const CHART_COLORS = [
    'var(--chart-1)',
    'var(--chart-2)',
    'var(--chart-3)',
    'var(--chart-4)',
    'var(--chart-5)',
];

/** recharts Tooltip 的 contentStyle:語意 token,跟隨主題 */
export const TOOLTIP_STYLE: React.CSSProperties = {
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 12,
    padding: '6px 10px',
};

/** 座標軸刻度文字樣式(XAxis/YAxis 的 tick prop) */
export const AXIS_TICK = { fontSize: 10, fill: 'var(--muted-foreground)' };
