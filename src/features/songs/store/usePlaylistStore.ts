/**
 * 使用者自訂歌單（只存歌曲片段的 8 碼 code）：zustand persist 到 localStorage['song-playlists']。
 *
 * - 只 persist playlists；歌單內容（歌名、時間）永遠由 code 向伺服端解析，這裡不存。
 * - 資料來自 localStorage，可能被改壞：migrate 與 merge 都會做形狀防呆，壞項目直接丟棄。
 * - 去重保序，單一歌單上限 PLAYLIST_MAX_ITEMS；對不存在的歌單 id 操作一律不動資料。
 * - key 已列入 utils/versionCheck 的 PRESERVED_KEYS（發版不清）與 BackupService 備份。
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Playlist {
    id: string;
    name: string;
    codes: string[];
    createdAt: number;
    updatedAt: number;
}

export const PLAYLIST_MAX_ITEMS = 500;
const DEFAULT_NAME = '未命名歌單';
const NAME_MAX_LENGTH = 100;

interface PlaylistState {
    playlists: Playlist[];
    createPlaylist: (name: string, codes?: string[]) => string;
    renamePlaylist: (id: string, name: string) => void;
    deletePlaylist: (id: string) => void;
    addToPlaylist: (id: string, codes: string[]) => void;
    removeFromPlaylist: (id: string, code: string) => void;
    moveInPlaylist: (id: string, from: number, to: number) => void;
}

const cleanName = (name: string): string => name.trim().slice(0, NAME_MAX_LENGTH) || DEFAULT_NAME;

const uniqueCodes = (codes: string[]): string[] => [...new Set(codes)].slice(0, PLAYLIST_MAX_ITEMS);

/** 讀回的資料只留形狀正確的歌單；非陣列、缺欄位、型別錯誤的項目丟棄 */
function sanitizePlaylists(persisted: unknown): Playlist[] {
    const raw = persisted && typeof persisted === 'object' ? (persisted as { playlists?: unknown }).playlists : undefined;
    if (!Array.isArray(raw)) return [];
    const result: Playlist[] = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue;
        const p = entry as Partial<Record<keyof Playlist, unknown>>;
        if (typeof p.id !== 'string' || !p.id || typeof p.name !== 'string' || !Array.isArray(p.codes)) continue;
        const now = Date.now();
        result.push({
            id: p.id,
            name: cleanName(p.name),
            codes: uniqueCodes(p.codes.filter((c): c is string => typeof c === 'string')),
            createdAt: typeof p.createdAt === 'number' ? p.createdAt : now,
            updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : now,
        });
    }
    return result;
}

export const usePlaylistStore = create<PlaylistState>()(
    persist(
        (set) => {
            /** 只更新指定歌單；找不到 id 時回傳原 state（zustand 不會觸發更新與寫入） */
            const update = (id: string, fn: (p: Playlist) => Playlist | null) =>
                set((state) => {
                    const target = state.playlists.find((p) => p.id === id);
                    if (!target) return state;
                    const next = fn(target);
                    if (!next) return state;
                    return { playlists: state.playlists.map((p) => (p.id === id ? next : p)) };
                });

            return {
                playlists: [],

                createPlaylist: (name, codes = []) => {
                    const id = crypto.randomUUID();
                    const now = Date.now();
                    set((state) => ({
                        playlists: [
                            ...state.playlists,
                            { id, name: cleanName(name), codes: uniqueCodes(codes), createdAt: now, updatedAt: now },
                        ],
                    }));
                    return id;
                },

                renamePlaylist: (id, name) =>
                    update(id, (p) => ({ ...p, name: cleanName(name), updatedAt: Date.now() })),

                deletePlaylist: (id) =>
                    set((state) =>
                        state.playlists.some((p) => p.id === id)
                            ? { playlists: state.playlists.filter((p) => p.id !== id) }
                            : state,
                    ),

                addToPlaylist: (id, codes) =>
                    update(id, (p) => ({ ...p, codes: uniqueCodes([...p.codes, ...codes]), updatedAt: Date.now() })),

                removeFromPlaylist: (id, code) =>
                    update(id, (p) =>
                        p.codes.includes(code)
                            ? { ...p, codes: p.codes.filter((c) => c !== code), updatedAt: Date.now() }
                            : null,
                    ),

                moveInPlaylist: (id, from, to) =>
                    update(id, (p) => {
                        const last = p.codes.length - 1;
                        if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
                        if (from < 0 || from > last || to < 0 || to > last || from === to) return null;
                        const codes = [...p.codes];
                        const [moved] = codes.splice(from, 1);
                        codes.splice(to, 0, moved);
                        return { ...p, codes, updatedAt: Date.now() };
                    }),
            };
        },
        {
            name: 'song-playlists',
            version: 1,
            partialize: (state) => ({ playlists: state.playlists }),
            // v1 是第一版，沒有舊格式要轉換；只做形狀防呆
            migrate: (persisted) => ({ playlists: sanitizePlaylists(persisted) }),
            merge: (persisted, current) => ({ ...current, playlists: sanitizePlaylists(persisted) }),
        },
    ),
);
