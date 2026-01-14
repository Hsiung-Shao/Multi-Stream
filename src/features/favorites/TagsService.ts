import { TagsRepository } from './TagsRepository';
import { Tag } from './types';
import { backupService } from '../backup/index';
import { favoritesService } from './FavoritesService';

import { DEFAULT_TAG_TWITCH_ID, DEFAULT_TAG_YOUTUBE_ID } from './constants';

export class TagsService {
    private repo: TagsRepository;

    constructor() {
        this.repo = new TagsRepository();
    }

    getAllTags(): Tag[] {
        return this.repo.getList();
    }

    saveTags(list: Tag[]): void {
        this.repo.saveList(list);
        this.emitChangeEvent();
    }

    addTag(name: string, color: string): Tag {
        const newTag: Tag = {
            id: `tag_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            name,
            color,
            order: this.repo.getList().length
        };
        this.repo.add(newTag);
        this.emitChangeEvent();
        return newTag;
    }

    updateTag(id: string, updates: Partial<Tag>): boolean {
        const result = this.repo.update(id, updates);
        if (result) {
            this.emitChangeEvent();
        }
        return result;
    }

    removeTag(id: string): boolean {
        const result = this.repo.remove(id);
        if (result) {
            // Cascade: remove this tag from all favorites
            this.removeTagFromFavorites(id);
            this.emitChangeEvent();
            return true;
        }
        return false;
    }

    /**
     * Initializes default tags and migrates existing favorites if needed.
     * Should be called on app startup.
     */
    initializeDefaults(): void {
        const tags = this.repo.getList();
        let changed = false;

        // 1. Create Default Tags if missing
        let twitchTag = tags.find(t => t.id === DEFAULT_TAG_TWITCH_ID);
        if (!twitchTag) {
            twitchTag = {
                id: DEFAULT_TAG_TWITCH_ID,
                name: 'Twitch',
                color: '#9146FF', // Twitch Purple
                order: 0
            };
            this.repo.add(twitchTag);
            changed = true;
        }

        let youtubeTag = tags.find(t => t.id === DEFAULT_TAG_YOUTUBE_ID);
        if (!youtubeTag) {
            youtubeTag = {
                id: DEFAULT_TAG_YOUTUBE_ID,
                name: 'YouTube',
                color: '#FF0000', // YouTube Red
                order: 1
            };
            this.repo.add(youtubeTag);
            changed = true;
        }

        if (changed) {
            // Log or backup if needed
        }

        // 2. Auto-tag existing favorites (Always run to fix missing tags)
        this.autoTagFavorites();
    }

    /**
     * Scans all favorites. If they are on a platform but lack the default tag, add it.
     */
    private autoTagFavorites(): void {
        const favorites = favoritesService.getFavorites();
        let favoritesChanged = false;

        const updatedFavorites = favorites.map(fav => {
            let tags = fav.tagIds || [];
            let modified = false;

            if (fav.platform === 'twitch' && !tags.includes(DEFAULT_TAG_TWITCH_ID)) {
                tags = [...tags, DEFAULT_TAG_TWITCH_ID];
                modified = true;
            } else if (fav.platform === 'youtube' && !tags.includes(DEFAULT_TAG_YOUTUBE_ID)) {
                tags = [...tags, DEFAULT_TAG_YOUTUBE_ID];
                modified = true;
            }

            if (modified) {
                favoritesChanged = true;
                return { ...fav, tagIds: tags };
            }
            return fav;
        });

        if (favoritesChanged) {
            favoritesService.saveFavorites(updatedFavorites);
            // backupService trigger is handled inside saveFavorites or via this emit
        }
    }

    private removeTagFromFavorites(tagId: string) {
        const favorites = favoritesService.getFavorites();
        let favoritesChanged = false;

        const updatedFavorites = favorites.map(fav => {
            if (fav.tagIds && fav.tagIds.includes(tagId)) {
                favoritesChanged = true;
                return {
                    ...fav,
                    tagIds: fav.tagIds.filter(id => id !== tagId)
                };
            }
            return fav;
        });

        if (favoritesChanged) {
            favoritesService.saveFavorites(updatedFavorites);
        }
    }

    private emitChangeEvent() {
        backupService.scheduleBackup();
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('tagsUpdated'));
        }
    }
}

export const tagsService = new TagsService();
