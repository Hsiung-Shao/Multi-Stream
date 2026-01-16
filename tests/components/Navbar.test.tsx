import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Navbar } from '../../src/components/Navbar';
import { TooltipProvider } from '../../src/components/ui/tooltip';

// Mock dependencies
const mockChangeLanguage = vi.fn();
const mockSearchChannels = vi.fn();
const mockAddFavorite = vi.fn();

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: {
            language: 'en',
            changeLanguage: mockChangeLanguage,
        },
    }),
}));

vi.mock('../../src/store/useUIStore', () => ({
    useUIStore: (selector: any) => selector({
        setPage: vi.fn(),
    }),
}));

vi.mock('../../src/features/twitch/TwitchService', () => ({
    twitchService: {
        searchChannels: mockSearchChannels,
    },
}));

vi.mock('../../src/features/favorites/FavoritesService', () => ({
    favoritesService: {
        addFavorite: mockAddFavorite,
    },
}));

vi.mock('../../src/utils/analytics', () => ({
    logEvent: vi.fn(),
}));

// Mock Lucide icons
vi.mock('lucide-react', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as any),
        Languages: () => <div data-testid="icon-languages" />,
        Search: () => <div data-testid="icon-search" />,
    };
});

const defaultProps = {
    theme: 'light' as const,
    onThemeToggle: vi.fn(),
    onShowAbout: vi.fn(),
    onShowTutorial: vi.fn(),
    onShowFavorites: vi.fn(),
    onShowFeedback: vi.fn(),
    onAddStream: vi.fn(),
};

describe('Navbar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders successfully', () => {
        render(
            <TooltipProvider>
                <Navbar {...defaultProps} />
            </TooltipProvider>
        );

        expect(screen.getByPlaceholderText('navbar:searchPlaceholder')).toBeDefined();
        expect(screen.getByText('common:appName')).toBeDefined();
    });

    it('handles search submission', async () => {
        render(
            <TooltipProvider>
                <Navbar {...defaultProps} />
            </TooltipProvider>
        );

        const input = screen.getByPlaceholderText('navbar:searchPlaceholder');
        fireEvent.change(input, { target: { value: 'shroud' } });
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

        await waitFor(() => {
            expect(mockSearchChannels).toHaveBeenCalledWith('shroud');
        });
    });

    it('handles language switching', () => {
        render(
            <TooltipProvider>
                <Navbar {...defaultProps} />
            </TooltipProvider>
        );

        const langIcon = screen.getByTestId('icon-languages');
        const langButton = langIcon.closest('button');

        expect(langButton).toBeDefined();
        if (langButton) {
            fireEvent.click(langButton);
            expect(mockChangeLanguage).toHaveBeenCalled();
        }
    });
});
