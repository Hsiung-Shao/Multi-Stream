// 相對時間格式化（推薦系統共用：留言時間、最近活動、上次直播）

export function formatRelativeTime(iso: string): string {
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return '';
    const diff = (Date.now() - t) / 1000;
    if (diff < 60) return '剛剛';
    if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} 天前`;
    return new Date(iso).toLocaleDateString('zh-TW');
}
