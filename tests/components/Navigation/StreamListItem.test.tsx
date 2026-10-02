// 媒體面板個別音量：拉到 0 時要顯示 0%（原本 `|| 100` 把 0 當成沒設定，顯示 100%）
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StreamListItem } from '../../../src/components/Navigation/StreamListItem';

const noop = () => {};
const t = ((key: string) => key) as any;

function renderItem(volume: number | undefined, masterMuted = false) {
    const stream = {
        id: 1, platform: 'twitch', channelId: 'shroud', videoId: '', originalUrl: '',
        volume, chatVisible: false, displayName: 'Shroud',
    } as any;
    return render(
        <StreamListItem
            stream={stream} index={0} masterMuted={masterMuted} totalStreams={1}
            onToggleMute={noop} onVolumeChange={noop} onMoveUp={noop} onMoveDown={noop}
            onRefresh={noop} onRemove={noop} t={t}
        />
    );
}

describe('StreamListItem 音量顯示', () => {
    it('音量 0 → 顯示 0%', () => {
        renderItem(0);
        expect(screen.getByText('0%')).toBeTruthy();
        expect(screen.queryByText('100%')).toBeNull();
    });

    it('總靜音時括號內也顯示真實的 0%', () => {
        renderItem(0, true);
        expect(screen.getByText('0% (0%)')).toBeTruthy();
    });

    it('沒設定音量 → 預設 100%', () => {
        renderItem(undefined);
        expect(screen.getByText('100%')).toBeTruthy();
    });
});
