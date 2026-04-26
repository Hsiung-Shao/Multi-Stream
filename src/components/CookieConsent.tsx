/**
 * Cookie 同意橫幅元件
 * 
 * GDPR 合規的 Cookie 同意橫幅，提供「接受」、「拒絕」選項。
 * 使用者的選擇會儲存在 localStorage 中，並控制 GA4 的初始化。
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Cookie, X, Check, Shield } from 'lucide-react';
import { hasConsentRecord, setTrackingConsent } from '../utils/analytics';
import { initUmami } from '../utils/umami';
import { isSupportedLang, buildLangUrl, DEFAULT_LANG } from '../lib/i18nRouting';

interface CookieConsentProps {
    onConsentChange?: (accepted: boolean) => void;
}

export function CookieConsent({ onConsentChange }: CookieConsentProps) {
    const { t, i18n } = useTranslation('common');
    const [showBanner, setShowBanner] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const lang = isSupportedLang(i18n.language) ? i18n.language : DEFAULT_LANG;
    const privacyHref = buildLangUrl(lang, '/privacy');

    useEffect(() => {
        // 檢查是否已有同意記錄
        const hasRecord = hasConsentRecord();
        if (!hasRecord) {
            // 延遲顯示橫幅，避免干擾首次載入
            const timer = setTimeout(() => {
                setShowBanner(true);
                setIsAnimating(true);
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleAccept = () => {
        setIsAnimating(false);
        setTimeout(() => {
            setShowBanner(false);
            setTrackingConsent(true);
            initUmami();
            onConsentChange?.(true);
        }, 300);
    };

    const handleReject = () => {
        setIsAnimating(false);
        setTimeout(() => {
            setShowBanner(false);
            setTrackingConsent(false);
            onConsentChange?.(false);
        }, 300);
    };

    if (!showBanner) return null;

    return (
        <div
            className={`fixed bottom-0 left-0 right-0 z-[9999] p-4 transition-all duration-300 ${isAnimating ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
                }`}
        >
            <div className="max-w-4xl mx-auto bg-gray-900/95 backdrop-blur-md border border-gray-700 rounded-xl shadow-2xl p-6">
                <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                    {/* 圖示和標題 */}
                    <div className="flex items-center gap-3 shrink-0">
                        <div className="p-2 bg-purple-600/20 rounded-lg">
                            <Cookie className="w-6 h-6 text-purple-400" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-white">
                                {t('cookie.title', 'Cookie 使用同意')}
                            </h3>
                        </div>
                    </div>

                    {/* 說明文字 */}
                    <div className="flex-1 text-sm text-gray-300">
                        <p>
                            {t('cookie.description', '我們使用 Cookie 和類似技術來改善您的瀏覽體驗、分析網站流量，並提供個人化內容。點擊「接受」即表示您同意我們使用這些技術。')}
                        </p>
                        <a
                            href={privacyHref}
                            className="text-purple-400 hover:text-purple-300 underline text-xs mt-1 inline-block"
                        >
                            {t('cookie.privacyLink', '了解更多')}
                        </a>
                    </div>

                    {/* 按鈕 */}
                    <div className="flex gap-3 shrink-0 w-full md:w-auto">
                        <button
                            onClick={handleReject}
                            className="flex-1 md:flex-none px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            <X className="w-4 h-4" />
                            <span>{t('cookie.reject', '拒絕')}</span>
                        </button>
                        <button
                            onClick={handleAccept}
                            className="flex-1 md:flex-none px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            <Check className="w-4 h-4" />
                            <span>{t('cookie.accept', '接受')}</span>
                        </button>
                    </div>
                </div>

                {/* 隱私權圖示 */}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-700/50">
                    <Shield className="w-3 h-3 text-gray-500" />
                    <span className="text-xs text-gray-500">
                        {t('cookie.privacyNote', '您的隱私對我們很重要。您可以隨時在設定中變更您的選擇。')}
                    </span>
                </div>
            </div>
        </div>
    );
}

export default CookieConsent;
