// 「這是觀眾剪輯」勾選框＋剪輯頻道名稱／網址（後台歌回編輯器、社群投稿頁共用）。
//
// - 勾選前不顯示欄位；兩欄的值由呼叫端保存（取消勾選再勾回來，手改的值仍在），送出時只看勾選狀態。
// - 網址規則與伺服器同一份（functions/lib/songs.js 的 normalizeClipSource：youtube.com/@帳號 或 /channel/UC…）。

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '../../../components/ui/checkbox';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { normalizeClipSource } from '../../../../functions/lib/songs.js';

export interface ClipDraft {
    on: boolean;
    name: string;
    url: string;
}

export const EMPTY_CLIP: ClipDraft = { on: false, name: '', url: '' };

/** 送出用：沒勾 → null；勾了但不合法 → undefined（呼叫端擋住送出） */
export function clipForSubmit(clip: ClipDraft): { name: string; url: string } | null | undefined {
    if (!clip.on) return null;
    const r = normalizeClipSource(clip.name, clip.url) as { ok: boolean; value?: { name: string; url: string } | null };
    return r.ok && r.value ? r.value : undefined;
}

export function ClipSourceFields({ clip, onChange }: { clip: ClipDraft; onChange: (next: ClipDraft) => void }) {
    const { t } = useTranslation('songs');
    const base = useId();
    const invalid = clip.on && (clip.name.trim() !== '' || clip.url.trim() !== '') && clipForSubmit(clip) === undefined;
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <Checkbox id={`${base}-on`} checked={clip.on} onCheckedChange={(v: boolean | 'indeterminate') => onChange({ ...clip, on: v === true })} />
                <Label htmlFor={`${base}-on`} className="cursor-pointer">{t('editor.clip.toggle')}</Label>
            </div>
            {clip.on && (
                <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                        <Label htmlFor={`${base}-name`} className="text-[12px]">{t('editor.clip.name')}</Label>
                        <Input id={`${base}-name`} value={clip.name} maxLength={100} onChange={(e) => onChange({ ...clip, name: e.target.value })} aria-invalid={invalid} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor={`${base}-url`} className="text-[12px]">{t('editor.clip.url')}</Label>
                        <Input id={`${base}-url`} value={clip.url} maxLength={300} inputMode="url" onChange={(e) => onChange({ ...clip, url: e.target.value })} aria-invalid={invalid} placeholder="https://www.youtube.com/@…" />
                    </div>
                    <p className={invalid ? 'text-[12px] text-destructive sm:col-span-2' : 'text-[12px] text-muted-foreground sm:col-span-2'}>
                        {invalid ? t('editor.clip.invalid') : t('editor.clip.hint')}
                    </p>
                </div>
            )}
        </div>
    );
}
