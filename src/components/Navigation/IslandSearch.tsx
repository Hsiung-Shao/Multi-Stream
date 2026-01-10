import { Search, X, Plus, Loader2 } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useTranslation } from 'react-i18next';
import { cn } from '../ui/utils';
import { ScrollArea } from '../ui/scroll-area';

import { useStreamStore } from '../../store/useStreamStore';
import { useUIStore } from '../../store/useUIStore';
import { twitchService } from '../../features/twitch/TwitchService';
// ... existing imports

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
    collapsed?: boolean;
}

export function IslandSearch({ onSearch, collapsed }: IslandSearchProps) {
    const { t } = useTranslation('common');
    const [expanded, setExpanded] = useState(false);
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

    // Sync store focus state with local state
    useEffect(() => {
        if (isSearchFocused) {
            setExpanded(true);
            setSearchFocused(false); // Reset trigger
        }
    }, [isSearchFocused, setSearchFocused]);

    // --- Logic from Navbar ---
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

        // Debounce 500ms
        searchTimeoutRef.current = setTimeout(() => {
            searchTwitchChannels(trimmed);
        }, 500);

        return () => {
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        };
    }, [query, searchTwitchChannels]);

    // Handle Click Outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setShowResults(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // --- UI Handlers ---

    useEffect(() => {
        if (expanded && inputRef.current) {
            inputRef.current.focus();
        }
    }, [expanded]);

    // Reset expanded state when island collapses
    useEffect(() => {
        if (collapsed && expanded) {
            setExpanded(false);
            setShowResults(false);
        }
    }, [collapsed, expanded]);

    const handleToggle = () => {
        setExpanded(!expanded);
        if (!expanded) {
            setQuery('');
            setSearchResults([]);
        }
    };

    const handleSelectResult = (result: SearchResult) => {
        addStream(result.url); // Add Stream
        setQuery('');
        setExpanded(false);
        setShowResults(false);
        if (onSearch) onSearch(result.login);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const valueToAdd = query.trim();
        if (!valueToAdd) return;

        let targetUrl = valueToAdd;

        // If selection active
        if (showResults && selectedIndex >= 0 && searchResults[selectedIndex]) {
            targetUrl = searchResults[selectedIndex].url;
        }

        // Use store action to add stream
        // The store handles validation for URL or Twitch channel name
        const result = await addStream(targetUrl);

        if (result.success) {
            setQuery('');
            setExpanded(false);
            setShowResults(false); // Close on success
        } else {
            // TODO: Show error toast?
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

    return (
        <div ref={containerRef} className={cn("flex items-center transition-all duration-300 ease-in-out relative", expanded ? "w-64" : "w-auto")}>

            {/* Results Popup (Above) */}
            {showResults && searchResults.length > 0 && expanded && (
                <div className="absolute bottom-full left-0 w-64 mb-2 rounded-lg border border-white/10 bg-black/90 backdrop-blur-md shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2">
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
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn("rounded-full hover:bg-white/10 text-white z-10", expanded && "bg-white/10")}
                    onClick={handleToggle}
                    title={t('common.search') || "搜尋"}
                >
                    {expanded ? <X size={20} /> : <Search size={20} />}
                </Button>

                <div className={cn(
                    "absolute left-0 pl-10 pr-8 transition-all duration-300 overflow-hidden",
                    expanded ? "w-full opacity-100" : "w-0 opacity-0 pointer-events-none"
                )}>
                    <Input
                        ref={inputRef}
                        type="text"
                        placeholder={t('common.search_placeholder') || "Search..."}
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setSelectedIndex(-1);
                        }}
                        onKeyDown={handleKeyDown}
                        className="h-8 bg-transparent border-none text-white placeholder:text-white/50 focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                </div>

                {isSearching && expanded && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        <Loader2 className="animate-spin text-white/50" size={14} />
                    </div>
                )}
            </form>
        </div>
    );
}
