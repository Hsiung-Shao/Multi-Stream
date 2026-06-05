import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Navbar } from '../Navbar';

import { SEO } from '../SEO';
import { useUIStore } from '../../store/useUIStore';
import { useEffectiveTheme } from '../../hooks/useEffectiveTheme';
import { useStreamStore } from '../../store/useStreamStore';

export function HomePage() {
    const { t } = useTranslation();
    const theme = useEffectiveTheme();
    const toggleTheme = useUIStore(s => s.toggleTheme);
    const setCurrentPage = useUIStore(s => s.setPage);
    const openModal = useUIStore(s => s.openModal);
    const setIsSearchFocused = useUIStore(s => s.setSearchFocused);

    const addStream = useStreamStore(s => s.addStream);

    // 添加串流
    const handleAddStream = useCallback(async (url: string) => {
        const result = await addStream(url);
        if (!result.success && result.message) {
            alert(result.message);
        }
    }, [addStream]);

    return (
        <>
            <SEO
                title={t('seo:tools.title')}
                description={t('seo:tools.description')}
                keywords={t('seo:tools.keywords')}
                pathWithoutLang="/tools"
            />
            <div className="min-h-screen bg-background">
                <Navbar
                    theme={theme}
                    onThemeToggle={toggleTheme}
                    onShowAbout={() => setCurrentPage('about')}
                    onShowTutorial={() => setCurrentPage('instructions')}
                    onShowFavorites={() => openModal('favorites')}
                    onShowFeedback={() => openModal('feedback')}
                    onAddStream={handleAddStream}
                    onSearchFocusChange={setIsSearchFocused}
                />
                {/* StreamContainer Removed */}



                {/* Control Panel Removed */}
            </div>
        </>
    );
}
