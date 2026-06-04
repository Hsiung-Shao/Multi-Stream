// /recommendations 路由
//
// 結構已收斂進「探索」hub（VTuberExplorePage 的 3-tab）。
// 此檔保留為薄 wrapper，渲染 hub 並預設停在「推薦」tab，
// 確保任何仍 import RecommendationsPage 的地方行為一致。
// 推薦內容本身在 RecommendationsPanel.tsx。

import { VTuberExplorePage } from '../../vtuber/pages/VTuberExplorePage';

export function RecommendationsPage() {
    return <VTuberExplorePage initialTab="recommendations" />;
}
