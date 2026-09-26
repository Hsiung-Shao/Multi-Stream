/**
 * 搜尋結果清單：動態島搜尋框與首頁／空畫布的大搜尋框共用（見 useStreamSearch）。
 * 用 onMouseDown 選取：比 click 早觸發，input 失焦收起清單之前就已經選到。
 */
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '../ui/utils';
import { formatSubscribers, type StreamSearchResult } from './useStreamSearch';

interface SearchResultsListProps {
    results: StreamSearchResult[];
    selectedIndex: number;
    onSelect: (result: StreamSearchResult) => void;
    onHover: (index: number) => void;
    /** 清單高度（Tailwind class），預設 h-60 */
    heightClass?: string;
}

export function SearchResultsList({ results, selectedIndex, onSelect, onHover, heightClass = 'h-60' }: SearchResultsListProps) {
    const { t } = useTranslation(['common', 'navbar']);
    return (
        <ScrollArea className={cn(heightClass, 'p-1')}>
            {results.map((result, index) => (
                <div
                    key={result.id}
                    className={cn(
                        'flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors',
                        selectedIndex === index ? 'bg-white/20' : 'hover:bg-white/10',
                    )}
                    onMouseDown={() => onSelect(result)}
                    onMouseEnter={() => onHover(index)}
                >
                    {result.thumbnailUrl ? (
                        <img src={result.thumbnailUrl} alt={result.displayName} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                            <span className="text-xs font-bold text-white">{result.displayName.charAt(0)}</span>
                        </div>
                    )}
                    <div className="flex-1 min-w-0 text-left">
                        <div className="text-sm font-medium text-white truncate">{result.displayName}</div>
                        {result.platform === 'twitch' ? (
                            <div className="text-xs text-white/60 flex items-center gap-1">
                                {result.isLive && <span className="w-2 h-2 rounded-full bg-green-500 block" />}
                                <span className="truncate">{result.gameName || 'Twitch'}</span>
                            </div>
                        ) : (
                            <div className="text-xs text-white/60 flex items-center gap-1.5">
                                {result.isVtuber && (
                                    <span className="px-1 rounded bg-pink-500/20 text-pink-300 text-[10px] leading-tight">
                                        {t('navbar:vtuberBadge')}
                                    </span>
                                )}
                                {result.subscriber != null && <span>{formatSubscribers(result.subscriber)}</span>}
                                {result.nationality && <span className="opacity-70 truncate">{result.nationality}</span>}
                            </div>
                        )}
                    </div>
                    <Plus size={14} className="text-white/40" />
                </div>
            ))}
        </ScrollArea>
    );
}
