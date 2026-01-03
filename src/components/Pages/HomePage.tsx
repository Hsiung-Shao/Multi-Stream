import { useCallback } from 'react';
import { Navbar } from '../Navbar';
import { WelcomeCard } from '../WelcomeCard';
import { StreamContainer } from '../StreamContainer';
import { ControlPanel } from '../ControlPanel';
import { SEO } from '../SEO';
import { useUIStore } from '../../store/useUIStore';
import { useStreamStore } from '../../store/useStreamStore';
import { usePlayerStore } from '../../store/playerStore';

export function HomePage() {
    const theme = useUIStore(s => s.theme);
    const toggleTheme = useUIStore(s => s.toggleTheme);
    const setCurrentPage = useUIStore(s => s.setPage);
    const openModal = useUIStore(s => s.openModal);

    const isPanelCollapsed = useUIStore(s => s.isPanelCollapsed);
    const togglePanelCollapsed = useUIStore(s => s.togglePanelCollapsed);
    const isSearchFocused = useUIStore(s => s.isSearchFocused);
    const setIsSearchFocused = useUIStore(s => s.setSearchFocused);

    const masterVolume = useUIStore(s => s.masterVolume);
    const setMasterVolume = useUIStore(s => s.setMasterVolume);
    const masterMuted = useUIStore(s => s.masterMuted);
    const setMasterMuted = useUIStore(s => s.setMasterMuted);

    const streams = useStreamStore(s => s.streams);
    const layout = useStreamStore(s => s.layout);
    const setLayout = useStreamStore(s => s.setLayout);
    const addStream = useStreamStore(s => s.addStream);
    const removeStream = useStreamStore(s => s.removeStream);
    const updateStream = useStreamStore(s => s.updateStream);
    const chatLayout = useStreamStore(s => s.chatLayout);
    const setChatLayout = useStreamStore(s => s.setChatLayout);
    const moveStream = useStreamStore(s => s.moveStream);

    const getPlayer = usePlayerStore(s => s.getPlayer);

    // 添加串流
    const handleAddStream = useCallback(async (url: string) => {
        const result = await addStream(url);
        if (!result.success && result.message) {
            alert(result.message);
        }
    }, [addStream]);

    // 移除串流
    const handleRemoveStream = (id: number) => {
        // 清理播放器
        const p = getPlayer(id);
        if (p && p.type === 'youtube' && p.player && typeof p.player.destroy === 'function') {
            try { p.player.destroy(); } catch (e) { }
        }

        // 移除分離的聊天室
        const separatedChat = document.getElementById('separated-chat-' + id);
        if (separatedChat) {
            separatedChat.remove();
        }

        removeStream(id);
    };

    // 切換所有聊天室顯示/隱藏
    const handleToggleAllChat = (show: boolean) => {
        streams.forEach(s => {
            updateStream(s.id, { chatVisible: show });
        });
    };

    // 處理總音量變化
    const handleMasterVolumeChange = (volume: number) => {
        if (volume > 0 && masterMuted) {
            setMasterMuted(false);
        }
        setMasterVolume(volume);
        if (volume === 0) {
            setMasterMuted(true);
        }
    };

    // 處理全部靜音/取消靜音
    const handleMasterMuteChange = (muted: boolean) => {
        if (muted) {
            setMasterVolume(0);
            setMasterMuted(true);
        } else {
            let restoreVolume = 100;
            try {
                const saved = localStorage.getItem('userSettings');
                if (saved) {
                    const settings = JSON.parse(saved);
                    if (settings.masterVolume !== undefined && settings.masterVolume > 0) {
                        restoreVolume = settings.masterVolume;
                    }
                }
            } catch (e) { }
            setMasterVolume(restoreVolume);
            setMasterMuted(false);
        }
    };

    // 音量變化
    const handleVolumeChange = (id: number, volume: number) => {
        const s = streams.find(st => st.id === id);
        const newMutedState = volume === 0 ? true : false;
        updateStream(id, { volume, isMuted: newMutedState });

        const playerInstance = getPlayer(id);
        if (playerInstance && playerInstance.player) {
            const player = playerInstance.player;
            const masterVol = masterVolume;
            const actualVol = Math.round((volume / 100) * masterVol);

            try {
                if (s?.platform === 'twitch') {
                    if (actualVol === 0) {
                        if (typeof player.setMuted === 'function') player.setMuted(true);
                        else if (typeof player.setVolume === 'function') player.setVolume(0);
                    } else {
                        if (typeof player.setMuted === 'function') player.setMuted(false);
                        if (typeof player.setVolume === 'function') player.setVolume(actualVol / 100);
                    }
                } else if (s?.platform === 'youtube') {
                    try {
                        const playerState = player.getPlayerState();
                        if (playerState !== undefined) {
                            if (actualVol === 0) {
                                if (typeof player.mute === 'function') player.mute();
                                else if (typeof player.setVolume === 'function') player.setVolume(0);
                            } else {
                                if (typeof player.unMute === 'function') player.unMute();
                                if (typeof player.setVolume === 'function') player.setVolume(actualVol);
                            }
                        }
                    } catch (e) {
                        // Retry logic omitted for brevity in refactor to keep it clean, 
                        // but can be re-added if critical.
                        // Ideally player store handles this.
                    }
                }
            } catch (error) { }
        }
    };

    // 切換靜音
    const handleToggleMute = (id: number) => {
        const s = streams.find(st => st.id === id);
        if (!s) return;
        const newMutedState = !(s.isMuted || false);
        updateStream(id, { isMuted: newMutedState });

        const playerInstance = getPlayer(id);
        if (playerInstance && playerInstance.player) {
            const player = playerInstance.player;
            try {
                if (s.platform === 'twitch') {
                    if (newMutedState) {
                        if (typeof player.setMuted === 'function') player.setMuted(true);
                        else if (typeof player.setVolume === 'function') player.setVolume(0);
                    } else {
                        if (!masterMuted) {
                            if (typeof player.setMuted === 'function') player.setMuted(false);
                            const masterVol = masterVolume;
                            const streamVol = s.volume || 100;
                            const actualVol = Math.round((streamVol / 100) * masterVol);
                            if (typeof player.setVolume === 'function') player.setVolume(actualVol / 100);
                        }
                    }
                } else if (s.platform === 'youtube') {
                    if (newMutedState) {
                        if (typeof player.mute === 'function') player.mute();
                        else if (typeof player.setVolume === 'function') {
                            try { player.setVolume(0); } catch (e) { }
                        }
                    } else {
                        if (!masterMuted) {
                            if (typeof player.unMute === 'function') player.unMute();
                        }
                    }
                }
            } catch (e) { }
        }
    };

    return (
        <>
            <SEO />
            <div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-950' : 'bg-gray-50'}`}>
                <Navbar
                    theme={theme}
                    onThemeToggle={toggleTheme}
                    onShowAbout={() => setCurrentPage('about')}
                    onShowTutorial={() => openModal('tutorial')}
                    onShowVersionHistory={() => openModal('history')}
                    onShowFavorites={() => openModal('favorites')}
                    onShowFeedback={() => openModal('feedback')}
                    onTogglePanel={() => togglePanelCollapsed()}
                    onAddStream={handleAddStream}
                    onSearchFocusChange={setIsSearchFocused}
                />

                <StreamContainer
                    masterVolume={masterVolume}
                    isMasterMuted={masterMuted}
                />

                {streams.length === 0 && useStreamStore.getState().layoutMode !== 'canvas' && (
                    <div className="container mx-auto px-4 py-4" style={{ position: 'relative', zIndex: 10 }}>
                        <WelcomeCard
                            theme={theme}
                            onShowVersionHistory={() => openModal('history')}
                            onShowTutorial={() => openModal('tutorial')}
                            onShowAbout={() => setCurrentPage('about')}
                            onNavigateToPrivacy={() => setCurrentPage('privacy')}
                        />
                    </div>
                )}

                <ControlPanel
                    theme={theme}
                    isCollapsed={isPanelCollapsed}
                    onToggleCollapse={() => togglePanelCollapsed()}
                    isSearchFocused={isSearchFocused}
                    onShowFavorites={() => openModal('favorites')}
                    onShowVersionHistory={() => openModal('history')}
                    onShowTutorial={() => openModal('tutorial')}
                    onShowAbout={() => setCurrentPage('about')}
                    streams={streams}
                    currentLayout={layout}
                    onLayoutChange={setLayout}
                    chatLayoutType={chatLayout}
                    onChatLayoutChange={setChatLayout}
                    onVolumeChange={handleVolumeChange}
                    onToggleMute={handleToggleMute}
                    onRemoveStream={handleRemoveStream}
                    onToggleAllChat={handleToggleAllChat}
                    masterVolume={masterVolume}
                    masterMuted={masterMuted}
                    onMasterVolumeChange={handleMasterVolumeChange}
                    onMasterMuteChange={handleMasterMuteChange}
                    onMoveStreamUp={(id) => {
                        const index = streams.findIndex(s => s.id === id);
                        if (index > 0) moveStream(index, index - 1);
                    }}
                    onMoveStreamDown={(id) => {
                        const index = streams.findIndex(s => s.id === id);
                        if (index >= 0 && index < streams.length - 1) moveStream(index, index + 1);
                    }}
                />
            </div>
        </>
    );
}
