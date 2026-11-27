/** 設定頁的「帳號」卡片：未登入顯示三種登入方式；已登入顯示名稱、登出、刪除帳號 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import { useAuthStore, signIn, signOut, deleteAccount, type AuthProvider } from './authStore';
import { useSyncStatus, resolveAccountSwitch } from '../favorites/cloudSync/syncEngine';
import { LinkedProviders, MySubmissions } from './AccountExtras';

/** 收藏同步狀態；本機收藏屬於另一個帳號時讓使用者選併入或改用雲端 */
function SyncStatus() {
    const { t } = useTranslation('common');
    const state = useSyncStatus(s => s.state);
    if (state === 'needs_choice') {
        return (
            <div role="alert" className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="text-sm text-foreground">{t('auth.sync_other_account')}</p>
                <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={() => { void resolveAccountSwitch('merge'); }}>{t('auth.sync_merge_here')}</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => { void resolveAccountSwitch('cloud'); }}>{t('auth.sync_use_cloud')}</Button>
                </div>
            </div>
        );
    }
    if (state === 'idle') return null;
    return <p className={state === 'error' ? 'text-sm text-red-500' : 'text-xs text-muted-foreground'}>{t(`auth.sync_${state}`)}</p>;
}

const PROVIDERS: { id: AuthProvider; label: string; color: string }[] = [
    { id: 'twitch', label: 'Twitch', color: '#9146FF' },
    { id: 'google', label: 'Google', color: '#4285F4' },
    { id: 'discord', label: 'Discord', color: '#5865F2' },
];

export function LoginButtons() {
    const { t } = useTranslation('common');
    const [busy, setBusy] = useState<AuthProvider | null>(null);
    const [failed, setFailed] = useState(false);
    return (
        <div className="flex flex-wrap gap-2">
            {failed && <p role="alert" className="w-full text-sm text-red-500">{t('auth.sign_in_failed')}</p>}
            {PROVIDERS.map(p => (
                <Button
                    key={p.id}
                    type="button"
                    disabled={busy !== null}
                    onClick={() => { setBusy(p.id); signIn(p.id).catch(() => { setBusy(null); setFailed(true); }); }}
                    className="text-white"
                    style={{ background: p.color }}
                >
                    {t('auth.sign_in_with', { provider: p.label })}
                </Button>
            ))}
        </div>
    );
}

export function AccountSection() {
    const { t } = useTranslation('common');
    const { status, user, kicked } = useAuthStore();
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [deleteFailed, setDeleteFailed] = useState(false);

    if (status !== 'authed' || !user) {
        return (
            <div className="space-y-3">
                {kicked && <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">{t('auth.kicked')}</p>}
                <p className="text-sm text-muted-foreground">{t('auth.sign_in_desc')}</p>
                <LoginButtons />
            </div>
        );
    }
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                {user.avatarUrl && <img src={user.avatarUrl} alt="" className="size-10 rounded-full" referrerPolicy="no-referrer" />}
                <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{user.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">{t('auth.signed_in_via', { providers: user.providers.join('、') })}</p>
                </div>
            </div>
            <SyncStatus />
            {/* email 是 Supabase 自動綁定的身分、站上沒有 Email 登入，不算可用的登入方式 */}
            <LinkedProviders providers={user.providers.filter(p => p !== 'email')} />
            <MySubmissions />
            <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => { void signOut(); }}>{t('auth.sign_out')}</Button>
                <Button type="button" variant="ghost" className="text-red-500 hover:text-red-400" onClick={() => { setDeleteFailed(false); setConfirmOpen(true); }}>
                    {t('auth.delete_account')}
                </Button>
            </div>
            {deleteFailed && <p role="alert" className="text-sm text-red-500">{t('auth.delete_failed')}</p>}
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('auth.delete_confirm_title')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('auth.delete_confirm_desc')}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('auth.cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-red-600 hover:bg-red-500"
                            onClick={() => { deleteAccount().then(ok => setDeleteFailed(!ok)); }}
                        >
                            {t('auth.delete_account')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
