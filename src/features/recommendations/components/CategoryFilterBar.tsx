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

    // 分類 chip:active 用設計稿藍 accent,inactive 用半透明白(token 化、淺色也適用)
    const chipBase = 'inline-flex items-center gap-1 h-[26px] px-2.5 rounded-full text-[11px] font-medium border transition-colors';
    const chipActive = 'bg-[rgba(59,130,246,0.18)] text-[#93c5fd] border-[rgba(96,165,250,0.45)]';
    const chipInactive = 'bg-foreground/4 text-muted-foreground border-foreground/8 hover:bg-foreground/8 hover:text-foreground';

    return (
        <div className="flex items-center gap-1.5 flex-wrap">
            <Tag className="w-3.5 h-3.5 text-muted-foreground mr-1" />
            <button
                onClick={() => onChange(null)}
                className={`${chipBase} ${activeSlug === null ? chipActive : chipInactive}`}
            >
                全部
            </button>

            {isLoading && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground/60" />
            )}

            {categories.map(cat => {
                const active = activeSlug === cat.slug;
                return (
                    <button
                        key={cat.id}
                        onClick={() => onChange(active ? null : cat.slug)}
                        className={`${chipBase} ${active ? chipActive : chipInactive}`}
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
                className="inline-flex items-center gap-1 h-[26px] px-2.5 rounded-full text-[11px] font-medium bg-transparent text-muted-foreground border border-dashed border-foreground/15 hover:border-foreground/30 hover:text-foreground transition-colors"
            >
                <Plus className="w-3 h-3" />
                提交分類
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
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>提出新分類</DialogTitle>
                    <DialogDescription className="text-xs">
                        新增後立刻可用,其他人也能用此分類為 VTuber 打 tag。
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">名稱 *</Label>
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={30}
                            placeholder="例如:V 歌手"
                            className="h-9"
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
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        取消
                    </Button>
                    <Button onClick={handleSubmit} disabled={isPending} className="gap-1.5">
                        {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        送出提案
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
