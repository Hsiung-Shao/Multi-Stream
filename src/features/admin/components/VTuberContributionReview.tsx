import { useState } from 'react';
import { Skeleton } from '../../../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '../../../components/ui/sheet';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Link2,
  Youtube,
  Twitch,
  Shield,
  Inbox,
} from 'lucide-react';
import { useVTuberContributions, useReviewContribution } from '../../vtuber/hooks/useVTubers';
import type { VTuberContribution, VTuberContributionFilter } from '../../vtuber/types';

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  pending: { label: '待審核', bg: 'bg-orange-500/10', text: 'text-orange-400', dot: 'bg-orange-400' },
  approved: { label: '已通過', bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  rejected: { label: '已拒絕', bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },
};

const ACTION_LABELS: Record<string, string> = {
  add: '新增',
  edit: '編輯',
  delete: '刪除',
};

function timeAgo(dateStr: string): string {
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

export function VTuberContributionReview() {
  const [filter, setFilter] = useState<VTuberContributionFilter>({
    status: 'pending',
    page: 1,
    pageSize: 20,
  });
  const [selected, setSelected] = useState<VTuberContribution | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data, isLoading } = useVTuberContributions(filter);
  const totalPages = Math.ceil((data?.count ?? 0) / (filter.pageSize ?? 20));

  const handleSelect = (record: VTuberContribution) => {
    setSelected(record);
    setDetailOpen(true);
  };

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filter.status || 'all'}
          onValueChange={(v) => setFilter((prev) => ({ ...prev, status: v === 'all' ? undefined : v as VTuberContributionFilter['status'], page: 1 }))}
        >
          <SelectTrigger className="w-[130px] h-8 bg-white/[0.03] border-white/[0.06] text-zinc-300 text-[12px] rounded-md hover:bg-white/[0.06] transition-colors">
            <SelectValue placeholder="狀態" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800">
            <SelectItem value="all" className="text-[12px]">全部狀態</SelectItem>
            <SelectItem value="pending" className="text-[12px]">待審核</SelectItem>
            <SelectItem value="approved" className="text-[12px]">已通過</SelectItem>
            <SelectItem value="rejected" className="text-[12px]">已拒絕</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto text-[11px] text-zinc-600 tabular-nums">
          {data?.count ?? 0} 筆結果
        </div>
      </div>

      {/* List */}
      <div className="space-y-px rounded-lg border border-white/[0.06] overflow-hidden">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-4 py-3.5 bg-white/[0.02]">
              <Skeleton className="h-4 w-3/4 bg-white/[0.04] rounded" />
              <Skeleton className="h-3 w-1/3 mt-2 bg-white/[0.03] rounded" />
            </div>
          ))
        ) : (data?.data ?? []).length === 0 ? (
          <div className="py-16 text-center">
            <Inbox className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
            <p className="text-[13px] text-zinc-500">沒有符合條件的貢獻紀錄</p>
          </div>
        ) : (
          (data?.data ?? []).map((record, i) => {
            const statusConf = STATUS_CONFIG[record.status] || STATUS_CONFIG.pending;
            const isPending = record.status === 'pending';

            return (
              <button
                key={record.id}
                onClick={() => handleSelect(record)}
                className={`
                  w-full text-left px-4 py-3 flex items-start gap-3 transition-colors group
                  ${i > 0 ? 'border-t border-white/[0.04]' : ''}
                  ${isPending ? 'bg-white/[0.02]' : 'bg-transparent'}
                  hover:bg-white/[0.04]
                `}
              >
                {/* Icon */}
                <div className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center bg-white/[0.04] text-zinc-400">
                  <User className="w-3.5 h-3.5" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${statusConf.bg} ${statusConf.text}`}>
                      <span className={`w-1 h-1 rounded-full ${statusConf.dot}`} />
                      {statusConf.label}
                    </span>
                    <span className="text-[10px] text-zinc-600 bg-white/[0.04] px-1.5 py-0.5 rounded">
                      {ACTION_LABELS[record.action] || record.action}
                    </span>
                    {record.auto_check && (
                      <span className="text-[10px] text-cyan-500/80">
                        <Shield className="w-3 h-3 inline" /> 已驗證
                      </span>
                    )}
                  </div>
                  <p className={`text-[13px] leading-relaxed ${isPending ? 'text-zinc-200' : 'text-zinc-400'}`}>
                    {record.payload.name}
                    {record.payload.group_name && (
                      <span className="text-zinc-600"> · {record.payload.group_name}</span>
                    )}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="flex items-center gap-1 text-[11px] text-zinc-600">
                      <Clock className="w-3 h-3" />
                      {timeAgo(record.created_at)}
                    </span>
                    {record.submitted_by && (
                      <span className="text-[11px] text-zinc-600">
                        by {record.submitted_by}
                      </span>
                    )}
                    {record.source_urls.length > 0 && (
                      <span className="flex items-center gap-0.5 text-[11px] text-zinc-600">
                        <Link2 className="w-3 h-3" />
                        {record.source_urls.length}
                      </span>
                    )}
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-zinc-700 group-hover:text-zinc-500 mt-1 flex-shrink-0 transition-colors" />
              </button>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-[11px] text-zinc-600 tabular-nums">
            第 {filter.page} / {totalPages} 頁
          </p>
          <div className="flex gap-1">
            <button
              disabled={(filter.page ?? 1) <= 1}
              onClick={() => setFilter((prev) => ({ ...prev, page: (prev.page ?? 1) - 1 }))}
              className="w-7 h-7 flex items-center justify-center rounded-md border border-white/[0.06] text-zinc-400 hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              disabled={(filter.page ?? 1) >= totalPages}
              onClick={() => setFilter((prev) => ({ ...prev, page: (prev.page ?? 1) + 1 }))}
              className="w-7 h-7 flex items-center justify-center rounded-md border border-white/[0.06] text-zinc-400 hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Detail Sheet */}
      {selected && (
        <ContributionDetailSheet
          record={selected}
          open={detailOpen}
          onClose={() => {
            setDetailOpen(false);
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail Sheet
// ---------------------------------------------------------------------------

function ContributionDetailSheet({
  record,
  open,
  onClose,
}: {
  record: VTuberContribution;
  open: boolean;
  onClose: () => void;
}) {
  const reviewMutation = useReviewContribution();
  const [notes, setNotes] = useState('');
  const statusConf = STATUS_CONFIG[record.status] || STATUS_CONFIG.pending;

  const handleReview = async (decision: 'approved' | 'rejected') => {
    await reviewMutation.mutateAsync({
      id: record.id,
      decision,
      reviewerNotes: notes.trim() || undefined,
    });
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto bg-[#0c0c0e] border-white/[0.06]">
        <SheetHeader>
          <SheetTitle className="text-zinc-200">貢獻審核</SheetTitle>
          <SheetDescription className="text-xs text-zinc-500">
            審核用戶提交的 VTuber 資料
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-5">
          {/* Status & action */}
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium ${statusConf.bg} ${statusConf.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusConf.dot}`} />
              {statusConf.label}
            </span>
            <span className="text-[11px] text-zinc-500 bg-white/[0.04] px-2 py-1 rounded">
              {ACTION_LABELS[record.action] || record.action}
            </span>
          </div>

          {/* VTuber info */}
          <Section title="VTuber 資訊">
            <InfoRow label="名稱" value={record.payload.name} />
            <InfoRow label="國籍" value={record.payload.nationality} />
            {record.payload.youtube_channel_id && (
              <InfoRow
                label="YouTube"
                value={record.payload.youtube_channel_id}
                icon={<Youtube className="w-3 h-3 text-red-400" />}
                href={`https://www.youtube.com/channel/${record.payload.youtube_channel_id}`}
              />
            )}
            {record.payload.twitch_channel_id && (
              <InfoRow
                label="Twitch"
                value={record.payload.twitch_channel_id}
                icon={<Twitch className="w-3 h-3 text-violet-400" />}
                href={`https://www.twitch.tv/${record.payload.twitch_channel_id}`}
              />
            )}
            {record.payload.group_name && (
              <InfoRow label="團體" value={record.payload.group_name} />
            )}
            {record.payload.debut_date && (
              <InfoRow label="出道日期" value={record.payload.debut_date} />
            )}
          </Section>

          {/* Auto-check results */}
          {record.auto_check && (
            <Section title="系統自動驗證">
              <div className="space-y-1.5 text-[12px]">
                {record.auto_check.youtube_valid !== undefined && (
                  <div className="flex items-center gap-2">
                    <ValidIcon valid={record.auto_check.youtube_valid} />
                    <span className="text-zinc-400">
                      YouTube: {record.auto_check.youtube_channel_name || '—'}
                      {record.auto_check.youtube_subscriber_count != null && (
                        <span className="text-zinc-600"> ({record.auto_check.youtube_subscriber_count.toLocaleString()} 訂閱)</span>
                      )}
                    </span>
                  </div>
                )}
                {record.auto_check.twitch_valid !== undefined && (
                  <div className="flex items-center gap-2">
                    <ValidIcon valid={record.auto_check.twitch_valid} />
                    <span className="text-zinc-400">
                      Twitch: {record.auto_check.twitch_display_name || '—'}
                      {record.auto_check.twitch_follower_count != null && (
                        <span className="text-zinc-600"> ({record.auto_check.twitch_follower_count.toLocaleString()} 追隨)</span>
                      )}
                    </span>
                  </div>
                )}
                {record.auto_check.debut_date_confidence && (
                  <div className="flex items-center gap-2">
                    <ConfidenceIcon level={record.auto_check.debut_date_confidence} />
                    <span className="text-zinc-400">
                      出道日期可信度: {record.auto_check.debut_date_confidence}
                    </span>
                  </div>
                )}
                <p className="text-[10px] text-zinc-600 pt-1">
                  驗證時間: {new Date(record.auto_check.checked_at).toLocaleString('zh-TW')}
                </p>
              </div>
            </Section>
          )}

          {/* Source URLs */}
          {record.source_urls.length > 0 && (
            <Section title="佐證來源">
              <div className="space-y-1.5">
                {record.source_urls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-[12px] text-blue-400 hover:text-blue-300 transition-colors group"
                  >
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate group-hover:underline">{url}</span>
                  </a>
                ))}
              </div>
              {record.source_note && (
                <p className="text-[11px] text-zinc-500 mt-2 leading-relaxed">
                  {record.source_note}
                </p>
              )}
            </Section>
          )}

          {/* Contributor */}
          <Section title="貢獻者">
            <InfoRow label="暱稱" value={record.submitted_by || '匿名'} />
            {record.submitter_contact && (
              <InfoRow label="聯絡" value={record.submitter_contact} />
            )}
            <InfoRow label="提交時間" value={new Date(record.created_at).toLocaleString('zh-TW')} />
          </Section>

          {/* Review notes (if already reviewed) */}
          {record.reviewer_notes && (
            <Section title="審核備註">
              <p className="text-[12px] text-zinc-400 leading-relaxed">{record.reviewer_notes}</p>
              {record.reviewed_at && (
                <p className="text-[10px] text-zinc-600 mt-1">
                  審核時間: {new Date(record.reviewed_at).toLocaleString('zh-TW')}
                </p>
              )}
            </Section>
          )}

          {/* Review actions (only for pending) */}
          {record.status === 'pending' && (
            <div className="space-y-3 pt-2 border-t border-white/[0.06]">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="審核備註（選填）"
                className="w-full min-h-[60px] resize-y rounded-md border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[12px] text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-white/[0.12]"
                maxLength={500}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleReview('approved')}
                  disabled={reviewMutation.isPending}
                  className="flex-1 h-9 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[13px] font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {reviewMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  通過
                </button>
                <button
                  onClick={() => handleReview('rejected')}
                  disabled={reviewMutation.isPending}
                  className="flex-1 h-9 rounded-md bg-red-600/80 hover:bg-red-600 text-white text-[13px] font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {reviewMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}
                  拒絕
                </button>
              </div>

              {reviewMutation.isError && (
                <p className="text-[11px] text-red-400 text-center">操作失敗，請重試</p>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">{title}</h3>
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
        {children}
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  icon,
  href,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  href?: string;
}) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-zinc-600">{label}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
        >
          {icon}
          <span>{value}</span>
          <ExternalLink className="w-2.5 h-2.5" />
        </a>
      ) : (
        <span className="text-zinc-300 flex items-center gap-1">
          {icon}
          {value}
        </span>
      )}
    </div>
  );
}

function ValidIcon({ valid }: { valid: boolean }) {
  return valid ? (
    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
  ) : (
    <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
  );
}

function ConfidenceIcon({ level }: { level: 'high' | 'medium' | 'low' }) {
  const colorMap = { high: 'text-emerald-400', medium: 'text-amber-400', low: 'text-red-400' };
  return <AlertCircle className={`w-3.5 h-3.5 flex-shrink-0 ${colorMap[level]}`} />;
}
