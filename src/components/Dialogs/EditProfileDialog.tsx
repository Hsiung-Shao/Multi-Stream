import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Loader2, Check } from 'lucide-react';
import { useAuthContext } from '../../contexts/AuthContext';

interface EditProfileDialogProps {
  open: boolean;
  onClose: () => void;
}

export function EditProfileDialog({ open, onClose }: EditProfileDialogProps) {
  const { t } = useTranslation();
  const { profile, updateDisplayName } = useAuthContext();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open && profile) {
      setName(profile.display_name || '');
      setError('');
      setSuccess(false);
    }
  }, [open, profile]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('common:fieldRequired', '此欄位為必填'));
      return;
    }
    if (trimmed.length > 50) {
      setError(t('common:tooLong', '名稱過長（最多 50 字）'));
      return;
    }
    if (trimmed === profile?.display_name) {
      onClose();
      return;
    }

    setSaving(true);
    setError('');

    const ok = await updateDisplayName(trimmed);

    setSaving(false);
    if (ok) {
      setSuccess(true);
      setTimeout(() => onClose(), 800);
    } else {
      setError(t('common:saveFailed', '儲存失敗，請稍後再試'));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !saving) {
      handleSave();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle className="text-base">
            {t('common:editDisplayName', '修改顯示名稱')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t('common:editDisplayNameDesc', '此名稱將顯示在你的活動與貢獻中')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
              setSuccess(false);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t('common:displayNamePlaceholder', '輸入新名稱')}
            maxLength={50}
            autoFocus
          />

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {name.trim().length}/50
            </span>
            {error && <span className="text-[11px] text-destructive">{error}</span>}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
              {t('common:cancel', '取消')}
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="gap-1.5"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : success ? (
                <Check className="w-3.5 h-3.5" />
              ) : null}
              {success ? t('common:saved', '已儲存') : t('common:save', '儲存')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
