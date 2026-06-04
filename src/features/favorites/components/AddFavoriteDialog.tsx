import { useForm, Controller } from 'react-hook-form';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { TagPopoverSelector } from '../../../components/ui/TagPopoverSelector';
import { TagChip } from '../../../components/ui/TagChip';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import {
    Star, Pencil, Clipboard, Link2, Twitch, Youtube, Folder, Check,
    Play, Plus, Trash2, Monitor, X,
} from 'lucide-react';
import type { FavoriteStream, FavoriteCategory as Category, Tag } from '../types';

interface AddFavoriteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: AddFavoriteFormValues) => void;
    categories: Category[];
    allTags: Tag[];
    initialData?: FavoriteStream | null;
    theme: 'light' | 'dark';
}

export interface AddFavoriteFormValues {
    url: string;
    name: string;
    categoryId: string;
    tagIds: string[];
}

// ---- Presentational platform detection -------------------------------------
// 純展示用:只驅動 input icon 顏色、預覽卡、何時顯示平台選擇器。
// 不改變實際送出的 url —— 真實平台解析仍在 favoritesService.addFavorite 內進行。
type AfPlatform = 'twitch' | 'youtube';
function detectPlatform(input: string): { platform: AfPlatform | null; handle: string } {
    const s = (input || '').trim();
    if (!s) return { platform: null, handle: '' };
    let m: RegExpMatchArray | null;
    if ((m = s.match(/twitch\.tv\/([A-Za-z0-9_]{2,40})/i))) return { platform: 'twitch', handle: m[1] };
    if ((m = s.match(/youtube\.com\/@([A-Za-z0-9_.\-]{2,40})/i))) return { platform: 'youtube', handle: m[1] };
    if ((m = s.match(/youtube\.com\/channel\/([A-Za-z0-9_\-]{4,40})/i))) return { platform: 'youtube', handle: m[1] };
    if ((m = s.match(/youtu\.be\/([A-Za-z0-9_\-]{4,40})/i))) return { platform: 'youtube', handle: m[1] };
    if (/^@?[A-Za-z0-9_.\-]{2,40}$/.test(s)) return { platform: null, handle: s.replace(/^@/, '') };
    return { platform: null, handle: '' };
}

// 平台主色(僅用於 input icon / 預覽 / badge 的品牌色點綴,非主題 token)
function platformColor(p: AfPlatform | null): string {
    return p === 'youtube' ? '#FF3D3D' : p === 'twitch' ? '#9146FF' : '';
}

// 共用 eyebrow label 樣式
const afLabel = 'block text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground mb-2.5';

export function AddFavoriteDialog({
    open,
    onOpenChange,
    onSubmit,
    categories,
    allTags,
    initialData,
    theme
}: AddFavoriteDialogProps) {
    const { t } = useTranslation(['favorites', 'common', 'tags']);
    const isEdit = !!initialData;

    const { register, handleSubmit, control, reset, setValue, watch } = useForm<AddFavoriteFormValues>({
        defaultValues: {
            url: '',
            name: '',
            categoryId: 'uncategorized',
            tagIds: []
        }
    });

    const url = watch('url');
    const editName = watch('name');
    const selectedTagIds = watch('tagIds');

    // 純視覺狀態(不影響送出 payload)
    const [manualPlatform, setManualPlatform] = useState<AfPlatform | null>(null);
    // autoLoad 預設 off:對齊現有「新增後不自動載入」行為,避免誤導。
    // TODO(fullstack):待接 favoritesLoader 後讓此 toggle 真正生效。
    const [autoLoad, setAutoLoad] = useState(false);

    useEffect(() => {
        if (initialData) {
            reset({
                url: initialData.url,
                name: initialData.name,
                categoryId: initialData.categoryId || 'uncategorized',
                tagIds: initialData.tagIds || []
            });
        } else {
            reset({
                url: '',
                name: '',
                categoryId: 'uncategorized',
                tagIds: []
            });
        }
        setManualPlatform(null);
        setAutoLoad(false);
    }, [initialData, reset, open]);

    // ---- presentational derived values ----
    const det = detectPlatform(url || '');
    const platform: AfPlatform | null = isEdit
        ? ((initialData?.platform === 'twitch' || initialData?.platform === 'youtube') ? initialData.platform : null)
        : (det.platform || manualPlatform);
    const previewName = isEdit ? (editName?.trim() || initialData?.name || '') : det.handle;
    const accent = platformColor(platform);
    // edit 一律可預覽;add 需偵測到 handle 才預覽
    const canPreview = isEdit ? !!previewName : !!det.handle;
    const showPlatformPicker = !isEdit && !!det.handle && !det.platform;
    const platformLabel = platform === 'twitch' ? 'Twitch' : platform === 'youtube' ? 'YouTube' : '';

    const pasteFromClipboard = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) setValue('url', text.trim(), { shouldDirty: true });
        } catch {
            // 剪貼簿不可用時忽略(權限/環境)
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                showCloseButton={false}
                className="sm:max-w-[540px] w-full max-h-[92vh] p-0 gap-0 overflow-hidden rounded-[18px] border-border bg-card text-foreground flex flex-col"
            >
                {/* Header: gradient icon chip + title/subtitle + close */}
                <div className="flex items-center gap-3 px-5 py-[18px] border-b border-border">
                    <div className="size-9 shrink-0 rounded-[10px] flex items-center justify-center bg-gradient-to-br from-primary to-purple-400 text-white shadow-[0_6px_18px_-6px_rgba(168,85,247,0.6)]">
                        {isEdit ? <Pencil className="size-[18px]" /> : <Star className="size-[18px]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <DialogTitle className="text-[17px] font-bold leading-tight">
                            {isEdit ? t('favorites:editFavorite') : t('favorites:addFavorite')}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                            {isEdit ? t('favorites:editFavoriteDesc') : t('favorites:addFavoriteDesc')}
                        </DialogDescription>
                    </div>
                    <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        title={t('common:common.close')}
                        aria-label={t('common:common.close')}
                        className="size-8 shrink-0 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <X className="size-[18px]" />
                    </button>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col min-h-0 flex-1">
                    {/* Body */}
                    <div className="flex flex-col gap-[18px] p-5 overflow-y-auto">
                        {/* URL input + paste — add mode only */}
                        {!isEdit && (
                            <div>
                                <label className={afLabel}>{t('favorites:channelUrlOrName')}</label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <span
                                            className="absolute left-3 top-1/2 -translate-y-1/2 flex transition-colors z-10"
                                            style={{ color: accent || 'var(--muted-foreground)' }}
                                        >
                                            {platform === 'twitch' ? <Twitch className="size-4" />
                                                : platform === 'youtube' ? <Youtube className="size-4" />
                                                    : <Link2 className="size-4" />}
                                        </span>
                                        <Input
                                            {...register('url', { required: !initialData })}
                                            placeholder="twitch.tv/shroud 或 youtube.com/@..."
                                            className={`h-11 pl-[38px] bg-background border-border ${det.handle ? 'border-primary/50' : ''}`}
                                        />
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={pasteFromClipboard}
                                        title={t('favorites:pasteFromClipboard')}
                                        className="h-11 px-3.5 gap-1.5 bg-muted/40 border-border text-foreground hover:bg-accent shrink-0"
                                    >
                                        <Clipboard className="size-[15px]" />
                                        {t('favorites:paste')}
                                    </Button>
                                </div>
                                <p className="text-[11.5px] text-muted-foreground mt-2 leading-relaxed">
                                    {t('favorites:urlHint')}
                                </p>
                            </div>
                        )}

                        {/* Platform picker — add mode, ambiguous input */}
                        {showPlatformPicker && (
                            <div>
                                <label className={afLabel}>{t('favorites:whichPlatform')}</label>
                                <div className="flex gap-2">
                                    {([
                                        { id: 'twitch' as const, label: 'Twitch' },
                                        { id: 'youtube' as const, label: 'YouTube' },
                                    ]).map((p) => {
                                        const active = manualPlatform === p.id;
                                        const c = platformColor(p.id);
                                        return (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => setManualPlatform(p.id)}
                                                aria-pressed={active}
                                                className="flex-1 h-11 rounded-[10px] inline-flex items-center justify-center gap-2 text-sm font-semibold border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                style={active
                                                    ? { background: `${c}1f`, borderColor: c, color: c }
                                                    : { background: 'transparent', borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
                                            >
                                                {p.id === 'twitch' ? <Twitch className="size-4" /> : <Youtube className="size-4" />}
                                                {p.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Honest preview card / empty state */}
                        {canPreview && platform ? (
                            <div
                                className="rounded-[14px] overflow-hidden border"
                                style={{
                                    borderColor: `${accent}40`,
                                    boxShadow: `0 0 0 1px ${accent}14, 0 14px 30px -18px ${accent}80`,
                                }}
                            >
                                <div
                                    className="relative flex items-center justify-center overflow-hidden"
                                    style={{
                                        aspectRatio: '16 / 6',
                                        background: `linear-gradient(135deg, ${accent}33, var(--muted))`,
                                    }}
                                >
                                    <div
                                        className="absolute inset-0 opacity-50"
                                        style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(127,127,127,0.08) 0 10px, transparent 10px 20px)' }}
                                    />
                                    <div className="relative size-12 rounded-full bg-black/35 flex items-center justify-center border border-white/15">
                                        <Play className="size-5 text-white/85" />
                                    </div>
                                    <span className="absolute bottom-2.5 right-2.5 font-mono text-[10px] text-muted-foreground tracking-[0.04em]">
                                        {t('favorites:preview')}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 px-3.5 py-3 bg-muted/30">
                                    <div
                                        className="size-10 rounded-full shrink-0 flex items-center justify-center text-lg font-bold text-white uppercase"
                                        style={{ background: `linear-gradient(135deg, ${accent}, ${accent}99)` }}
                                    >
                                        {previewName.charAt(0) || '?'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[15px] font-bold text-foreground truncate">{previewName}</span>
                                            <span
                                                className="inline-flex items-center gap-1 px-[7px] py-px rounded-full text-[10.5px] font-semibold shrink-0"
                                                style={{ background: `${accent}1f`, color: accent }}
                                            >
                                                {platform === 'twitch' ? <Twitch className="size-[11px]" /> : <Youtube className="size-[11px]" />}
                                                {platformLabel}
                                            </span>
                                        </div>
                                        {/* 誠實資訊:只顯示平台 + handle,不顯示直播狀態/遊戲/人數 */}
                                        <div className="text-[11.5px] text-muted-foreground mt-0.5 truncate">
                                            {platformLabel}{previewName ? ` · @${previewName}` : ''}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-[14px] border border-dashed border-border py-[26px] px-4 text-center text-muted-foreground bg-muted/20">
                                <Monitor className="size-[26px] mx-auto opacity-40" />
                                <div className="text-[12.5px] mt-2">{t('favorites:previewEmpty')}</div>
                            </div>
                        )}

                        {/* Display name — edit mode */}
                        {isEdit && (
                            <div>
                                <label className={afLabel}>{t('favorites:displayName')}</label>
                                <Input
                                    {...register('name')}
                                    placeholder={t('favorites:displayNamePlaceholder')}
                                    className="h-11 bg-background border-border"
                                />
                            </div>
                        )}

                        {/* Category pills */}
                        <div>
                            <div className="flex items-center justify-between mb-2.5">
                                <label className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{t('favorites:category')}</label>
                                <span className="text-[11px] text-muted-foreground">{t('favorites:optional')}</span>
                            </div>
                            <Controller
                                name="categoryId"
                                control={control}
                                render={({ field }) => (
                                    <div className="flex flex-wrap gap-2">
                                        {categories.map((c) => {
                                            const active = field.value === c.id;
                                            return (
                                                <button
                                                    key={c.id}
                                                    type="button"
                                                    onClick={() => field.onChange(active ? 'uncategorized' : c.id)}
                                                    aria-pressed={active}
                                                    className={`inline-flex items-center gap-1.5 px-3 py-[7px] rounded-full text-[13px] font-medium border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                                        active
                                                            ? 'bg-primary/15 border-primary/60 text-primary'
                                                            : 'bg-muted/40 border-border text-muted-foreground hover:bg-accent'
                                                    }`}
                                                >
                                                    <Folder className="size-[13px]" />
                                                    {c.name}
                                                </button>
                                            );
                                        })}
                                        {categories.length === 0 && (
                                            <span className="text-[12.5px] text-muted-foreground">{t('favorites:noCategories')}</span>
                                        )}
                                    </div>
                                )}
                            />
                        </div>

                        {/* Tags */}
                        <div>
                            <div className="flex items-center justify-between mb-2.5">
                                <label className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{t('tags:addTag')}</label>
                                <span className="text-[11px] text-muted-foreground">{t('favorites:multiSelect')}</span>
                            </div>
                            <Controller
                                name="tagIds"
                                control={control}
                                render={({ field }) => (
                                    <div className="flex flex-wrap items-center gap-2">
                                        {allTags.map((tag) => {
                                            const active = field.value.includes(tag.id);
                                            return (
                                                <button
                                                    key={tag.id}
                                                    type="button"
                                                    onClick={() => field.onChange(
                                                        active
                                                            ? field.value.filter((id) => id !== tag.id)
                                                            : [...field.value, tag.id]
                                                    )}
                                                    aria-pressed={active}
                                                    className="inline-flex items-center gap-[7px] px-3 py-[7px] rounded-full text-[13px] font-medium border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                    style={active
                                                        ? { background: `${tag.color}24`, borderColor: tag.color, color: 'var(--foreground)' }
                                                        : { background: 'color-mix(in oklab, var(--muted) 40%, transparent)', borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
                                                >
                                                    <span
                                                        className="size-2 rounded-full"
                                                        style={{ background: tag.color, boxShadow: active ? `0 0 6px ${tag.color}` : 'none' }}
                                                    />
                                                    {tag.name}
                                                    {active && <Check className="size-3" />}
                                                </button>
                                            );
                                        })}
                                        {/* 既有 Popover 選擇器:保留資料流(搜尋/選更多標籤) */}
                                        <TagPopoverSelector
                                            allTags={allTags}
                                            selectedTagIds={field.value}
                                            onChange={field.onChange}
                                            theme={theme}
                                            showSelectedChips={false}
                                        />
                                    </div>
                                )}
                            />
                            {/* 已選標籤可刪 chip 列(沿用既有 TagChip 行為) */}
                            {selectedTagIds.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {allTags.filter((tag) => selectedTagIds.includes(tag.id)).map((tag) => (
                                        <TagChip
                                            key={tag.id}
                                            tag={tag}
                                            onDelete={() => setValue('tagIds', selectedTagIds.filter((id) => id !== tag.id))}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Auto-load toggle — add mode only (純視覺,尚未接 favoritesLoader) */}
                        {!isEdit && (
                            <button
                                type="button"
                                onClick={() => setAutoLoad((v) => !v)}
                                aria-pressed={autoLoad}
                                className={`flex items-center gap-3 w-full text-left px-3.5 py-3 rounded-[12px] border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                    autoLoad ? 'bg-primary/10 border-primary/35' : 'bg-muted/30 border-border'
                                }`}
                            >
                                <span className="flex size-[34px] rounded-[9px] items-center justify-center bg-primary/15 text-primary shrink-0">
                                    <Play className="size-4" />
                                </span>
                                <span className="flex-1">
                                    <span className="block text-[13.5px] font-semibold text-foreground">{t('favorites:autoLoadTitle')}</span>
                                    <span className="block text-[11.5px] text-muted-foreground mt-px">{t('favorites:autoLoadDesc')}</span>
                                </span>
                                <span className={`relative w-10 h-[22px] rounded-full shrink-0 transition-colors ${autoLoad ? 'bg-primary' : 'bg-muted-foreground/35'}`}>
                                    <span className={`absolute top-0.5 size-[18px] rounded-full bg-white shadow transition-all ${autoLoad ? 'left-5' : 'left-0.5'}`} />
                                </span>
                            </button>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between gap-2.5 px-5 py-3.5 border-t border-border bg-muted/30">
                        <div>
                            {isEdit && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => onOpenChange(false)}
                                    className="h-10 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                >
                                    <Trash2 className="size-[15px]" />
                                    {t('common:common.delete')}
                                </Button>
                            )}
                        </div>
                        <div className="flex items-center gap-2.5">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                                className="h-10 border-border hover:bg-accent"
                            >
                                {t('common:common.cancel')}
                            </Button>
                            <Button
                                type="submit"
                                className="h-10 gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
                            >
                                {isEdit
                                    ? <><Check className="size-[15px]" />{t('common:common.save')}</>
                                    : autoLoad
                                        ? <><Play className="size-[15px]" />{t('favorites:addAndLoad')}</>
                                        : <><Plus className="size-[15px]" />{t('favorites:addFavorite')}</>}
                            </Button>
                        </div>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
