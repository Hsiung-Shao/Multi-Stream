import { MessageSquareHeart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../store/useUIStore';

/**
 * 全站浮動 Feedback 按鈕（FAB = Floating Action Button）
 *
 * - 固定右下，所有頁面可見
 * - 一鍵打開意見回饋 modal
 * - canvas / admin 等沉浸或敏感頁面可在 App.tsx renderPage 條件略過顯示
 * - 已有 modal 開啟時透過 z-index 排序自然被覆蓋
 */
export function FeedbackFAB() {
    const { t } = useTranslation('navbar');
    const openModal = useUIStore((s) => s.openModal);

    return (
        <button
            type="button"
            onClick={() => openModal('feedback')}
            aria-label={t('feedback', '意見回饋')}
            title={t('feedback', '意見回饋')}
            className={[
                'fixed bottom-5 right-5 z-40',
                'flex items-center gap-2 px-4 py-3 rounded-full',
                'bg-primary text-primary-foreground shadow-lg shadow-primary/30',
                'hover:scale-105 hover:shadow-xl hover:shadow-primary/40',
                'active:scale-95',
                'transition-all duration-200',
                'group',
            ].join(' ')}
        >
            <MessageSquareHeart className="w-5 h-5 shrink-0" />
            <span className="hidden sm:inline text-sm font-medium overflow-hidden max-w-0 group-hover:max-w-[120px] transition-[max-width] duration-300 whitespace-nowrap">
                {t('feedback', '意見回饋')}
            </span>
        </button>
    );
}
