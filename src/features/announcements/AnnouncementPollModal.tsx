/**
 * 公告投票 Modal
 *
 * 三狀態:
 *   1. 未投票 → 顯示選項 + 送出按鈕
 *   2. 已投(這次剛送出 OR backend 回 already_responded OR LocalStorage 標記)
 *      → 顯示目前結果(progress bar + 票數)
 *   3. submit 中 → 按鈕 disabled
 *
 * 關閉行為:
 *   - 已投票後關閉:寫 voted flag(下次不再彈)
 *   - 未投票按 X / 點外面:寫 dismissed flag(下次也不再彈,避免騷擾)
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { Checkbox } from '../../components/ui/checkbox';
import { Progress } from '../../components/ui/progress';
import { Label } from '../../components/ui/label';
import { setFlag } from './storage';
import { getOrCreateDeviceId } from './deviceId';
import {
    fetchAnnouncementResults,
    submitAnnouncementResponse,
} from './api';
import type { Announcement, PollPayload, PollResults } from './types';

interface Props {
    announcement: Announcement;
    open: boolean;
    onClose: () => void;
}

function isPollPayload(p: unknown): p is PollPayload {
    if (!p || typeof p !== 'object') return false;
    const opts = (p as { options?: unknown }).options;
    return Array.isArray(opts) && opts.every((o) => o && typeof (o as { id?: unknown }).id === 'string');
}

export function AnnouncementPollModal({ announcement, open, onClose }: Props) {
    const { t } = useTranslation('announcements');
    const payload = isPollPayload(announcement.payload) ? announcement.payload : null;
    const multiSelect = payload?.multi_select === true;
    const options = payload?.options ?? [];

    const [selected, setSelected] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [voted, setVoted] = useState(false);
    const [results, setResults] = useState<PollResults | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const totalVotes = results?.total ?? 0;

    // 結果載入的唯一路徑:開啟中且 voted=true(剛送出或 backend 認定已投)就拉結果
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        // open 時 reset 一次性 state
        setErrorMsg(null);
        if (voted) {
            void fetchAnnouncementResults(announcement.id).then((r) => {
                if (cancelled) return;
                if (r && r.type === 'poll') setResults(r);
            });
        }
        return () => {
            cancelled = true;
        };
    }, [open, voted, announcement.id]);

    const toggleOption = (id: string) => {
        setSelected((prev) => {
            if (multiSelect) {
                return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
            }
            return [id];
        });
    };

    const handleSubmit = async () => {
        if (selected.length === 0 || submitting) return;
        setSubmitting(true);
        setErrorMsg(null);
        const deviceId = getOrCreateDeviceId();
        const result = await submitAnnouncementResponse({
            announcement_id: announcement.id,
            choices: selected.map((id) => ({ option_id: id })),
            device_id: deviceId,
        });
        setSubmitting(false);

        // 送出成功與 backend 認定已投(already_responded)都視為已投;
        // voted 翻 true 後由上面的 effect 統一拉結果
        if (result.ok || ('reason' in result && result.reason === 'already_responded')) {
            setFlag('voted', announcement.id);
            setVoted(true);
            return;
        }
        setErrorMsg(t('poll.submitError', '送出失敗,請稍後再試'));
    };

    const handleOpenChange = (next: boolean) => {
        if (next) return; // 開啟由 provider 控制
        // 關閉:已投票寫 voted、未投票寫 dismissed
        if (voted) {
            setFlag('voted', announcement.id);
        } else {
            setFlag('dismissed', announcement.id);
        }
        onClose();
    };

    // payload 結構壞掉 — 不要 render 內容,fallback 純文字 + 關閉
    if (!payload) {
        return (
            <Dialog open={open} onOpenChange={handleOpenChange}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{announcement.title}</DialogTitle>
                        {announcement.body && (
                            <DialogDescription>{announcement.body}</DialogDescription>
                        )}
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => handleOpenChange(false)}>
                            {t('close', '關閉')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{announcement.title}</DialogTitle>
                    {announcement.body && (
                        <DialogDescription className="whitespace-pre-line">
                            {announcement.body}
                        </DialogDescription>
                    )}
                </DialogHeader>

                {!voted ? (
                    <div className="flex flex-col gap-3">
                        <p className="text-xs text-muted-foreground">
                            {multiSelect
                                ? t('poll.multiSelect', '可以複選')
                                : t('poll.singleSelect', '請選擇一個選項')}
                        </p>

                        {multiSelect ? (
                            <div className="grid gap-2">
                                {options.map((opt) => {
                                    const checked = selected.includes(opt.id);
                                    const cid = `poll-opt-${announcement.id}-${opt.id}`;
                                    return (
                                        <label
                                            key={opt.id}
                                            htmlFor={cid}
                                            className="flex items-center gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-accent/40"
                                        >
                                            <Checkbox
                                                id={cid}
                                                checked={checked}
                                                onCheckedChange={() => toggleOption(opt.id)}
                                            />
                                            <span className="text-sm">{opt.label}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        ) : (
                            <RadioGroup
                                value={selected[0] ?? ''}
                                onValueChange={(v: string) => toggleOption(v)}
                                className="grid gap-2"
                            >
                                {options.map((opt) => {
                                    const cid = `poll-opt-${announcement.id}-${opt.id}`;
                                    return (
                                        <label
                                            key={opt.id}
                                            htmlFor={cid}
                                            className="flex items-center gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-accent/40"
                                        >
                                            <RadioGroupItem value={opt.id} id={cid} />
                                            <span className="text-sm">{opt.label}</span>
                                        </label>
                                    );
                                })}
                            </RadioGroup>
                        )}

                        {errorMsg && (
                            <p className="text-xs text-destructive" role="alert">
                                {errorMsg}
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        <Label className="text-sm font-medium">
                            {t('poll.results', '目前結果')}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            {t('poll.totalVotes', '共 {{count}} 票', { count: totalVotes })}
                        </p>
                        <div className="grid gap-3">
                            {(results?.options ?? options.map((o) => ({
                                id: o.id,
                                label: o.label,
                                count: 0,
                            }))).map((opt) => {
                                const pct = totalVotes > 0 ? Math.round((opt.count / totalVotes) * 100) : 0;
                                const labelText = opt.label ?? options.find((o) => o.id === opt.id)?.label ?? opt.id;
                                return (
                                    <div key={opt.id} className="flex flex-col gap-1.5">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="truncate pr-2">{labelText}</span>
                                            <span className="tabular-nums text-muted-foreground text-xs">
                                                {opt.count} ({pct}%)
                                            </span>
                                        </div>
                                        <Progress value={pct} aria-label={`${labelText} ${pct}%`} />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <DialogFooter>
                    {!voted ? (
                        <>
                            <Button
                                variant="outline"
                                onClick={() => handleOpenChange(false)}
                                disabled={submitting}
                            >
                                {t('cancel', '取消')}
                            </Button>
                            <Button onClick={handleSubmit} disabled={submitting || selected.length === 0}>
                                {submitting ? t('loading', '處理中…') : t('submit', '送出')}
                            </Button>
                        </>
                    ) : (
                        <Button onClick={() => handleOpenChange(false)}>
                            {t('close', '關閉')}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
