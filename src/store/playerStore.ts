import { create } from 'zustand';

interface PlayerState {
    // Store player instances (Twitch Player or YouTube Player object)
    // We use string | number to support both legacy numeric IDs and future UUIDs
    players: Record<string | number, any>;

    registerPlayer: (id: string | number, player: any) => void;
    unregisterPlayer: (id: string | number) => void;
    getPlayer: (id: string | number) => any | undefined;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
    players: {},

    registerPlayer: (id, player) =>
        set((state) => ({
            players: { ...state.players, [id]: player },
        })),

    unregisterPlayer: (id) =>
        set((state) => {
            const newPlayers = { ...state.players };
            delete newPlayers[id];
            return { players: newPlayers };
        }),

    getPlayer: (id) => get().players[id],
}));
