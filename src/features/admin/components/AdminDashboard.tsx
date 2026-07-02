/**
 * Admin 後台主框架:頂部 header(標題 + Tabs + 動作鈕)+ 四個分頁。
 *
 * 分頁:總覽(統計儀表板)/ 回饋(列表+篩選)/ 評分(rating/NPS 分布)/ 公告(CRUD+預覽)。
 * 各分頁自行管理自己的資料與篩選 state;這裡只負責佈局與全域動作(重新整理/登出)。
 */

import { LayoutDashboard, MessagesSquare, Star, Megaphone, LogOut, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../components/ui/tabs';
import { Button } from '../../../components/ui/button';
import { OverviewTab } from './OverviewTab';
import { FeedbackTab } from './FeedbackTab';
import { RatingsTab } from './RatingsTab';
import { AnnouncementsTab } from './AnnouncementsTab';

export function AdminDashboard({ onLogout }: { onLogout: () => void }) {
    const queryClient = useQueryClient();

    const handleRefresh = () => {
        queryClient.invalidateQueries();
    };

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Tabs defaultValue="overview" className="gap-0">
                {/* Header */}
                <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-xl">
                    <div className="max-w-6xl mx-auto px-4 sm:px-5 h-14 flex items-center gap-3">
                        <h1 className="hidden md:block text-[14px] font-semibold tracking-tight whitespace-nowrap">
                            MultiStream Admin
                        </h1>
                        <TabsList className="h-9">
                            <TabsTrigger value="overview" className="px-2.5 text-[13px]">
                                <LayoutDashboard className="size-3.5" />
                                <span className="hidden sm:inline">總覽</span>
                            </TabsTrigger>
                            <TabsTrigger value="feedback" className="px-2.5 text-[13px]">
                                <MessagesSquare className="size-3.5" />
                                <span className="hidden sm:inline">回饋</span>
                            </TabsTrigger>
                            <TabsTrigger value="ratings" className="px-2.5 text-[13px]">
                                <Star className="size-3.5" />
                                <span className="hidden sm:inline">評分</span>
                            </TabsTrigger>
                            <TabsTrigger value="announcements" className="px-2.5 text-[13px]">
                                <Megaphone className="size-3.5" />
                                <span className="hidden sm:inline">公告</span>
                            </TabsTrigger>
                        </TabsList>
                        <div className="ml-auto flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleRefresh}
                                title="重新整理"
                                className="size-8 text-muted-foreground hover:text-foreground"
                            >
                                <RefreshCw className="size-3.5" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onLogout}
                                title="登出"
                                className="size-8 text-muted-foreground hover:text-foreground"
                            >
                                <LogOut className="size-3.5" />
                            </Button>
                        </div>
                    </div>
                </header>

                {/* forceMount + inactive 隱藏:切換 tab 不卸載內容,
                    保留各分頁的篩選/分頁/詳情等 local state(對齊舊版行為) */}
                <main className="max-w-6xl mx-auto w-full px-4 sm:px-5 py-5">
                    <TabsContent value="overview" forceMount className="data-[state=inactive]:hidden">
                        <OverviewTab />
                    </TabsContent>
                    <TabsContent value="feedback" forceMount className="data-[state=inactive]:hidden">
                        <FeedbackTab />
                    </TabsContent>
                    <TabsContent value="ratings" forceMount className="data-[state=inactive]:hidden">
                        <RatingsTab />
                    </TabsContent>
                    <TabsContent value="announcements" forceMount className="data-[state=inactive]:hidden">
                        <AnnouncementsTab />
                    </TabsContent>
                </main>
            </Tabs>
        </div>
    );
}
