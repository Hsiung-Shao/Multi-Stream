import { forwardRef, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import { useUIStore } from '../../store/useUIStore';
import { PAGE_PATHS, type RoutePage } from '../../config/routes';

export interface RouteLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
    /** 目標頁面（對應 URL 見 src/config/routes.ts） */
    to: RoutePage;
}

const isPlainLeftClick = (e: MouseEvent<HTMLAnchorElement>) =>
    e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/**
 * 站內導覽連結：渲染真實 <a href="/about">，讓爬蟲能發現／跟隨內部連結（SEO 連結圖），
 * 同時攔截純左鍵點擊改走 client-side 路由（setPage → useRouter pushState），保留 SPA 體驗。
 *
 * - Ctrl/Cmd/Shift/Alt + 點擊、中鍵、或指定 target="_blank"：交給瀏覽器原生行為（開新分頁等）
 * - 外部 onClick 先執行；若它呼叫了 preventDefault，這裡就不再導頁
 * - forwardRef：shadcn <Button asChild> 透過 Radix Slot 轉發 ref，函式元件沒 forwardRef 會噴警告
 */
export const RouteLink = forwardRef<HTMLAnchorElement, RouteLinkProps>(function RouteLink(
    { to, onClick, target, ...rest },
    ref,
) {
    const setPage = useUIStore(s => s.setPage);

    return (
        <a
            ref={ref}
            href={PAGE_PATHS[to]}
            target={target}
            onClick={(e) => {
                onClick?.(e);
                if (e.defaultPrevented) return;
                if (target && target !== '_self') return;
                if (!isPlainLeftClick(e)) return;
                e.preventDefault();
                setPage(to);
            }}
            {...rest}
        />
    );
});
