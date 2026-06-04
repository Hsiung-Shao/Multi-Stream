import { useUIStore } from '../store/useUIStore';
import { Button } from './ui/button';
import { Home, MonitorPlay } from 'lucide-react';

export function NotFoundPage() {
    const setPage = useUIStore(s => s.setPage);

    return (
        <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background text-foreground p-6">
            {/* Background blur orb (design BlurOrb) */}
            <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-[20%] -translate-x-1/2 h-[400px] w-[800px] max-w-full rounded-full bg-primary/20 blur-[100px]"
            />

            <div className="relative z-10 text-center max-w-lg mx-auto">
                {/* Gradient 404 numeral */}
                <div className="bg-gradient-to-br from-primary to-purple-400 bg-clip-text text-transparent text-[9rem] md:text-[12rem] font-extrabold leading-none tracking-tighter mb-2">
                    404
                </div>

                <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
                    這裡什麼都沒有
                </h1>
                <p className="text-base text-muted-foreground leading-relaxed mb-8">
                    你要找的頁面好像走丟了。也許是輸入錯了網址，也許是頁面已經被搬家。
                </p>

                <div className="flex flex-wrap items-center justify-center gap-3">
                    <Button onClick={() => setPage('home')}>
                        <Home className="size-4 mr-2" />
                        回到首頁
                    </Button>
                    <Button variant="ghost" onClick={() => setPage('canvas')}>
                        <MonitorPlay className="size-4 mr-2" />
                        前往 Canvas
                    </Button>
                </div>
            </div>

            {/* Footer decor */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-sm text-muted-foreground">
                MultiStream Hub
            </div>
        </div>
    );
}
