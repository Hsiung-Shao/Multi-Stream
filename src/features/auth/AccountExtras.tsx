/** 帳號區的附加區塊：登入方式綁定、我的投稿、被其他裝置登入踢掉的提示 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { ScrollArea } from '../../components/ui/scroll-area';
import { getSupabase } from '../../lib/supabase';
import { useAuthStore, linkProvider, unlinkProvider, type AuthProvider } from './authStore';

const LINKABLE: { id: AuthProvider; label: string }[] = [
    { id: 'twitch', label: 'Twitch' },
    { id: 'google', label: 'Google' },
    { id: 'discord', label: 'Discord' },
];

/** 三種登入方式各一列：已綁定可解除（只剩一種時不行），未綁定可綁定 */
export function LinkedProviders({ providers }: { providers: string[] }) {
    const { t } = useTranslation('common');
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const run = (fn: () => Promise<void>) => {
        setBusy(true);
        setFailed(false);
        fn().catch(() => setFailed(true)).finally(() => setBusy(false));
    };
    return (
        <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">{t('auth.link_title')}</p>
            <ul className="space-y-1.5">
                {LINKABLE.map(p => {
                    const linked = providers.includes(p.id);
                    const label = t(linked ? 'auth.unlink' : 'auth.link', { provider: p.label });
                    return (
                        <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-foreground">{p.label}<span className="ml-2 text-xs text-muted-foreground">{linked ? t('auth.linked') : ''}</span></span>
                            <Button type="button" size="sm" variant="outline" aria-label={label}
                                disabled={busy || (linked && providers.length < 2)}
                                onClick={() => run(() => (linked ? unlinkProvider(p.id) : linkProvider(p.id)))}>
                                {t(linked ? 'auth.unlink_short' : 'auth.link_short')}
                            </Button>
                        </li>
                    );
                })}
            </ul>
            {failed && <p role="alert" className="text-sm text-red-500">{t('auth.link_failed')}</p>}
        </div>
    );
}

interface Submission { kind: string; id: string; created_at: string; status: string; title: string }

const KIND_KEY = {
    schedule: 'auth.sub_kind_schedule', add: 'auth.sub_kind_vtuber', update: 'auth.sub_kind_vtuber',
    report: 'auth.sub_kind_report', song: 'auth.sub_kind_song', feedback: 'auth.sub_kind_feedback',
} as const;
const STATUS_KEY = { pending: 'auth.sub_status_pending', done: 'auth.sub_status_done', declined: 'auth.sub_status_declined' } as const;
// 四張表的狀態值不同，統一成三類
const STATUS_GROUP: Record<string, 'pending' | 'done' | 'declined'> = {
    pending: 'pending', new: 'pending', open: 'pending', read: 'pending',
    approved: 'done', applied: 'done', fixed: 'done', processed: 'done', resolved: 'done',
    rejected: 'declined', reverted: 'declined', dismissed: 'declined', wontfix: 'declined',
};

/** 我的投稿：登入時查一次最近 50 筆（RPC my_submissions，只回自己的） */
export function MySubmissions() {
    const { t, i18n } = useTranslation('common');
    const userId = useAuthStore(s => s.user?.id);
    const [rows, setRows] = useState<Submission[] | null>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        if (!userId) return;
        let alive = true;
        setRows(null);
        setFailed(false);
        (async () => {
            const sb = await getSupabase();
            if (!sb) throw new Error('no_client');
            const { data, error } = await sb.rpc('my_submissions').abortSignal(AbortSignal.timeout(15_000));
            if (error) throw error;
            if (alive) setRows((data ?? []) as Submission[]);
        })().catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, [userId]);
    const fmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
    return (
        <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">{t('auth.my_submissions')}</p>
            {failed ? <p className="text-xs text-red-500">{t('auth.sub_load_failed')}</p>
                : rows === null ? <p className="text-xs text-muted-foreground">{t('auth.sub_loading')}</p>
                    : rows.length === 0 ? <p className="text-xs text-muted-foreground">{t('auth.sub_empty')}</p>
                        : (
                            <ScrollArea className="[&>[data-radix-scroll-area-viewport]]:max-h-60">
                            <ul className="space-y-1 pr-3">
                                {rows.map(r => (
                                    <li key={`${r.kind}:${r.id}`} className="flex items-center gap-2 text-xs">
                                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{t(KIND_KEY[r.kind as keyof typeof KIND_KEY] ?? 'auth.sub_kind_vtuber')}</span>
                                        <span className="min-w-0 flex-1 truncate text-foreground">{r.title}</span>
                                        <span className="shrink-0 text-muted-foreground">{t(STATUS_KEY[STATUS_GROUP[r.status] ?? 'pending'])}</span>
                                        <span className="shrink-0 text-muted-foreground">{fmt.format(new Date(r.created_at))}</span>
                                    </li>
                                ))}
                            </ul>
                            </ScrollArea>
                        )}
        </div>
    );
}

/** 被其他裝置的新登入踢掉時跳提示（掛在 Toaster 旁；電腦版與手機版各掛一次） */
export function KickedToast() {
    const { t } = useTranslation('common');
    const kicked = useAuthStore(s => s.kicked);
    useEffect(() => { if (kicked) toast(t('auth.kicked')); }, [kicked, t]);
    return null;
}
