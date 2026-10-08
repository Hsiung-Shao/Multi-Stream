// 後台回饋：資料庫舊值 processed 等同「已修正」——篩選「已修正」要一併查 processed、總覽統計併進 fixed（不出現兩列「已修正」）
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Op = { op: string; args: unknown[] };
let ops: Op[] = [];
let rows: Array<Record<string, unknown>> = [];

/** 假的 PostgREST builder：記錄呼叫的方法，await 時回 rows */
function builder() {
    const b: Record<string, unknown> = {};
    for (const op of ['select', 'order', 'eq', 'in', 'gte', 'lte', 'ilike', 'or', 'range']) {
        b[op] = (...args: unknown[]) => { ops.push({ op, args }); return b; };
    }
    b.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null, count: rows.length });
    return b;
}

vi.mock('../../src/lib/supabase', () => ({
    getSupabase: async () => ({ from: () => builder() }),
}));
vi.mock('recharts', () => {
    const Stub = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
    return { BarChart: Stub, Bar: Stub, XAxis: Stub, YAxis: Stub, Tooltip: Stub, ResponsiveContainer: Stub, PieChart: Stub, Pie: Stub, Cell: Stub };
});

import { useFeedbacks } from '../../src/features/admin/hooks/useFeedbacks';
import { OverviewTab } from '../../src/features/admin/components/OverviewTab';

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
    ops = [];
    rows = [];
});

describe('useFeedbacks 狀態篩選', () => {
    it('篩「已修正」(fixed)：查 status in (fixed, processed)，不用 eq', async () => {
        const { result } = renderHook(() => useFeedbacks({ status: 'fixed', page: 1, pageSize: 20 }), { wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(ops).toContainEqual({ op: 'in', args: ['status', ['fixed', 'processed']] });
        expect(ops.some((o) => o.op === 'eq' && o.args[0] === 'status')).toBe(false);
    });

    it('其他狀態照常用 eq', async () => {
        const { result } = renderHook(() => useFeedbacks({ status: 'read', page: 1, pageSize: 20 }), { wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(ops).toContainEqual({ op: 'eq', args: ['status', 'read'] });
        expect(ops.some((o) => o.op === 'in')).toBe(false);
    });
});

describe('OverviewTab 狀態分布', () => {
    it('processed 併進「已修正」，只有一列「已修正」，也不會出現 processed 的獨立列', async () => {
        const now = new Date().toISOString();
        const row = (status: string) => ({ feedback_type: 'bug', status, rating: null, nps_score: null, created_at: now });
        rows = [row('fixed'), row('processed'), row('processed'), row('unread')];
        render(<OverviewTab />, { wrapper });

        await waitFor(() => expect(screen.getAllByText('已修正')).toHaveLength(1));
        const fixedRow = screen.getByText('已修正').closest('div') as HTMLElement;
        // 1 筆 fixed＋2 筆 processed＝3，占 4 筆中的 75%
        expect(fixedRow.textContent).toContain('3(75%)');
        for (const label of ['未讀', '已讀', '處理中', '封存']) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    });
});
