// 分類 filter bar(單選一個 category 或 all)
// 也提供「+ 提分類」按鈕觸發 ProposeCategoryDialog

import { useState } from 'react';
import { useCategories, useProposeCategory } from '../hooks';
import { formatRecommendError } from '../apiClient';
import { Button } from '../../../components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Plus, Tag, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
    activeSlug: string | null;
    onChange: (slug: string | null) => void;
    isLoggedIn: boolean;
    onRequestLogin: () => void;
}

export function CategoryFilterBar({ activeSlug, onChange, isLoggedIn, onRequestLogin }: Props) {
    const { data: categories = [], isLoading } = useCategories();
    const [proposeOpen, setProposeOpen] = useState(false);

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <Tag className="w-3.5 h-3.5 text-zinc-500" />
            <button
                onClick={() => onChange(null)}
                className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                    activeSlug === null
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                        : 'bg-zinc-800/60 text-zinc-400 border border-zinc-700 hover:bg-zinc-800'
                }`}
            >
                全部
            </button>

            {isLoading && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-600" />
            )}

            {categories.map(cat => {
                const active = activeSlug === cat.slug;
                return (
                    <button
                        key={cat.id}
                        onClick={() => onChange(active ? null : cat.slug)}
                        className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                            active
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                                : 'bg-zinc-800/60 text-zinc-400 border border-zinc-700 hover:bg-zinc-800'
                        }`}
                        title={cat.name}
                    >
                        {cat.name}
                    </button>
                );
            })}

            <button
                onClick={() => {
                    if (!isLoggedIn) {
                        onRequestLogin();
                        return;
                    }
                    setProposeOpen(true);
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-zinc-400 border border-dashed border-zinc-700 hover:border-zinc-500 hover:text-zinc-300 transition-colors"
            >
                <Plus className="w-3 h-3" />
                提分類
            </button>

            <ProposeCategoryDialog open={proposeOpen} onOpenChange={setProposeOpen} />
        </div>
    );
}

interface ProposeProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    onProposed?: (categoryId: string) => void;
}

export function ProposeCategoryDialog({ open, onOpenChange, onProposed }: ProposeProps) {
    const [name, setName] = useState('');
    const propose = useProposeCategory();
    const isPending = propose.isPending;

    const handleSubmit = async () => {
        const trimmedName = name.trim();
        if (!trimmedName) {
            toast.error('請填寫分類名稱');
            return;
        }
        try {
            const res = await propose.mutateAsync({ name: trimmedName });
            toast.success('已新增分類');
            setName('');
            onProposed?.(res.category.id);
            onOpenChange(false);
        } catch (e) {
            toast.error(formatRecommendError(e));
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                if (!v) {
                    setName('');
                    propose.reset();
                }
                onOpenChange(v);
            }}
        >
            <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-200 max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-zinc-100">提出新分類</DialogTitle>
                    <DialogDescription className="text-zinc-500 text-xs">
                        新增後立刻可用,其他人也能用此分類為 VTuber 打 tag。
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs text-zinc-400">名稱 *</Label>
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={30}
                            placeholder="例如:V 歌手"
                            className="bg-zinc-900 border-zinc-800 text-zinc-200 h-9"
                        />
                    </div>

                    {propose.isError && (
                        <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/25">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                            <p className="text-[12px] text-red-400">{formatRecommendError(propose.error)}</p>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        className="bg-zinc-900 border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                    >
                        取消
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isPending}
                        className="bg-blue-600 hover:bg-blue-500 gap-1.5"
                    >
                        {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        送出提案
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
