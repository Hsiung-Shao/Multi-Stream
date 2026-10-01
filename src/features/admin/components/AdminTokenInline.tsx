// 後台 API Token 設定列（與公告分頁共用 localStorage 的 ms_admin_api_token）

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { getAdminToken, setAdminToken } from '../hooks/useAdminAnnouncements';

export function useAdminTokenPresent(): [boolean, () => void] {
    const [has, setHas] = useState(() => getAdminToken().length > 0);
    return [has, () => setHas(getAdminToken().length > 0)];
}

export function AdminTokenInline({ onSaved }: { onSaved: () => void }) {
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
                    onSaved();
                }}
            >
                儲存
            </Button>
        </div>
    );
}
