// 投稿表單右側的即時預覽：審核通過後，週表／個人頁大致會這樣呈現這位 VTuber。
// 只顯示使用者填的內容，不做任何請求（頭像只在是 YouTube 圖床時才載入，與後端限制一致）。

import { useTranslation } from 'react-i18next';
import { Facebook, Instagram, Twitch, Youtube } from 'lucide-react';

export interface PreviewData {
    name: string;
    avatarUrl: string;
    groupLabel: string;
    nationality: string;
    bio: string;
    subscribers: string;
    hasYoutube: boolean;
    socials: { x: boolean; facebook: boolean; instagram: boolean; twitch: boolean };
}

const YT_AVATAR = /^https:\/\/yt3\.(ggpht|googleusercontent)\.com\//;

function XLogo({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
            <path d="M18.9 2H22l-7.5 8.6L23.3 22h-6.9l-5.4-7-6.2 7H1.7l8-9.2L1.3 2h7l4.9 6.4L18.9 2Zm-1.2 18h1.9L7.4 3.9H5.4L17.7 20Z" />
        </svg>
    );
}

export function ContributePreviewCard({ data }: { data: PreviewData }) {
    const { t } = useTranslation('schedule');
    const avatar = YT_AVATAR.test(data.avatarUrl) ? data.avatarUrl : '';
    const icons = [
        { on: data.hasYoutube, label: 'YouTube', Icon: Youtube },
        { on: data.socials.x, label: 'X', Icon: XLogo },
        { on: data.socials.facebook, label: 'Facebook', Icon: Facebook },
        { on: data.socials.instagram, label: 'Instagram', Icon: Instagram },
        { on: data.socials.twitch, label: 'Twitch', Icon: Twitch },
    ];

    return (
        <section aria-labelledby="contribute-preview-h" className="lg:sticky lg:top-6">
            <h2 id="contribute-preview-h" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('contribute.preview')}
            </h2>
            <div className="rounded-2xl border border-border bg-foreground/[0.02] p-5">
                <div className="flex items-center gap-4">
                    {avatar ? (
                        <img src={avatar} alt="" referrerPolicy="no-referrer" className="size-20 shrink-0 rounded-full bg-muted object-cover ring-1 ring-border" />
                    ) : (
                        <span className="size-20 shrink-0 rounded-full bg-muted ring-1 ring-border" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                        <p className={`truncate text-lg font-extrabold tracking-tight ${data.name ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {data.name || t('contribute.previewName')}
                        </p>
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">
                            {[data.groupLabel, t(`nationality.${data.nationality}`, { defaultValue: data.nationality })].filter(Boolean).join(' · ')}
                        </p>
                        {data.subscribers && (
                            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{t('contribute.previewSubscribers', { value: data.subscribers })}</p>
                        )}
                    </div>
                </div>
                {data.bio && <p className="mt-4 whitespace-pre-line break-words text-sm leading-relaxed text-foreground/90">{data.bio}</p>}
                <ul className="mt-4 flex gap-2" aria-label={t('contribute.previewLinks')}>
                    {icons.map(({ on, label, Icon }) => (
                        <li key={label} title={label} className={`inline-flex size-8 items-center justify-center rounded-full border border-border ${on ? 'text-foreground' : 'text-muted-foreground/40'}`}>
                            <Icon className="size-4" />
                            <span className="sr-only">{t(on ? 'contribute.previewLinkOn' : 'contribute.previewLinkOff', { name: label })}</span>
                        </li>
                    ))}
                </ul>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t('contribute.previewHint')}</p>
        </section>
    );
}
