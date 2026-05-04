import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Copy, Download, Check, AlertTriangle } from 'lucide-react';

interface Props {
    open: boolean;
    codes: string[];
    onDone: () => void;
}

/**
 * 顯示新產生的備援碼 — 只此一次。
 * 提供「複製全部」「下載 .txt」兩種方便用戶保存的方式。
 * 必須勾選「我已妥善保存」才能關閉，避免誤關失去碼。
 */
export function BackupCodesDialog({ open, codes, onDone }: Props) {
    const { t } = useTranslation('account');
    const [acknowledged, setAcknowledged] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(codes.join('\n'));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* ignore */ }
    };

    const handleDownload = () => {
        const blob = new Blob(
            [`MultiStream Hub — 2FA Backup Codes\nGenerated: ${new Date().toISOString()}\n\n${codes.join('\n')}\n\n保存好這些碼。每組僅能使用一次，遺失後可用來重置 2FA。`],
            { type: 'text/plain;charset=utf-8' },
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `multistream-2fa-backup-codes-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v && acknowledged) onDone(); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('mfa.backup.title', '備援碼')}</DialogTitle>
                    <DialogDescription>{t('mfa.backup.desc', '遺失驗證器時可用備援碼恢復登入。每組僅能使用一次。')}</DialogDescription>
                </DialogHeader>

                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-500 flex items-start gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{t('mfa.backup.warning', '請立即複製或下載 — 此頁離開後無法再次顯示')}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 font-mono text-sm bg-muted/30 rounded-md p-3 select-all">
                    {codes.map((c, i) => (
                        <div key={i} className="px-2 py-1 bg-background/50 rounded text-center tracking-wider">
                            {c}
                        </div>
                    ))}
                </div>

                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1 flex-1">
                        {copied
                            ? <><Check className="w-3.5 h-3.5" /> {t('mfa.enroll.copied', '已複製')}</>
                            : <><Copy className="w-3.5 h-3.5" /> {t('mfa.backup.copyAll', '複製全部')}</>
                        }
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1 flex-1">
                        <Download className="w-3.5 h-3.5" /> {t('mfa.backup.download', '下載 .txt')}
                    </Button>
                </div>

                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={acknowledged}
                        onChange={(e) => setAcknowledged(e.target.checked)}
                        className="rounded border-input"
                    />
                    {t('mfa.backup.done', '我已妥善保存')}
                </label>

                <DialogFooter>
                    <Button onClick={onDone} disabled={!acknowledged}>
                        {t('common:close', '關閉')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
