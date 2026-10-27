// 歌曲整理（AdminSongsTab 下方一區）：搜尋歌曲、疑似重複清單、單曲明細，以及合併／拆開／改名。
//
// - 對應 functions/api/admin/song-library.js；歌名、原唱、歌回標題、VTuber 名稱一律以純文字節點顯示。
// - 拆開、合併都先跳確認；合併在兩邊原唱不同時要勾選才能確認（伺服器回 artist_mismatch 時也改成要勾選，
//   前端只做粗略比對，正規化規則只在 SQL 那份）。
// - 改名遇到 key_taken（新名稱已屬於別首歌）顯示提示，請改用合併。
// - 對話框的「取消」不 disable；開關兩端都 reset mutation（memory error_dialog_mutation_reset）。

import { useEffect, useState, type FormEvent } from 'react';
import { GitMerge, Pencil, Scissors, Search } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Checkbox } from '../../../components/ui/checkbox';
import { ScrollArea } from '../../../components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import { cn } from '../../../components/ui/utils';
import { ApiError } from '../hooks/useAdminAnnouncements';
import {
    formatLibraryError,
    useMergeSongs,
    useRenameSong,
    useSongDetail,
    useSongDuplicates,
    useSongSearch,
    useSplitSegment,
    type SongBrief,
    type SongVersionRecord,
} from '../hooks/useAdminSongLibrary';

const SCROLL_LIST = '[&>[data-radix-scroll-area-viewport]]:max-h-80 [&>div>div]:!block';

function formatDate(s: string | null): string {
    if (!s) return '日期未填';
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? '日期未填' : d.toLocaleDateString('zh-TW');
}

/** 粗略比對原唱是否不同（只用來決定要不要先顯示勾選框；真正的判斷在 SQL） */
const roughArtist = (a: string | null) => (a ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
const artistsDiffer = (a: string | null, b: string | null) => !!a?.trim() && !!b?.trim() && roughArtist(a) !== roughArtist(b);

const errorCode = (err: unknown) => (err instanceof ApiError ? err.payload?.error : undefined);

/** 歌曲清單的一列（點了開明細） */
function SongButton({ song, active, onPick }: { song: SongBrief; active?: boolean; onPick: (song: SongBrief) => void }) {
    return (
        <button
            type="button"
            onClick={() => onPick(song)}
            aria-current={active ? 'true' : undefined}
            className={cn(
                'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted/60',
                active && 'bg-muted',
            )}
        >
            <span className="min-w-0 flex-1 truncate font-medium">{song.title}</span>
            <span className="max-w-[40%] shrink-0 truncate text-[12px] text-muted-foreground">{song.artist || '未填原唱'}</span>
            <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{song.versions} 個版本</span>
        </button>
    );
}

/** 搜尋框＋結果（主清單與合併目標共用） */
function SongSearch({ label, excludeId, activeId, onPick }: {
    label: string;
    excludeId?: number;
    activeId?: number | null;
    onPick: (song: SongBrief) => void;
}) {
    const [text, setText] = useState('');
    const [query, setQuery] = useState<string | null>(null);
    const search = useSongSearch(query);
    const results = (search.data ?? []).filter((s) => s.id !== excludeId);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        setQuery(text.trim());
    };

    return (
        <div className="space-y-2">
            <form onSubmit={submit} className="flex gap-2" role="search">
                <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="歌名或原唱（空白＝最新建立）" aria-label={label} className="h-8" />
                <Button type="submit" size="sm" variant="outline" className="h-8 shrink-0">
                    <Search className="size-3.5" aria-hidden="true" />搜尋
                </Button>
            </form>
            {search.isFetching && <p className="text-[12px] text-muted-foreground">搜尋中…</p>}
            {search.isError && <p role="alert" className="text-[12px] text-destructive">{formatLibraryError(search.error)}</p>}
            {search.data && !search.isFetching && results.length === 0 && <p className="text-[12px] text-muted-foreground">找不到符合的歌曲</p>}
            {results.length > 0 && (
                <ScrollArea className={cn('rounded-md border border-border', SCROLL_LIST)}>
                    <ul className="p-1">
                        {results.map((s) => (
                            <li key={s.id}><SongButton song={s} active={s.id === activeId} onPick={onPick} /></li>
                        ))}
                    </ul>
                </ScrollArea>
            )}
        </div>
    );
}

function DuplicateList({ activeId, onPick }: { activeId: number | null; onPick: (song: SongBrief) => void }) {
    const dup = useSongDuplicates(true);
    if (dup.isLoading) return <p className="text-[12px] text-muted-foreground">載入中…</p>;
    if (dup.isError) return <p role="alert" className="text-[12px] text-destructive">{formatLibraryError(dup.error)}</p>;
    const groups = dup.data ?? [];
    if (groups.length === 0) return <p className="text-[12px] text-muted-foreground">目前沒有疑似重複的歌</p>;
    return (
        <ScrollArea className={cn('rounded-md border border-border', SCROLL_LIST)}>
            <ul className="divide-y divide-border p-1">
                {groups.map((g) => (
                    <li key={g.title_key} className="py-1">
                        <p className="px-2 text-[11.5px] text-muted-foreground">同名鍵：<span className="font-mono">{g.title_key}</span></p>
                        <ul>
                            {g.songs.map((s) => (
                                <li key={s.id}><SongButton song={s} active={s.id === activeId} onPick={onPick} /></li>
                            ))}
                        </ul>
                    </li>
                ))}
            </ul>
        </ScrollArea>
    );
}

function SongDetailPanel({ id, onNavigate }: { id: number; onNavigate: (id: number) => void }) {
    const detail = useSongDetail(id);
    const split = useSplitSegment();
    const merge = useMergeSongs();
    const rename = useRenameSong();

    const [notice, setNotice] = useState<string | null>(null);
    const [renaming, setRenaming] = useState<{ title: string; artist: string } | null>(null);
    const [picking, setPicking] = useState(false);
    const [mergeTarget, setMergeTarget] = useState<SongBrief | null>(null);
    const [allowMismatch, setAllowMismatch] = useState(false);
    const [splitTarget, setSplitTarget] = useState<SongVersionRecord | null>(null);

    // 換歌時收起編輯狀態
    useEffect(() => {
        setNotice(null);
        setRenaming(null);
        setPicking(false);
        setMergeTarget(null);
        setSplitTarget(null);
    }, [id]);
    // 對話框開／關兩端都 reset，上一輪的錯誤不殘留
    const resetMerge = merge.reset;
    useEffect(() => {
        resetMerge();
        setAllowMismatch(false);
    }, [mergeTarget, resetMerge]);
    const resetSplit = split.reset;
    useEffect(() => {
        resetSplit();
    }, [splitTarget, resetSplit]);

    if (detail.isLoading) return <p className="text-[13px] text-muted-foreground">載入中…</p>;
    if (detail.isError) return <p role="alert" className="text-[13px] text-destructive">{formatLibraryError(detail.error)}</p>;
    if (!detail.data) return null;

    const { song, keys, versions } = detail.data;
    const source: SongBrief = { id: song.id, title: song.title, artist: song.artist, versions: versions.length };
    const needsConfirm = !!mergeTarget && (artistsDiffer(source.artist, mergeTarget.artist) || errorCode(merge.error) === 'artist_mismatch');

    const startRename = () => {
        rename.reset();
        setRenaming({ title: song.title, artist: song.artist ?? '' });
    };
    const submitRename = async (e: FormEvent) => {
        e.preventDefault();
        if (!renaming || !renaming.title.trim()) return;
        try {
            await rename.mutateAsync({ id: song.id, title: renaming.title.trim(), artist: renaming.artist.trim() || null });
            setRenaming(null);
            setNotice('已改名');
        } catch {
            // 錯誤顯示在 rename.error
        }
    };

    const confirmMerge = async () => {
        if (!mergeTarget || (needsConfirm && !allowMismatch)) return;
        const target = mergeTarget;
        try {
            await merge.mutateAsync({ source: song.id, target: target.id, allow_artist_mismatch: needsConfirm && allowMismatch });
            setMergeTarget(null);
            setPicking(false);
            onNavigate(target.id);
        } catch {
            // 錯誤顯示在 merge.error（artist_mismatch 會改成要勾選）
        }
    };

    const confirmSplit = async () => {
        if (!splitTarget) return;
        try {
            const result = await split.mutateAsync({ segment_id: splitTarget.segment_id });
            const created = (result as { song?: SongBrief } | null)?.song;
            setSplitTarget(null);
            setNotice(created ? `已拆成新歌曲（#${created.id}）` : '已拆開');
        } catch {
            // 錯誤顯示在 split.error
        }
    };

    return (
        <div className="space-y-3">
            {renaming ? (
                <form onSubmit={(e) => void submitRename(e)} className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[160px] flex-1 space-y-1">
                        <Label htmlFor="song-lib-title" className="text-[12px]">歌名</Label>
                        <Input id="song-lib-title" aria-label="歌名" value={renaming.title} maxLength={200} onChange={(e) => setRenaming({ ...renaming, title: e.target.value })} className="h-8" />
                    </div>
                    <div className="min-w-[160px] flex-1 space-y-1">
                        <Label htmlFor="song-lib-artist" className="text-[12px]">原唱</Label>
                        <Input id="song-lib-artist" aria-label="原唱" value={renaming.artist} maxLength={200} onChange={(e) => setRenaming({ ...renaming, artist: e.target.value })} className="h-8" />
                    </div>
                    <Button type="submit" size="sm" className="h-8" disabled={!renaming.title.trim() || rename.isPending}>
                        {rename.isPending ? '儲存中…' : '儲存'}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setRenaming(null)}>取消</Button>
                    {rename.error && <p role="alert" className="basis-full text-[12px] text-destructive">{formatLibraryError(rename.error)}</p>}
                </form>
            ) : (
                <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                        <h4 className="break-words text-[15px] font-semibold">{song.title}</h4>
                        <p className="text-[12px] text-muted-foreground">原唱：{song.artist || '未填'}・{versions.length} 個版本・#{song.id}</p>
                    </div>
                    <Button size="sm" variant="outline" className="h-8" onClick={startRename}>
                        <Pencil className="size-3.5" aria-hidden="true" />改名
                    </Button>
                    <Button size="sm" variant="outline" className="h-8" onClick={() => setPicking((v) => !v)} aria-expanded={picking}>
                        <GitMerge className="size-3.5" aria-hidden="true" />合併到…
                    </Button>
                </div>
            )}
            {notice && <p role="status" className="text-[12px] text-emerald-500">{notice}</p>}
            {keys.length > 0 && (
                <p className="text-[11.5px] text-muted-foreground">
                    比對鍵：{keys.map((k) => `${k.title_key}｜${k.artist_key || '（無原唱）'}`).join('、')}
                </p>
            )}

            {picking && (
                <div className="space-y-1.5 rounded-md border border-dashed border-border p-2">
                    <p className="text-[12px] text-muted-foreground">選擇要併入的目標歌曲（名稱保留目標的）：</p>
                    <SongSearch label="搜尋合併目標" excludeId={song.id} onPick={setMergeTarget} />
                </div>
            )}

            <ScrollArea className={cn('rounded-md border border-border', SCROLL_LIST)}>
                <ul className="divide-y divide-border">
                    {versions.map((v) => (
                        <li key={v.segment_id} className="flex items-start gap-2 px-2 py-1.5 text-[13px]">
                            <div className="min-w-0 flex-1">
                                <p className="truncate">
                                    <span className="font-medium">{v.vtuber?.name ?? '未標示 VTuber'}</span>
                                    <span className="text-muted-foreground">・{v.video.title}</span>
                                </p>
                                <p className="text-[12px] text-muted-foreground">
                                    <span>{formatDate(v.video.streamed_at)}</span>
                                    {v.video.status !== 'published' && <span>・草稿</span>}
                                    <span className="font-mono">・{v.code}</span>
                                    {(v.title !== song.title || (v.original_artist ?? '') !== (song.artist ?? '')) && (
                                        <span>・寫作「{v.title}{v.original_artist ? ` / ${v.original_artist}` : ''}」</span>
                                    )}
                                </p>
                                {v.version_note && <p className="text-[12px] text-sky-600 dark:text-sky-400">備註：{v.version_note}</p>}
                            </div>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 shrink-0"
                                disabled={versions.length <= 1}
                                title={versions.length <= 1 ? '只剩一個版本' : '把這個版本拆成獨立的新歌曲'}
                                aria-label={`拆開「${v.video.title}」的版本`}
                                onClick={() => setSplitTarget(v)}
                            >
                                <Scissors className="size-3.5" aria-hidden="true" />拆開
                            </Button>
                        </li>
                    ))}
                </ul>
            </ScrollArea>

            <AlertDialog open={!!splitTarget} onOpenChange={(o) => { if (!o) setSplitTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>拆開這個版本？</AlertDialogTitle>
                        <AlertDialogDescription>
                            「{splitTarget?.vtuber?.name ?? '未標示 VTuber'}・{splitTarget?.video.title}」的這段會變成一首獨立的新歌曲，之後同樣寫法的新片段仍會配到原本這首。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {split.error && <p role="alert" className="text-[13px] text-destructive">{formatLibraryError(split.error)}</p>}
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction disabled={split.isPending} onClick={(e) => { e.preventDefault(); void confirmSplit(); }}>
                            {split.isPending ? '拆開中…' : '確定拆開'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={!!mergeTarget} onOpenChange={(o) => { if (!o) setMergeTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>合併這兩首歌？</AlertDialogTitle>
                        <AlertDialogDescription>
                            來源的所有版本與比對鍵會搬到目標，來源這首會被刪除（舊的單曲網址會失效）。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {mergeTarget && (
                        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
                            <dt className="text-muted-foreground">來源</dt>
                            <dd className="break-words">{source.title}／{source.artist || '未填原唱'}（{source.versions} 個版本）</dd>
                            <dt className="text-muted-foreground">目標</dt>
                            <dd className="break-words">{mergeTarget.title}／{mergeTarget.artist || '未填原唱'}（{mergeTarget.versions} 個版本）</dd>
                        </dl>
                    )}
                    {needsConfirm && (
                        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[13px]">
                            <Checkbox id="song-lib-allow-mismatch" checked={allowMismatch} onCheckedChange={(v: boolean | 'indeterminate') => setAllowMismatch(v === true)} className="mt-0.5" />
                            <Label htmlFor="song-lib-allow-mismatch" className="font-normal leading-snug">我確認原唱不同仍要合併</Label>
                        </div>
                    )}
                    {merge.error && errorCode(merge.error) !== 'artist_mismatch' && (
                        <p role="alert" className="text-[13px] text-destructive">{formatLibraryError(merge.error)}</p>
                    )}
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={merge.isPending || (needsConfirm && !allowMismatch)}
                            onClick={(e) => { e.preventDefault(); void confirmMerge(); }}
                        >
                            {merge.isPending ? '合併中…' : '確定合併'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

export function AdminSongLibrary() {
    const [tab, setTab] = useState<'search' | 'duplicates'>('search');
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const pick = (song: SongBrief) => setSelectedId(song.id);

    return (
        <section aria-labelledby="song-library-h" className="space-y-3 rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-baseline gap-2">
                <h3 id="song-library-h" className="text-[13px] font-semibold">歌曲整理</h3>
                <p className="text-[12px] text-muted-foreground">同一首歌寫法不同被分成兩首時合併；配錯的版本拆開。</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <Tabs value={tab} onValueChange={(v: string) => setTab(v === 'duplicates' ? 'duplicates' : 'search')}>
                    <TabsList className="h-8">
                        <TabsTrigger value="search" className="px-2.5 text-[12.5px]">搜尋</TabsTrigger>
                        <TabsTrigger value="duplicates" className="px-2.5 text-[12.5px]">疑似重複</TabsTrigger>
                    </TabsList>
                    <TabsContent value="search">
                        <SongSearch label="搜尋歌曲" activeId={selectedId} onPick={pick} />
                    </TabsContent>
                    <TabsContent value="duplicates">
                        <DuplicateList activeId={selectedId} onPick={pick} />
                    </TabsContent>
                </Tabs>
                <div className="min-w-0">
                    {selectedId === null ? (
                        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-[13px] text-muted-foreground">從左邊選一首歌查看所有版本</p>
                    ) : (
                        <SongDetailPanel id={selectedId} onNavigate={setSelectedId} />
                    )}
                </div>
            </div>
        </section>
    );
}
