/**
 * 回饋分頁:篩選(類型/狀態/日期/關鍵字)+ 列表 + 分頁 + 詳情 Sheet。
 * 自行管理 filter 與選取 state;資料來自 useFeedbacks。
 */

import { useState } from 'react';
import { useFeedbacks } from '../hooks/useFeedbacks';
import { FeedbackTable } from './FeedbackTable';
import { FeedbackDetail } from './FeedbackDetail';
import type { FeedbackRecord, FeedbackFilter } from '../types';

export function FeedbackTab() {
    const [filter, setFilter] = useState<FeedbackFilter>({ page: 1, pageSize: 20 });
    const [selectedRecord, setSelectedRecord] = useState<FeedbackRecord | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);

    const { data, isLoading } = useFeedbacks(filter);

    const handleFilterChange = (updates: Partial<FeedbackFilter>) => {
        setFilter(prev => ({ ...prev, ...updates }));
    };

    const handleSelect = (record: FeedbackRecord) => {
        setSelectedRecord(record);
        setDetailOpen(true);
    };

    const handleDetailClose = () => {
        setDetailOpen(false);
        setSelectedRecord(null);
    };

    return (
        <>
            <FeedbackTable
                data={data?.data ?? []}
                count={data?.count ?? 0}
                filter={filter}
                isLoading={isLoading}
                onFilterChange={handleFilterChange}
                onSelect={handleSelect}
            />
            <FeedbackDetail
                record={selectedRecord}
                open={detailOpen}
                onClose={handleDetailClose}
            />
        </>
    );
}
