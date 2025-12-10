import { useState } from 'react';
import { Navbar } from './components/Navbar';
import { WelcomeCard } from './components/WelcomeCard';
import { VersionHistory } from './components/VersionHistory';
import { Tutorial } from './components/Tutorial';
import { ControlPanel } from './components/ControlPanel';
import { FavoritesManager } from './components/FavoritesManager';
import { AboutPage } from './components/AboutPage';
import { PrivacyPage } from './components/PrivacyPage';

type Page = 'home' | 'about' | 'privacy';

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  // Show Privacy Page
  if (currentPage === 'privacy') {
    return (
      <PrivacyPage 
        theme={theme} 
        onThemeToggle={toggleTheme}
        onBack={() => setCurrentPage('home')}
        onNavigateToAbout={() => setCurrentPage('about')}
      />
    );
  }

  // Show About Page
  if (currentPage === 'about') {
    return (
      <AboutPage 
        theme={theme} 
        onThemeToggle={toggleTheme}
        onBack={() => setCurrentPage('home')}
        onNavigateToPrivacy={() => setCurrentPage('privacy')}
      />
    );
  }

  // Show Home Page
  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-950' : 'bg-gray-50'}`}>
      <Navbar theme={theme} onThemeToggle={toggleTheme} onShowAbout={() => setCurrentPage('about')} />
      
      <div className={`container mx-auto px-4 py-12 ${isPanelCollapsed ? '' : 'pr-[516px]'} transition-all duration-300`}>
        <WelcomeCard 
          theme={theme}
          onShowVersionHistory={() => setShowVersionHistory(true)}
          onShowTutorial={() => setShowTutorial(true)}
          onShowAbout={() => setCurrentPage('about')}
        />
      </div>

      <ControlPanel
        theme={theme}
        isCollapsed={isPanelCollapsed}
        onToggleCollapse={() => setIsPanelCollapsed(!isPanelCollapsed)}
        onShowFavorites={() => setShowFavorites(true)}
        onShowVersionHistory={() => setShowVersionHistory(true)}
        onShowTutorial={() => setShowTutorial(true)}
        onShowAbout={() => setCurrentPage('about')}
      />

      {showVersionHistory && (
        <VersionHistory 
          theme={theme} 
          onClose={() => setShowVersionHistory(false)} 
        />
      )}

      {showTutorial && (
        <Tutorial 
          theme={theme} 
          onClose={() => setShowTutorial(false)} 
        />
      )}

      {showFavorites && (
        <FavoritesManager 
          theme={theme} 
          onClose={() => setShowFavorites(false)} 
        />
      )}
    </div>
  );
}