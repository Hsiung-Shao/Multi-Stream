/**
 * /songs 三欄控制台外框：左欄導覽（≥1280）｜中欄畫面｜右欄正在播放，底部播放列。
 *
 * - 版面由 CSS 斷點決定（lg=1024、xl=1280），預渲染與 hydration 首輪在任何寬度都排得開；
 *   JS 的 narrow／compact 只決定「渲染哪些內容」（左欄改 Sheet、手機分頁），不切換整棵樹。
 * - 手機（<1024）：flex 直排，右欄只剩播放器並以 order 排到最上面（shrink-0），中欄 flex-1 捲動，底部列固定在最下。
 *   不用 sticky，免得 z-index 互相覆蓋播放器。
 * - .songs-console 在 index.css 覆寫 shadcn 色彩變數（#06070B 底、#0F121C 面板、#7CF2C8 薄荷強調）。
 */
import type { ReactNode } from 'react';

export function ConsoleShell({ nav, main, aside, bar }: {
    /** 左欄（compact 時不渲染，改放 Sheet） */
    nav: ReactNode;
    main: ReactNode;
    aside: ReactNode;
    bar: ReactNode;
}) {
    return (
        <div className="songs-console flex h-dvh flex-col overflow-hidden bg-background text-foreground lg:gap-2 lg:px-2 lg:pt-2">
            <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-2 xl:grid-cols-[260px_minmax(0,1fr)_400px]">
                {nav}
                {main}
                {aside}
            </div>
            {bar}
        </div>
    );
}
