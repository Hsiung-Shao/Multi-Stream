/** 版本備註標籤（如「清唱」「練歌版」）：曲目表與單曲頁共用；文字就是備註本身（資料內容，不翻譯） */
export function VersionNoteTag({ note }: { note: string }) {
    return (
        <span className="inline-flex shrink-0 items-center rounded-full border border-primary/40 px-2 py-px text-[11px] font-medium text-primary">
            {note}
        </span>
    );
}
