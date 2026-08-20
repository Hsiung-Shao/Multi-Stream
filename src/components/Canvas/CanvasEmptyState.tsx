import { Plus, Layout, Tv, FolderHeart, Search, Trash2, Maximize, Star, Settings, Home } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { cn } from '../ui/utils';
import { StreamUrlQuickAdd } from '../StreamUrlQuickAdd';

export const CanvasEmptyState = () => {
    const { t } = useTranslation('common');
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        setIsVisible(true);
    }, []);

    const tips = [
        {
            icon: <Search className="w-5 h-5 text-teal-400" />,
            text: t('empty_state.tip_search') || "搜尋並快速加入直播頻道或是影片",
            highlight: "搜尋"
        },
        {
            icon: <Plus className="w-5 h-5 text-blue-400" />,
            text: t('empty_state.tip_add') || "點擊新增按鈕來加入直播、聊天室或預設組合",
            highlight: "新增視窗"
        },
        {
            icon: <Layout className="w-5 h-5 text-green-400" />,
            text: t('empty_state.tip_layout') || "使用佈局選單來選擇特定佈局模式",
            highlight: "佈局設定"
        },
        {
            icon: <Tv className="w-5 h-5 text-purple-400" />,
            text: t('empty_state.tip_control') || "透過媒體控制面板統一管理音量與靜音狀態",
            highlight: "媒體控制"
        },
        {
            icon: <Star className="w-5 h-5 text-yellow-400" />,
            text: t('empty_state.tip_favorites_list') || "查看與管理您的收藏清單及群組",
            highlight: "收藏清單"
        },
        {
            icon: <FolderHeart className="w-5 h-5 text-pink-400" />,
            text: t('empty_state.tip_save') || "將當前畫布配置一鍵儲存至收藏清單",
            highlight: "一鍵收藏"
        },
        {
            icon: <Maximize className="w-5 h-5 text-orange-400" />,
            text: t('empty_state.tip_fullscreen') || "切換全螢幕模式以獲得最佳觀看體驗",
            highlight: "全螢幕"
        },
        {
            icon: <Trash2 className="w-5 h-5 text-red-400" />,
            text: t('empty_state.tip_clear') || "一鍵清空畫布上所有的視窗",
            highlight: "清空畫布"
        },
        {
            icon: <Home className="w-5 h-5 text-cyan-400" />,
            text: t('empty_state.tip_home') || "返回首頁",
            highlight: "回首頁"
        },
        {
            icon: <Settings className="w-5 h-5 text-gray-400" />,
            text: t('empty_state.tip_settings') || "調整全域設定與偏好選項",
            highlight: "設定"
        }
    ];

    return (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-10 transition-opacity duration-700 ease-in-out">
            <div
                className={cn(
                    "max-w-5xl w-full p-8 transform transition-all duration-700 ease-out",
                    isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                )}
            >
                {/* 主要入口：H1 + 產品說明 + 快速新增輸入框（外層 pointer-events-none，此區要可互動） */}
                <div className="pointer-events-auto text-center mb-12">
                    <h1 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 mb-3 drop-shadow-sm">
                        {t('empty_state.headline') || "同時觀看多個直播"}
                    </h1>
                    <p className="text-gray-400 text-sm md:text-base font-light max-w-2xl mx-auto mb-6 leading-relaxed">
                        {t('empty_state.intro') || "MultiStream Hub 讓你在同一個畫面同時觀看多個 Twitch 與 YouTube 直播，支援聊天室整合與自由佈局，完全免費、無需註冊。貼上網址或頻道名稱即可開始。"}
                    </p>
                    <div className="flex justify-center">
                        <StreamUrlQuickAdd size="md" />
                    </div>
                </div>

                <div className="text-center mb-12">
                    <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 mb-2 drop-shadow-sm">
                        {t('empty_state.tips_title') || "功能介紹"}
                    </h2>
                    <div className="h-1 w-24 bg-gradient-to-r from-transparent via-blue-500 to-transparent mx-auto opacity-50 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {tips.map((tip, index) => (
                        <div
                            key={index}
                            className={cn(
                                "flex items-center gap-4 group transition-all duration-500 ease-out",
                                isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"
                            )}
                            style={{ transitionDelay: `${index * 100 + 200}ms` }}
                        >
                            <div className="p-3 rounded-lg bg-white/5 group-hover:bg-white/10 transition-colors shadow-lg shadow-black/20 backdrop-blur-sm border border-white/5 group-hover:border-white/20 group-hover:scale-110 duration-300 shrink-0">
                                {tip.icon}
                            </div>
                            <div className="flex-1">
                                <p className="text-gray-300 text-base font-light tracking-wide group-hover:text-white transition-colors duration-300">
                                    {tip.text}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>

                <div
                    className={cn(
                        "mt-12 text-center transition-all duration-700 delay-700",
                        isVisible ? "opacity-100" : "opacity-0"
                    )}
                >
                    <p className="text-sm text-white/20 font-light animate-pulse">
                        {t('empty_state.click_menu_hint') || "點擊下方動態島按鈕以開始使用"}
                    </p>
                </div>
            </div>
        </div>
    );
};
