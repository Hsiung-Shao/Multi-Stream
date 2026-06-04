import type { ReactNode } from 'react';
import { cn } from '../../components/ui/utils';

interface AcctSectionProps {
    /** 卡片標題（17px / 600） */
    title: ReactNode;
    /** 標題下方說明（muted、12px） */
    description?: ReactNode;
    /** 標題左側 icon（已連結色彩的 lucide 元件） */
    icon?: ReactNode;
    /** 標題右側 slot（例如狀態 badge） */
    headerExtra?: ReactNode;
    /** 'destructive'：危險區域紅框紅字 */
    tone?: 'default' | 'destructive';
    className?: string;
    children?: ReactNode;
}

/**
 * 帳號設定頁各區塊共用外殼。
 *
 * 對齊設計稿 AcctSection：rounded 14、border-border、bg-card、
 * title 17/600 + description muted。所有色彩走 design token，雙主題通用。
 */
export function AcctSection({
    title,
    description,
    icon,
    headerExtra,
    tone = 'default',
    className,
    children,
}: AcctSectionProps) {
    const destructive = tone === 'destructive';
    return (
        <section
            className={cn(
                'rounded-xl border p-5',
                destructive
                    ? 'border-destructive/30 bg-destructive/5'
                    : 'border-border bg-card',
                className,
            )}
        >
            <header className="mb-4 flex items-start gap-3">
                {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
                <div className="min-w-0 flex-1">
                    <h2
                        className={cn(
                            'text-[17px] font-semibold leading-tight',
                            destructive && 'text-destructive',
                        )}
                    >
                        {title}
                    </h2>
                    {description && (
                        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                            {description}
                        </p>
                    )}
                </div>
                {headerExtra && <div className="shrink-0">{headerExtra}</div>}
            </header>
            {children}
        </section>
    );
}
