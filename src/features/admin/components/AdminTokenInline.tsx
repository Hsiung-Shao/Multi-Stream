// 後台 API Token 設定列（與公告分頁共用 localStorage 的 ms_admin_api_token）
// 後台分頁都 forceMount：存 token 會發出事件，各分頁的「有沒有 token」跟著更新，
// 重新讀取由 AdminDashboard 的 useRefetchOnAdminTokenChange 統一處理。

import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { ADMIN_TOKEN_EVENT, getAdminToken, setAdminToken } from '../hooks/useAdminAnnouncements';

/** 目前有沒有存 token；任何分頁設定或清除時都會更新 */
export function useAdminTokenPresent(): boolean {
    const [has, setHas] = useState(() => getAdminToken().length > 0);
    useEffect(() => {
        const sync = () => setHas(getAdminToken().length > 0);
        window.addEventListener(ADMIN_TOKEN_EVENT, sync);
        window.addEventListener('storage', sync); // 其他瀏覽器分頁
        return () => {
            window.removeEventListener(ADMIN_TOKEN_EVENT, sync);
            window.removeEventListener('storage', sync);
        };
    }, []);
    return has;
}

export function AdminTokenInline() {
    const [value, setValue] = useState('');
    return (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <KeyRound className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-[13px] text-muted-foreground">需要 Admin API Token（與公告分頁相同）：</span>
            <Input type="password" value={value} onChange={(e) => setValue(e.target.value)} className="h-8 w-64" aria-label="Admin API Token" />
            <Button
                size="sm"
                disabled={!value.trim()}
                onClick={() => {
                    setAdminToken(value.trim());
                    setValue('');
                }}
            >
                儲存
            </Button>
        </div>
    );
}
