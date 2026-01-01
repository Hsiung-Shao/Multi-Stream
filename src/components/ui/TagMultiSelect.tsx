import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "./utils";
import { Button } from "./button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "./command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "./popover";
import { Tag } from "../../features/favorites/types";
import { Badge } from "./badge";
import { useTranslation } from "react-i18next";

interface TagMultiSelectProps {
    allTags: Tag[];
    selectedTagIds: string[];
    onChange: (newTagIds: string[]) => void;
    placeholder?: string;
    className?: string;
}

export function TagMultiSelect({
    allTags,
    selectedTagIds,
    onChange,
    placeholder,
    className
}: TagMultiSelectProps) {
    const [open, setOpen] = React.useState(false);
    const { t } = useTranslation('tags');

    const displayPlaceholder = placeholder || t('selectTags');

    const toggleTag = (tagId: string) => {
        const newSelected = selectedTagIds.includes(tagId)
            ? selectedTagIds.filter(id => id !== tagId)
            : [...selectedTagIds, tagId];
        onChange(newSelected);
    };

    const selectedTags = allTags.filter(t => selectedTagIds.includes(t.id));

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("w-full justify-between h-auto min-h-10 py-2", className)}
                >
                    <div className="flex flex-wrap gap-1 items-center">
                        {selectedTags.length > 0 ? (
                            selectedTags.map(tag => (
                                <Badge
                                    key={tag.id}
                                    style={{ backgroundColor: tag.color }}
                                    className="text-white border-0 px-1.5 py-0 text-[10px]"
                                >
                                    {tag.name}
                                </Badge>
                            ))
                        ) : (
                            <span className="text-muted-foreground">{displayPlaceholder}</span>
                        )}
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0" align="start">
                <Command>
                    <CommandInput placeholder={t('searchTags')} />
                    <CommandList>
                        <CommandEmpty>{t('noTagsFound')}</CommandEmpty>
                        <CommandGroup>
                            {allTags.map((tag) => (
                                <CommandItem
                                    key={tag.id}
                                    value={tag.name} // Search by name
                                    onSelect={() => toggleTag(tag.id)}
                                >
                                    <div
                                        className="h-3 w-3 rounded-full mr-2 shrink-0"
                                        style={{ backgroundColor: tag.color }}
                                    />
                                    <span>{tag.name}</span>
                                    <Check
                                        className={cn(
                                            "ml-auto h-4 w-4",
                                            selectedTagIds.includes(tag.id) ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
