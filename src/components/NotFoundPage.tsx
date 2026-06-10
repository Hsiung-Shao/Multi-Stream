// 404 — 依 multistream-hub-design-system 的 Pages.jsx NotFoundPage 重建。
// 漸層 404 數字 + blur orb 背景 + 回首頁 / 前往 Canvas 復原按鈕。

import { useUIStore } from '../store/useUIStore';
import { Home } from 'lucide-react';
import { BlurOrb } from './ui/ds-primitives';

export function NotFoundPage() {
    const setPage = useUIStore(s => s.setPage);

    return (
        <div className="relative min-h-screen flex items-center justify-center overflow-hidden p-6 pt-16 bg-background text-foreground">
            <BlurOrb top="20%" left="50%" w={800} h={400} opacity={0.2} />

            <div className="relative z-[1] text-center max-w-[520px]">
                <div
                    className="font-extrabold leading-none mb-2"
                    style={{
                        fontSize: 144,
                        letterSpacing: '-0.04em',
                        background: 'linear-gradient(135deg, var(--primary), #c084fc)',
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                    }}
                >
                    404
                </div>
                <h1 className="text-[28px] font-bold mb-3">這裡什麼都沒有</h1>
                <p className="text-base text-muted-foreground mb-8 leading-relaxed">
                    你要找的頁面好像走丟了。也許是輸入錯了網址,也許是頁面已經被搬家。
                </p>
                <div className="flex gap-3 justify-center flex-wrap">
                    <button
                        onClick={() => setPage('home')}
                        className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                        <Home size={14} /> 回到首頁
                    </button>
                    <button
                        onClick={() => setPage('canvas')}
                        className="inline-flex items-center h-9 px-4 rounded-lg text-sm font-medium text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors"
                    >
                        前往 Canvas
                    </button>
                </div>
            </div>
        </div>
    );
}
