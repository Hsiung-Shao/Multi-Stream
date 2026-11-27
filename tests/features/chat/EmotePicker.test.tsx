// E7：貼圖選單（搜尋、分頁、點選）
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmotePicker } from '../../../src/features/chat/EmotePicker';

const twitch = {
    Kappa: 'https://t/kappa.png',
    KappaPride: 'https://t/pride.png',
    LUL: 'https://t/lul.png',
    ForeverKap: 'https://t/fk.png',
};
const groups = { '7tv': { catJAM: 'https://s/catjam.webp' }, bttv: { monkaS: 'https://b/monka.png' }, ffz: { ZrehplaR: 'https://f/z.png' } };

function open(props: Partial<React.ComponentProps<typeof EmotePicker>> = {}) {
    const onPick = vi.fn();
    render(<EmotePicker twitch={twitch} groups={groups} onPick={onPick} {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /emote|貼圖|chat\.emote_picker/i }));
    return onPick;
}
// Radix Tabs 在 mousedown 切換，click 一併送出以相容一般實作
const goTab = (name: string) => {
    const t = screen.getByRole('tab', { name });
    fireEvent.mouseDown(t);
    fireEvent.click(t);
};

describe('E7 貼圖選單', () => {
    it('預設在 Twitch 分頁：看得到 Twitch 貼圖、看不到 7TV 貼圖', () => {
        open();
        expect(screen.getByRole('button', { name: 'Kappa' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'catJAM' })).toBeNull();
        expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Twitch', '7TV', 'BTTV', 'FFZ']);
    });

    it('搜尋「kap」：Twitch 分頁只剩名稱含 kap 的貼圖，點 Kappa 回呼 onPick("Kappa")', () => {
        const onPick = open();
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'kap' } });
        expect(screen.queryByRole('button', { name: 'LUL' })).toBeNull();
        for (const n of ['Kappa', 'KappaPride', 'ForeverKap']) expect(screen.getByRole('button', { name: n })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Kappa' }));
        expect(onPick).toHaveBeenCalledWith('Kappa');
    });

    it('切到 7TV 分頁：看得到 7TV 貼圖、看不到 Twitch 貼圖，點選回呼對應名稱', () => {
        const onPick = open();
        goTab('7TV');
        expect(screen.getByRole('button', { name: 'catJAM' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'LUL' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'catJAM' }));
        expect(onPick).toHaveBeenCalledWith('catJAM');
    });

    it('needsReauth 為 true 時顯示重新登入提示，為 false 時不顯示', () => {
        const re = /chat\.emote_reauth|重新登入|re-?login|sign in again|reauth/i;
        open({ needsReauth: true });
        expect(screen.getByText(re)).toBeInTheDocument();
    });

    it('needsReauth 沒給時不顯示重新登入提示', () => {
        open();
        expect(screen.queryByText(/chat\.emote_reauth|重新登入|re-?login|sign in again|reauth/i)).toBeNull();
    });
});
