import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useAuthContext } from '../../contexts/AuthContext';

interface DeleteAccountDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 永久刪除帳號（GDPR-style）多步驟確認
 *
 * 觸發點：解除最後一個 OAuth identity 時，或 settings 頁的「永久刪除帳號」按鈕
 *
 * 流程：
 * 1. user 必須勾「我了解這是不可逆操作」
 * 2. user 必須輸入自己的 display_name 完全相符
 * 3. 提交 → /api/account/delete-account
 * 4. 成功 → logout + reload 首頁
 */
export function DeleteAccountDialog({ open, onClose }: DeleteAccountDialogProps) {
  const { t } = useTranslation('account');
  const { profile, logout } = useAuthContext();
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setAcknowledged(false);
      setConfirmName('');
      setError('');
      setSubmitting(false);
    }
  }, [open]);

  const expectedName = (profile?.display_name || '').trim();
  const canSubmit = acknowledged && confirmName.trim() === expectedName && !submitting;

  const handleDelete = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      const { submitDeleteAccount } = await import('../../features/account/apiClient');
      await submitDeleteAccount(confirmName.trim());
      // 成功：logout + redirect 首頁，避免殘留 stale state
      await logout();
      window.location.href = '/';
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('deleteAccount.error', '刪除失敗');
      setError(msg);
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !submitting) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            {t('deleteAccount.title', '永久刪除帳號')}
          </DialogTitle>
          <DialogDescription>
            {t('deleteAccount.description',
              '此操作會永久刪除你的帳號與所有資料（收藏、投稿、活動）。資料無法復原。')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {t('deleteAccount.warningList',
              '將被刪除：所有 OAuth 連結、收藏分類與標籤、你的投稿與活動、你的個人資料')}
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="ack"
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(v === true)}
              disabled={submitting}
            />
            <label htmlFor="ack" className="text-sm leading-tight cursor-pointer select-none">
              {t('deleteAccount.acknowledge',
                '我了解這是不可逆操作，且我的所有資料將被永久刪除')}
            </label>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">
              {t('deleteAccount.confirmNameLabel',
                '為了確認，請輸入你的顯示名稱：')}
              <span className="ml-1 font-mono text-foreground">{expectedName}</span>
            </label>
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={expectedName}
              disabled={submitting}
              autoComplete="off"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {t('common:cancel', '取消')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!canSubmit}
          >
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {t('deleteAccount.confirm', '永久刪除')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
