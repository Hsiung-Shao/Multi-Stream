// 片段的合唱者編輯（SegmentEditor 每列底下一行；後台與投稿頁共用）。
//
// - 已加的合唱者以 chip 顯示，chip 內的 X 移除（aria-label「移除合唱 名字」）。
// - 「新增合唱」展開：站內 VTuber 用 VtuberPicker 搜尋或貼 uuid；不在站內的人輸入名字按「加入」。展開後可連續加，按「完成」收起。
// - 站內者只存 vtuberId，畫面名稱用 useVtuberNames 即時查（改名會跟著變）；同一人不重複、每首最多 10 位（與伺服器一致）。
// - 「套用到全部片段」由 SegmentEditor 給 onApplyAll 才顯示。

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Plus, X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { useVtuberNames } from '../streamLookup';
import { VtuberPicker } from './VtuberPicker';
import type { PerformerDraft } from './segmentRows';

export const PERFORMERS_MAX = 10;
const NAME_MAX = 60;

export function PerformersEditor({ performers, onChange, onApplyAll, n }: {
    performers: PerformerDraft[];
    onChange: (next: PerformerDraft[]) => void;
    /** 把這列的合唱者套用到全部片段；沒給就不顯示按鈕 */
    onApplyAll?: () => void;
    /** 列號（aria 用） */
    n: number;
}) {
    const { t } = useTranslation('songs');
    const [open, setOpen] = useState(false);
    const [external, setExternal] = useState('');
    const full = performers.length >= PERFORMERS_MAX;

    const addVtuber = (id: string | null) => {
        if (!id || full) return;
        const key = id.toLowerCase();
        if (performers.some((p) => p.vtuberId?.toLowerCase() === key)) return;
        onChange([...performers, { vtuberId: key, name: null }]);
    };
    const addExternal = () => {
        const name = external.trim().slice(0, NAME_MAX);
        if (!name || full) return;
        setExternal('');
        if (performers.some((p) => !p.vtuberId && p.name === name)) return;
        onChange([...performers, { vtuberId: null, name }]);
    };

    if (performers.length === 0 && !open) {
        return (
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[12px] text-muted-foreground" onClick={() => setOpen(true)}>
                <Plus className="size-3.5" aria-hidden="true" />{t('editor.performers.add')}
            </Button>
        );
    }

    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[12px] text-muted-foreground">{t('editor.performers.label')}</span>
                {performers.map((p, i) => {
                    const remove = () => onChange(performers.filter((_, j) => j !== i));
                    const key = `${p.vtuberId ?? 'x'}:${p.name ?? ''}:${i}`;
                    return p.vtuberId
                        ? <VtuberChip key={key} vtuberId={p.vtuberId} fallback={p.name} onRemove={remove} />
                        : <Chip key={key} name={p.name ?? ''} onRemove={remove} />;
                })}
                {!open && (
                    <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[12px]" onClick={() => setOpen(true)} disabled={full}>
                        <Plus className="size-3.5" aria-hidden="true" />{t('editor.performers.add')}
                    </Button>
                )}
                {onApplyAll && performers.length > 0 && (
                    <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[12px]" onClick={onApplyAll}>
                        <Copy className="size-3.5" aria-hidden="true" />{t('editor.performers.applyAll')}
                    </Button>
                )}
            </div>
            {open && (
                <div className="flex flex-wrap items-start gap-2 rounded-md border border-dashed border-border p-2">
                    <div className="w-64 max-w-full">
                        <VtuberPicker value={null} onChange={addVtuber} id={`performer-vtuber-${n}`} />
                    </div>
                    <div className="flex items-center gap-1">
                        <Input
                            value={external}
                            onChange={(e) => setExternal(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addExternal(); } }}
                            maxLength={NAME_MAX}
                            placeholder={t('editor.performers.external')}
                            aria-label={t('editor.performers.external')}
                            className="h-9 w-40"
                        />
                        <Button type="button" size="sm" variant="outline" className="h-9" onClick={addExternal} disabled={!external.trim() || full}>
                            {t('editor.performers.addExternal')}
                        </Button>
                    </div>
                    <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => setOpen(false)}>
                        {t('editor.performers.close')}
                    </Button>
                    {full && <p className="basis-full text-[11.5px] text-muted-foreground">{t('editor.performers.max')}</p>}
                </div>
            )}
        </div>
    );
}

function Chip({ name, onRemove }: { name: string; onRemove: () => void }) {
    const { t } = useTranslation('songs');
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pl-2.5 pr-1 text-[12px]">
            {name}
            <button
                type="button"
                onClick={onRemove}
                aria-label={t('editor.performers.remove', { name })}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <X className="size-3" aria-hidden="true" />
            </button>
        </span>
    );
}

/** 站內合唱者：名稱即時查（改名會跟著變）；查不到時用快照名或 id */
function VtuberChip({ vtuberId, fallback, onRemove }: { vtuberId: string; fallback: string | null; onRemove: () => void }) {
    const names = useVtuberNames([vtuberId]);
    return <Chip name={names.data?.get(vtuberId)?.name ?? fallback ?? vtuberId} onRemove={onRemove} />;
}
