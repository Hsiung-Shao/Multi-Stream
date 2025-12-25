import { PlayerAdapterContract, StreamPlatform } from './types';
import { TwitchPlayerAdapter } from './adapters/TwitchPlayerAdapter';
import { YouTubePlayerAdapter } from './adapters/YouTubePlayerAdapter';

type PlayerFactory = (id: number, platform: StreamPlatform, identifier: string) => any;

/**
 * PlayerRegistry
 * 管理所有 Player 實體，避免重複建立，並提供統一的 destroy 介面
 */
export class PlayerRegistry {
    private players: Map<number, PlayerAdapterContract> = new Map();
    private factory: PlayerFactory | null = null;

    /**
     * 註冊一個外部的 Factory，用於實際產生播放器實體
     * PR B 階段我們通常注入一個 Mock Factory
     */
    setFactory(factory: PlayerFactory) {
        this.factory = factory;
    }

    /**
     * 檢查是否已存在
     */
    has(id: number): boolean {
        return this.players.has(id);
    }

    /**
     * 建立並註冊播放器
     */
    create(id: number, platform: StreamPlatform, identifier: string): PlayerAdapterContract | null {
        if (this.players.has(id)) {
            console.warn(`Player ${id} already exists`);
            return this.players.get(id)!;
        }

        if (!this.factory) {
            console.warn('PlayerRegistry factory not set');
            return null;
        }

        try {
            const rawPlayer = this.factory(id, platform, identifier);
            let adapter: PlayerAdapterContract;

            if (platform === 'twitch') {
                adapter = new TwitchPlayerAdapter(rawPlayer);
            } else {
                adapter = new YouTubePlayerAdapter(rawPlayer);
            }

            this.players.set(id, adapter);
            return adapter;
        } catch (e) {
            console.error(`Failed to create player ${id}`, e);
            return null;
        }
    }

    /**
     * 移除並銷毀播放器
     */
    destroy(id: number): void {
        const adapter = this.players.get(id);
        if (adapter) {
            adapter.destroy();
            this.players.delete(id);
        }
    }

    /**
     * 清除所有
     */
    clear(): void {
        this.players.forEach(adapter => adapter.destroy());
        this.players.clear();
    }

    get(id: number): PlayerAdapterContract | undefined {
        return this.players.get(id);
    }

    getAllIds(): number[] {
        return Array.from(this.players.keys());
    }
}
