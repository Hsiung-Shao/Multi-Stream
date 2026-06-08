import { Search, Plus, Loader2, X } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Input } from '../ui/input';
import { useTranslation } from 'react-i18next';
import { cn } from '../ui/utils';
import { ScrollArea } from '../ui/scroll-area';

import { useStreamStore } from '../../store/useStreamStore';
import { useUIStore } from '../../store/useUIStore';
import { twitchService } from '../../features/twitch/TwitchService';

// Search 模組主題色(對齊設計 FN.search = blue)
const SEARCH_ACCENT = '#5b9bff';

interface SearchResult {
    id: string;
    login: string;
    displayName: string;
    title?: string;
    isLive: boolean;
    thumbnailUrl?: string;
    gameName?: string;
    viewerCount?: number;
    url: string;
}

interface IslandSearchProps {
    onSearch?: (query: string) => void;
    // 注意:2026-05-17 改為永遠展開(user 偏好不折疊),collapsed prop 仍接但不再控制顯隱
    collapsed?: boolean;
}

export function IslandSearch({ onSearch }: IslandSearchProps) {
    const { t } = useTranslation('common');
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [showResults, setShowResults] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);

    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const { isSearchFocused, setSearchFocused } = useUIStore();
    const addStream = useStreamStore(s => s.addStream);

    // 從別處觸發 focus(例如 hotkey)時把 input 拉到 focus
    useEffect(() => {
        if (isSearchFocused) {
            inputRef.current?.focus();
            setSearchFocused(false); // Reset trigger
        }
    }, [isSearchFocused, setSearchFocused]);

    const isUrl = (text: string): boolean => {
        const trimmed = text.trim();
        return trimmed.includes('http://') ||
            trimmed.includes('https://') ||
            trimmed.includes('twitch.tv/') ||
            trimmed.includes('youtube.com') ||
            trimmed.includes('youtu.be/');
    };

    const searchTwitchChannels = useCallback(async (q: string) => {
        if (!q || q.trim().length === 0 || isUrl(q)) {
            setSearchResults([]);
            setShowResults(false);
            return;
        }
        setIsSearching(true);
        try {
            const results = await twitchService.searchChannels(q, 5);
            setSearchResults(results || []);
            setShowResults(true);
            setSelectedIndex(-1);
        } catch (error) {
            setSearchResults([]);
            setShowResults(false);
        } finally {
            setIsSearching(false);
        }
    }, []);

    useEffect(() => {
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        const trimmed = query.trim();
        if (trimmed.length === 0 || isUrl(trimmed)) {
            setSearchResults([]);
            setShowResults(false);
            return;
        }
        searchTimeoutRef.current = setTimeout(() => {
            searchTwitchChannels(trimmed);
        }, 500);
        return () => {
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        };
    }, [query, searchTwitchChannels]);

    // Click outside → close results popup(input 保留)
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setShowResults(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelectResult = (result: SearchResult) => {
        addStream(result.url);
        setQuery('');
        setShowResults(false);
        if (onSearch) onSearch(result.login);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const valueToAdd = query.trim();
        if (!valueToAdd) return;

        let targetUrl = valueToAdd;
        if (showResults && selectedIndex >= 0 && searchResults[selectedIndex]) {
            targetUrl = searchResults[selectedIndex].url;
        }

        const result = await addStream(targetUrl);
        if (result.success) {
            setQuery('');
            setShowResults(false);
        } else {
            alert(result.message || t('common.error'));
        }
        if (onSearch) onSearch(valueToAdd);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (showResults && searchResults.length > 0) {
                setSelectedIndex(prev => (prev < searchResults.length - 1 ? prev + 1 : prev));
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (showResults && searchResults.length > 0) {
                setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
            }
        } else if (e.key === 'Escape') {
            setShowResults(false);
        }
    };

    const handleClear = () => {
        setQuery('');
        setSearchResults([]);
        setShowResults(false);
        inputRef.current?.focus();
    };

    return (
        <div
            ref={containerRef}
            className="flex items-center w-64 relative"
        >
            {/* Results popup */}
            {showResults && searchResults.length > 0 && (
                <div
                    className="absolute bottom-full left-0 w-64 mb-3 rounded-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2"
                    style={{
                        background: 'rgba(10,10,14,0.94)',
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                        border: `1px solid ${SEARCH_ACCENT}33`,
                        boxShadow: `0 20px 40px -12px rgba(0,0,0,0.7), 0 0 0 1px ${SEARCH_ACCENT}14`,
                    }}
                >
                    <ScrollArea className="h-60 p-1">
                        {searchResults.map((result, index) => (
                            <div
                                key={result.id}
                                className={cn(
                                    "flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors",
                                    selectedIndex === index ? "bg-white/20" : "hover:bg-white/10"
                                )}
                                onMouseDown={() => handleSelectResult(result)}
                                onMouseEnter={() => setSelectedIndex(index)}
                            >
                                {result.thumbnailUrl ? (
                                    <img src={result.thumbnailUrl} alt={result.displayName} className="w-8 h-8 rounded-full object-cover" />
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                                        <span className="text-xs font-bold text-white">{result.displayName.charAt(0)}</span>
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-white truncate">{result.displayName}</div>
                                    <div className="text-xs text-white/60 flex items-center gap-1">
                                        {result.isLive && <span className="w-2 h-2 rounded-full bg-green-500 block" />}
                                        <span className="truncate">{result.gameName || 'Twitch'}</span>
                                    </div>
                                </div>
                                <Plus size={14} className="text-white/40" />
                            </div>
                        ))}
                    </ScrollArea>
                </div>
            )}

            <form onSubmit={handleSubmit} className="flex items-center w-full relative">
                {/* Search icon prefix(純圖示,非按鈕) */}
                <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10"
                    style={{ color: SEARCH_ACCENT }}
                />

                <Input
                    ref={inputRef}
                    type="text"
                    placeholder={t('common.search_placeholder') || 'Search...'}
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setSelectedIndex(-1);
                    }}
                    onKeyDown={handleKeyDown}
                    className="h-8 pl-9 pr-9 bg-white/5 border border-white/10 text-white placeholder:text-white/50 focus-visible:ring-1 focus-visible:ring-offset-0 rounded-full"
                    style={{ ['--tw-ring-color' as any]: `${SEARCH_ACCENT}55` }}
                />

                {/* Right side:loading spinner OR clear button */}
                {isSearching ? (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <Loader2 className="animate-spin text-white/50" size={14} />
                    </div>
                ) : query.length > 0 ? (
                    <button
                        type="button"
                        onClick={handleClear}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                        title="清除"
                    >
                        <X size={12} />
                    </button>
                ) : null}
            </form>
        </div>
    );
}
