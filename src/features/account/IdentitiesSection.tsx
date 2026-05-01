import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Twitch, Youtube, MessageSquare, Loader2, Trash2, Plus, AlertTriangle } from 'lucide-react';
import { useAuthContext } from '../../contexts/AuthContext';
import { DeleteAccountDialog } from '../../components/Dialogs/DeleteAccountDialog';
import type { Provider, UserIdentity } from '@supabase/supabase-js';

const SUPPORTED_PROVIDERS: ReadonlyArray<{ provider: Provider; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
    { provider: 'twitch', label: 'Twitch', Icon: Twitch },
    { provider: 'google', label: 'Google', Icon: Youtube }, // 用 Youtube icon 暫代 Google
    { provider: 'discord', label: 'Discord', Icon: MessageSquare },
];

/**
 * 顯示與管理帳號連結的 OAuth providers。
 *
 * - 沒綁定的 provider：顯示「連結」按鈕
 * - 已綁定的 provider：顯示「已連結」徽章 + 「解除」按鈕
 * - 解除「最後一個」provider：阻擋並提示改走刪除帳號流程
 */
export function IdentitiesSection() {
    const { t } = useTranslation('account');
    const { identities, linkIdentity, unlinkIdentity } = useAuthContext();
    const [busy, setBusy] = useState<Provider | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [error, setError] = useState('');

    const linkedProviders = new Set(identities.map((i) => i.provider));

    const handleLink = async (provider: Provider) => {
        setBusy(provider);
        setError('');
        try {
            await linkIdentity(provider);
            // OAuth flow 會跳轉，回來後 onAuthStateChange 自動更新 identities
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : '連結失敗');
            setBusy(null);
        }
    };

    const handleUnlink = async (identity: UserIdentity) => {
        // 最後一個 → 改走刪除帳號流程
        if (identities.length <= 1) {
            setDeleteDialogOpen(true);
            return;
        }
        setBusy(identity.provider as Provider);
        setError('');
        try {
            await unlinkIdentity(identity);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : '解除失敗');
        } finally {
            setBusy(null);
        }
    };

    return (
        <section className="rounded-xl border border-white/10 bg-card/50 p-5 space-y-4">
            <header>
                <h2 className="text-lg font-semibold">{t('identities.title', '登入方式')}</h2>
                <p className="text-xs text-muted-foreground mt-1">
                    {t('identities.description',
                        '用任一連結的 OAuth 帳號都能登入此帳號。至少需保留一個；解除最後一個將永久刪除帳號。')}
                </p>
            </header>

            {error && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    {error}
                </div>
            )}

            <ul className="space-y-2">
                {SUPPORTED_PROVIDERS.map(({ provider, label, Icon }) => {
                    const linked = linkedProviders.has(provider);
                    const linkedIdentity = identities.find((i) => i.provider === provider);
                    const isBusy = busy === provider;
                    const isLastIdentity = linked && identities.length <= 1;
                    return (
                        <li
                            key={provider}
                            className="flex items-center justify-between rounded-lg border border-white/5 bg-background/50 p-3"
                        >
                            <div className="flex items-center gap-3">
                                <Icon className="w-5 h-5 text-muted-foreground" />
                                <div>
                                    <p className="text-sm font-medium">{label}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {linked
                                            ? t('identities.linkedAt', '已連結')
                                            : t('identities.notLinked', '未連結')}
                                    </p>
                                </div>
                            </div>
                            {linked && linkedIdentity ? (
                                <Button
                                    size="sm"
                                    variant={isLastIdentity ? 'destructive' : 'outline'}
                                    onClick={() => handleUnlink(linkedIdentity)}
                                    disabled={isBusy}
                                    className="gap-1"
                                >
                                    {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                    {isLastIdentity
                                        ? t('identities.deleteAccount', '解除並刪除帳號')
                                        : t('identities.unlink', '解除')}
                                </Button>
                            ) : (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleLink(provider)}
                                    disabled={isBusy}
                                    className="gap-1"
                                >
                                    {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                    {t('identities.link', '連結')}
                                </Button>
                            )}
                        </li>
                    );
                })}
            </ul>

            <DeleteAccountDialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} />
        </section>
    );
}
