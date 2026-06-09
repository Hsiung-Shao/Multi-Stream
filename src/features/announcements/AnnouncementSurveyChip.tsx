/**
 * 問卷接收 UI(右下角 chip + 點開 Dialog)
 *
 * Lifecycle:
 *   - chip 永久顯示(直到 LocalStorage voted 或 dismissed)
 *   - 點 chip → 開 Dialog,動態 render 各題
 *   - submit 成功 → Dialog 顯示「謝謝填寫」,寫 voted flag,chip 消失
 *
 * 題型:
 *   single — radio
 *   multi  — checkbox
 *   text   — textarea
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList, X } from 'lucide-react';
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
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { setFlag } from './storage';
import { getOrCreateDeviceId } from './deviceId';
import { submitAnnouncementResponse } from './api';
import type { Announcement, SurveyChoiceItem, SurveyPayload, SurveyQuestion } from './types';

interface Props {
    announcement: Announcement;
    onDismiss: () => void;
}

function isSurveyPayload(p: unknown): p is SurveyPayload {
    if (!p || typeof p !== 'object') return false;
    const qs = (p as { questions?: unknown }).questions;
    if (!Array.isArray(qs)) return false;
    return qs.every(
        (q) =>
            q &&
            typeof (q as { id?: unknown }).id === 'string' &&
            ['single', 'multi', 'text'].includes((q as { type?: string }).type ?? ''),
    );
}

type AnswerMap = Record<string, string[] | string>; // qId → option_ids[] 或 text

const TEXT_MAX_LEN = 2000;

export function AnnouncementSurveyChip({ announcement, onDismiss }: Props) {
    const { t } = useTranslation('announcements');
    const payload = isSurveyPayload(announcement.payload) ? announcement.payload : null;
    const questions = useMemo<SurveyQuestion[]>(() => payload?.questions ?? [], [payload]);

    const [open, setOpen] = useState(false);
    const [answers, setAnswers] = useState<AnswerMap>({});
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    if (!payload || questions.length === 0) {
        // payload 壞掉 — 連 chip 都不顯示(避免 user 點下去開空 Dialog)
        return null;
    }

    const setSingle = (qId: string, optionId: string) => {
        setAnswers((prev) => ({ ...prev, [qId]: [optionId] }));
    };

    const toggleMulti = (qId: string, optionId: string) => {
        setAnswers((prev) => {
            const cur = Array.isArray(prev[qId]) ? (prev[qId] as string[]) : [];
            const next = cur.includes(optionId)
                ? cur.filter((x) => x !== optionId)
                : [...cur, optionId];
            return { ...prev, [qId]: next };
        });
    };

    const setText = (qId: string, text: string) => {
        setAnswers((prev) => ({ ...prev, [qId]: text.slice(0, TEXT_MAX_LEN) }));
    };

    /** 全部題目至少要有一個有效答案才允許送出 */
    const canSubmit = useMemo(() => {
        for (const q of questions) {
            const a = answers[q.id];
            if (q.type === 'text') {
                if (typeof a !== 'string' || a.trim().length === 0) return false;
            } else {
                if (!Array.isArray(a) || a.length === 0) return false;
            }
        }
        return true;
    }, [questions, answers]);

    const handleSubmit = async () => {
        if (!canSubmit || submitting) return;
        setSubmitting(true);
        setErrorMsg(null);

        // 組 backend 期望的 choices array
        const choices: SurveyChoiceItem[] = [];
        for (const q of questions) {
            const a = answers[q.id];
            if (q.type === 'text' && typeof a === 'string') {
                choices.push({ question_id: q.id, text: a.trim() });
            } else if ((q.type === 'single' || q.type === 'multi') && Array.isArray(a)) {
                choices.push({ question_id: q.id, option_ids: a });
            }
        }

        const deviceId = getOrCreateDeviceId();
        const result = await submitAnnouncementResponse({
            announcement_id: announcement.id,
            choices,
            device_id: deviceId,
        });
        setSubmitting(false);

        // 送出成功與 backend 認定已回應(already_responded)都視為完成
        if (result.ok || ('reason' in result && result.reason === 'already_responded')) {
            setFlag('voted', announcement.id);
            setDone(true);
            return;
        }
        setErrorMsg(t('survey.submitError', '送出失敗,請稍後再試'));
    };

    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (!next && done) {
            // 已完成 → 通知 provider 把 chip 收掉
            onDismiss();
        }
    };

    const dismissChip = () => {
        setFlag('dismissed', announcement.id);
        onDismiss();
    };

    return (
        <>
            {/* 右下角 floating chip — 不擋 FeedbackFAB(FAB 在 right-6 bottom-6,這個放 right-4 bottom-20 上方) */}
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-primary text-primary-foreground shadow-lg pl-4 pr-2 py-2 text-sm hover:bg-primary/90 transition-colors max-w-[calc(100vw-2rem)]"
                aria-label={announcement.title}
            >
                <ClipboardList className="size-4 shrink-0" />
                <span className="truncate">
                    {t('survey.openButton', '我們有問題想問你')}
                </span>
                <span
                    role="button"
                    tabIndex={0}
                    aria-label={t('dontShowAgain', '不再顯示')}
                    className="ml-1 inline-flex items-center justify-center rounded-full p-1 hover:bg-primary-foreground/20"
                    onClick={(e) => {
                        e.stopPropagation();
                        dismissChip();
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            dismissChip();
                        }
                    }}
                >
                    <X className="size-3.5" />
                </span>
            </button>

            <Dialog open={open} onOpenChange={handleOpenChange}>
                <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{announcement.title}</DialogTitle>
                        {announcement.body && (
                            <DialogDescription className="whitespace-pre-line">
                                {announcement.body}
                            </DialogDescription>
                        )}
                    </DialogHeader>

                    {done ? (
                        <div className="py-8 text-center">
                            <p className="text-base font-medium">
                                {t('survey.thanks', '謝謝填寫')}
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-5">
                            {questions.map((q, idx) => {
                                const qid = `survey-${announcement.id}-${q.id}`;
                                return (
                                    <div key={q.id} className="flex flex-col gap-2">
                                        <Label htmlFor={qid} className="text-sm">
                                            <span className="text-muted-foreground text-xs mr-2">
                                                {t('survey.questionCount', '第 {{current}} / {{total}} 題', {
                                                    current: idx + 1,
                                                    total: questions.length,
                                                })}
                                            </span>
                                            <span>{q.label}</span>
                                        </Label>

                                        {q.type === 'text' && (
                                            <Textarea
                                                id={qid}
                                                placeholder={t('survey.textPlaceholder', '請在此輸入你的回答…')}
                                                value={typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''}
                                                onChange={(e) => setText(q.id, e.target.value)}
                                                maxLength={TEXT_MAX_LEN}
                                                rows={3}
                                            />
                                        )}

                                        {q.type === 'single' && (
                                            <RadioGroup
                                                value={
                                                    Array.isArray(answers[q.id]) && (answers[q.id] as string[]).length > 0
                                                        ? (answers[q.id] as string[])[0]
                                                        : ''
                                                }
                                                onValueChange={(v: string) => setSingle(q.id, v)}
                                                className="grid gap-1.5"
                                            >
                                                {(q.options ?? []).map((opt) => {
                                                    const oid = `${qid}-${opt.id}`;
                                                    return (
                                                        <label
                                                            key={opt.id}
                                                            htmlFor={oid}
                                                            className="flex items-center gap-3 rounded-md border border-border p-2.5 cursor-pointer hover:bg-accent/40"
                                                        >
                                                            <RadioGroupItem value={opt.id} id={oid} />
                                                            <span className="text-sm">{opt.label}</span>
                                                        </label>
                                                    );
                                                })}
                                            </RadioGroup>
                                        )}

                                        {q.type === 'multi' && (
                                            <div className="grid gap-1.5">
                                                {(q.options ?? []).map((opt) => {
                                                    const checked =
                                                        Array.isArray(answers[q.id]) &&
                                                        (answers[q.id] as string[]).includes(opt.id);
                                                    const oid = `${qid}-${opt.id}`;
                                                    return (
                                                        <label
                                                            key={opt.id}
                                                            htmlFor={oid}
                                                            className="flex items-center gap-3 rounded-md border border-border p-2.5 cursor-pointer hover:bg-accent/40"
                                                        >
                                                            <Checkbox
                                                                id={oid}
                                                                checked={checked}
                                                                onCheckedChange={() => toggleMulti(q.id, opt.id)}
                                                            />
                                                            <span className="text-sm">{opt.label}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {errorMsg && (
                                <p className="text-xs text-destructive" role="alert">
                                    {errorMsg}
                                </p>
                            )}
                            {!canSubmit && (
                                <p className="text-xs text-muted-foreground">
                                    {t('survey.requiredHint', '請完成所有題目後再送出')}
                                </p>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        {done ? (
                            <Button onClick={() => handleOpenChange(false)}>
                                {t('close', '關閉')}
                            </Button>
                        ) : (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={() => handleOpenChange(false)}
                                    disabled={submitting}
                                >
                                    {t('cancel', '取消')}
                                </Button>
                                <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
                                    {submitting ? t('loading', '處理中…') : t('submit', '送出')}
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
