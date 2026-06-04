import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Loader2, Check, AlertTriangle } from 'lucide-react';
import { useAuthContext } from '../../contexts/AuthContext';
import { AcctSection } from './AcctSection';
import { submitUpdateDisplayName, ApiError } from './apiClient';
import {
    normalizeDisplayName,
    validateDisplayName,
    DISPLAY_NAME_MIN,
    DISPLAY_NAME_MAX,
} from './displayNameValidator';

/**
 * 修改顯示名稱
 *
 * - 前端 NFKC normalize + 字元黑名單，與 server-side displayName.js 同邏輯
 * - 改名走 /api/account/update-display-name（含每日 5 次 KV rate limit）
 * - 成功後 refreshProfile 讓 navbar 立即顯示新名稱
 */
export function DisplayNameSection() {
    const { t } = useTranslation('account');
    const { profile, refreshProfile } = useAuthContext();
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        setName(profile?.display_name || '');
    }, [profile?.display_name]);

    const normalized = normalizeDisplayName(name);
    const validationKey = validateDisplayName(normalized);
    const dirty = !!profile && normalized !== (profile.display_name || '').normalize('NFKC');
    const canSubmit = !validationKey && dirty && !submitting;

    const handleSave = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        setError('');
        setSuccess(false);
        try {
            await submitUpdateDisplayName(normalized);
            await refreshProfile();
            setSuccess(true);
            // 2 秒後自動隱藏成功提示
            setTimeout(() => setSuccess(false), 2000);
        } catch (e: unknown) {
            if (e instanceof ApiError) {
                if (e.status === 429) {
                    setError(t('displayName.error.rateLimit', '本日修改次數已達上限'));
                } else if (e.payload?.errorCode) {
                    setError(t(e.payload.errorCode, '名稱格式錯誤'));
                } else {
                    setError(e.payload?.error || t('displayName.error.generic', '更新失敗'));
                }
            } else if (e instanceof Error) {
                setError(e.message);
            } else {
                setError(t('displayName.error.generic', '更新失敗'));
            }
        } finally {
            setSubmitting(false);
        }
    };

    const inlineError = name && validationKey ? t(validationKey, '名稱格式錯誤') : '';

    return (
        <AcctSection
            title={t('displayName.title', '顯示名稱')}
            description={t('displayName.description',
                `用於頁面與投稿者署名顯示。長度 ${DISPLAY_NAME_MIN}–${DISPLAY_NAME_MAX} 字。`,
                { min: DISPLAY_NAME_MIN, max: DISPLAY_NAME_MAX })}
        >
          <div className="space-y-4">
            <div className="space-y-2">
                <Input
                    value={name}
                    onChange={(e) => {
                        setName(e.target.value);
                        setError('');
                        setSuccess(false);
                    }}
                    maxLength={DISPLAY_NAME_MAX * 2}
                    disabled={submitting}
                    placeholder={t('displayName.placeholder', '輸入顯示名稱')}
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                        {normalized.length} / {DISPLAY_NAME_MAX}
                    </span>
                    {inlineError && (
                        <span className="text-destructive flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            {inlineError}
                        </span>
                    )}
                </div>
            </div>

            {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                    {error}
                </div>
            )}
            {success && (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs text-emerald-500 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    {t('displayName.saved', '已儲存')}
                </div>
            )}

            <div className="flex justify-end">
                <Button onClick={handleSave} disabled={!canSubmit} className="gap-2">
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {t('displayName.save', '儲存')}
                </Button>
            </div>
          </div>
        </AcctSection>
    );
}
