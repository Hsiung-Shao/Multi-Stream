/**
 * 計算分頁要顯示的頁碼列表(含 ellipsis 縮減)。
 *
 * 規則:
 *   - total <= 7:全部頁碼顯示
 *   - total > 7:首頁 + (current-1)~(current+1) + 末頁,缺口用 'ellipsis' 填
 *
 * 範例:
 *   getPageNumbers(1, 5)  -> [1, 2, 3, 4, 5]
 *   getPageNumbers(1, 10) -> [1, 2, 'ellipsis', 10]
 *   getPageNumbers(5, 10) -> [1, 'ellipsis', 4, 5, 6, 'ellipsis', 10]
 *   getPageNumbers(9, 10) -> [1, 'ellipsis', 8, 9, 10]
 */
export function getPageNumbers(current: number, total: number): Array<number | 'ellipsis'> {
    if (total <= 7) {
        return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages: Array<number | 'ellipsis'> = [1];
    if (current > 3) pages.push('ellipsis');
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
        pages.push(i);
    }
    if (current < total - 2) pages.push('ellipsis');
    pages.push(total);
    return pages;
}
