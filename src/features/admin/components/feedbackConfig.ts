/**
 * Feedback 相關的共用顯示設定(類型/狀態的 label 與配色)與小工具。
 * 原本重複散落在 AdminDashboard / FeedbackTable / FeedbackDetail,統一收斂到這裡。
 *
 * 注意:admin 後台恆為深色(useAppliedTheme 強制),因此語意強調色
 * 使用 Tailwind 調色盤的 400 系即可,不會有淺色底對比問題。
 */

import { Bug, Lightbulb, Palette, HelpCircle } from 'lucide-react';
import type { FeedbackStatus, SelectableFeedbackStatus } from '../types';

export const TYPE_CONFIG: Record<string, { label: string; icon: typeof Bug; color: string; dotColor: string }> = {
    bug: { label: 'Bug', icon: Bug, color: 'text-red-400', dotColor: 'bg-red-400' },
    feature: { label: '功能建議', icon: Lightbulb, color: 'text-amber-400', dotColor: 'bg-amber-400' },
    ui: { label: 'UI/UX', icon: Palette, color: 'text-violet-400', dotColor: 'bg-violet-400' },
    other: { label: '其他', icon: HelpCircle, color: 'text-muted-foreground', dotColor: 'bg-muted-foreground' },
};

type StatusConf = { label: string; bg: string; text: string; dot: string };
const FIXED_CONF: StatusConf = { label: '已修正', bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' };

/** 所有可能出現在資料庫的狀態（含舊值 processed，顯示同「已修正」） */
export const STATUS_CONFIG: Record<FeedbackStatus, StatusConf> = {
    unread: { label: '未讀', bg: 'bg-orange-500/10', text: 'text-orange-400', dot: 'bg-orange-400' },
    read: { label: '已讀', bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-400' },
    processing: { label: '處理中', bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
    fixed: FIXED_CONF,
    processed: FIXED_CONF,
    archived: { label: '封存', bg: 'bg-muted', text: 'text-muted-foreground', dot: 'bg-muted-foreground' },
};

/** 下拉選單可選的狀態（不提供舊值 processed） */
export const STATUS_OPTIONS: SelectableFeedbackStatus[] = ['unread', 'read', 'processing', 'fixed', 'archived'];

/** 舊值 processed 視同 fixed（下拉選單與「是否有變更」都用這個比較） */
export function normalizeFeedbackStatus(s: FeedbackStatus): SelectableFeedbackStatus {
    return s === 'processed' ? 'fixed' : s;
}

export function timeAgo(dateStr: string): string {
    const now = Date.now();
    const date = new Date(dateStr).getTime();
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '剛剛';
    if (mins < 60) return `${mins} 分鐘前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小時前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} 天前`;
    return new Date(dateStr).toLocaleDateString('zh-TW');
}
