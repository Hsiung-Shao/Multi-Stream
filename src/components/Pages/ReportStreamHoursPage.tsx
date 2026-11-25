// 資料報告：台灣 VTuber 幾點開台（/reports/taiwan-vtuber-streaming-hours）。
// 數字全部來自 src/data/reports 的快照（scripts/sql/report-stream-hours.sql 對正式庫跑一次存檔），頁面不連資料庫。
// 圖表＝帶長條／色塊的 <table>：預渲染直接出圖、螢幕閱讀器可讀、不多載圖表套件。SEO（Article + Breadcrumb）由 App.tsx 處理。

import { useTranslation } from 'react-i18next';
import { BarChart3, ArrowRight, ChevronRight } from 'lucide-react';
import { StaticPageHeader } from '../StaticPageHeader';
import { RouteLink } from '../Navigation/RouteLink';
import { SiteFooter } from '../SiteFooter';
import { RelatedLinks } from '../RelatedLinks';
import { BlurOrb } from '../ui/ds-primitives';
import { Button } from '../ui/button';
import { logEvent } from '../../utils/analytics';
import { guidePage } from '../../config/guides';
import data from '../../data/reports/stream-hours-2026-11.json';
import { REPORT_STREAM_HOURS_META } from './reportStreamHoursMeta';

type TFn = (key: string, options?: Record<string, unknown>) => string;

const sum = (a: readonly number[]) => a.reduce((s, n) => s + n, 0);
const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(1)}%`;
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
const argmax = (a: readonly number[]) => a.indexOf(Math.max(...a));
const range = (a: readonly number[], from: number, to: number) => sum(a.slice(from, to));

/** 期間內每個 ISO 星期（索引 0＝週一）各有幾天；期間不是整週時平日／週末要換算成每天平均 */
function daysPerDow(from: string, to: string): number[] {
    const days = [0, 0, 0, 0, 0, 0, 0];
    for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
        days[(d.getUTCDay() + 6) % 7] += 1;
    }
    return days;
}

export function deriveReport(r: typeof data) {
    const total = r.totalStreams;
    const days = daysPerDow(r.period.from, r.period.to);
    const perDay = (rows: number[]) => sum(rows.map((i) => range(r.byDowHour[i], 12, 19))) / sum(rows.map((i) => days[i]));
    const weekdayRows = [0, 1, 2, 3, 4];
    const weekdayHours = r.byHour.map((_, h) => sum(weekdayRows.map((i) => r.byDowHour[i][h])));
    const seg = (s: typeof r.segments.corporate) => ({
        vtubers: s.vtubers.toLocaleString('en-US'),
        streams: s.streams.toLocaleString('en-US'),
        median: s.medianHours,
        peak: hh(argmax(s.byHour)),
        prime: pct(range(s.byHour, 19, 24), s.streams),
        afternoon: pct(range(s.byHour, 12, 19), s.streams),
        night: pct(range(s.byHour, 0, 6), s.streams),
    });
    const corp = seg(r.segments.corporate);
    const indie = seg(r.segments.independent);
    return {
        vars: {
            total: total.toLocaleString('en-US'),
            vtubers: r.vtubers.toLocaleString('en-US'),
            from: r.period.from,
            to: r.period.to,
            generated: r.generatedAt,
            yt: r.byPlatform.youtube.toLocaleString('en-US'),
            tw: r.byPlatform.twitch.toLocaleString('en-US'),
            prime: pct(range(r.byHour, 19, 24), total),
            peak: hh(argmax(r.byHour)),
            peakShare: pct(Math.max(...r.byHour), total),
            quiet: hh(r.byHour.indexOf(Math.min(...r.byHour))),
            weekendRatio: (perDay([5, 6]) / perDay(weekdayRows)).toFixed(1),
            satPeak: hh(argmax(r.byDowHour[5])),
            friPeak: hh(argmax(r.byDowHour[4])),
            weekdayPeak: hh(argmax(weekdayHours)),
            medAll: r.medianHours.all,
            medTw: r.medianHours.twitch,
            medYt: r.medianHours.youtube,
            mid: pct(range(r.durationBins, 2, 5), total),
            long: pct(r.durationBins[6], total),
            corpV: corp.vtubers,
            corpPrime: corp.prime,
            indiePrime: indie.prime,
            corpAfternoon: corp.afternoon,
            indieAfternoon: indie.afternoon,
            jc: pct(r.twitchTopCategories[0].streams, r.twitchWithCategory),
            n: r.twitchWithCategory.toLocaleString('en-US'),
        },
        corporate: corp,
        independent: indie,
        /** 期間內天數最少的星期（索引 0＝週一）；熱度圖那一列會偏淺 */
        shortDow: days.indexOf(Math.min(...days)),
    };
}

const SEGMENT_ROWS = ['vtubers', 'streams', 'median', 'peak', 'afternoon', 'prime', 'night'] as const;

function BarTable({ caption, labelHead, rows, total }: {
    caption: string;
    labelHead: string;
    rows: { label: string; value: number }[];
    total: number;
}) {
    const { t } = useTranslation('reports');
    const max = Math.max(...rows.map((r) => r.value));
    return (
        <table className="rpt-bars">
            <caption>{caption}</caption>
            <thead>
                <tr>
                    <th scope="col">{labelHead}</th>
                    <th scope="col">{t('col.streams')}</th>
                    <th scope="col" className="num">{t('col.share')}</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((r) => (
                    <tr key={r.label}>
                        <th scope="row">{r.label}</th>
                        <td>
                            <span className="rpt-bar">
                                <span className="rpt-fill" style={{ width: `${(r.value / max) * 100}%` }} aria-hidden="true" />
                                <span className="rpt-val">{r.value.toLocaleString('en-US')}</span>
                            </span>
                        </td>
                        <td className="num">{pct(r.value, total)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export function ReportStreamHoursPage() {
    const { t } = useTranslation(['reports', 'common', 'tutorial']);
    const tx = t as unknown as TFn;
    const report = deriveReport(data);
    const vars = { ...report.vars, shortDow: tx(`reports:dow.${report.shortDow + 1}`) };
    const r = (key: string) => tx(`reports:${key}`, vars);
    const heatMax = Math.max(...data.byDowHour.flat());
    const twitchTotal = data.twitchWithCategory;

    return (
        <div className="rpt-page">
            <style dangerouslySetInnerHTML={{ __html: `
                .rpt-page { position: relative; min-height: 100vh; overflow: clip; background: var(--background); color: var(--foreground); font-family: var(--font-sans); }
                .rpt-wrap { position: relative; z-index: 1; max-width: 820px; margin: 0 auto; padding: 24px 16px 96px; }
                .rpt-crumbs { font-size: 13px; color: var(--muted-foreground); margin-bottom: 28px; }
                .rpt-crumbs ol { list-style: none; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0; padding: 0; }
                .rpt-crumbs a { color: var(--muted-foreground); text-decoration: none; }
                .rpt-crumbs li[aria-current="page"] { color: var(--foreground); font-weight: 600; }
                .rpt-crumbs li[aria-hidden] { display: inline-flex; opacity: 0.5; }
                .rpt-hero { padding: 8px 0 4px; }
                .rpt-badge { width: 60px; height: 60px; border-radius: 18px; margin-bottom: 18px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, oklch(0.63 0.23 304), #c084fc); color: #fff; }
                .rpt-eyebrow { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.14em; color: #c084fc; }
                .rpt-h1 { font-size: 36px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.18; margin: 10px 0 0; }
                .rpt-sub { font-size: 17px; color: var(--muted-foreground); line-height: 1.75; margin: 16px 0 0; }
                .rpt-meta { font-size: 13px; color: var(--muted-foreground); margin: 14px 0 0; }
                .rpt-meta a { color: var(--primary-text); font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
                .rpt-summary { margin-top: 32px; padding: 20px 22px; border-radius: 18px; background: oklch(0.63 0.23 304 / 0.08); border: 1px solid oklch(0.63 0.23 304 / 0.25); }
                .rpt-summary h2 { margin-top: 0; }
                .rpt-summary ul { margin: 0; padding-left: 20px; display: grid; gap: 8px; line-height: 1.7; }
                .rpt-section { margin-top: 48px; }
                .rpt-section h2, .rpt-summary h2 { font-size: 22px; font-weight: 700; margin: 0 0 14px; }
                .rpt-section p { line-height: 1.8; color: var(--muted-foreground); margin: 0 0 14px; font-size: 15.5px; }
                .rpt-section ul { line-height: 1.8; color: var(--muted-foreground); padding-left: 20px; margin: 0; }
                .rpt-note { font-size: 13px !important; opacity: 0.85; }
                .rpt-page table { width: 100%; border-collapse: collapse; font-size: 13.5px; margin: 8px 0 18px; }
                .rpt-page caption { text-align: left; font-size: 13px; font-weight: 600; color: var(--foreground); padding-bottom: 8px; }
                .rpt-page th, .rpt-page td { padding: 5px 8px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: 400; }
                .rpt-page thead th { font-size: 12px; color: var(--muted-foreground); font-weight: 600; }
                .rpt-page tbody th { white-space: nowrap; color: var(--foreground); width: 1%; }
                .rpt-page .num { text-align: right; white-space: nowrap; width: 1%; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
                .rpt-bar { position: relative; display: flex; align-items: center; min-height: 20px; }
                .rpt-fill { position: absolute; left: 0; top: 2px; bottom: 2px; border-radius: 4px; background: linear-gradient(90deg, oklch(0.63 0.23 304 / 0.55), #c084fc); }
                .rpt-val { position: relative; padding-left: 6px; font-variant-numeric: tabular-nums; font-size: 12.5px; text-shadow: 0 0 3px var(--background); }
                .rpt-heat { table-layout: fixed; }
                .rpt-heat th, .rpt-heat td { padding: 0; border: 0; text-align: center; }
                .rpt-heat thead th { font-size: 10px; font-weight: 400; height: 18px; }
                .rpt-heat tbody th { font-size: 12px; padding-right: 6px; width: 40px; }
                .rpt-heat td { height: 26px; border: 1px solid var(--background); border-radius: 3px; }
                .rpt-heat td span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
                .rpt-cmp td { font-variant-numeric: tabular-nums; }
                .rpt-faq { display: grid; gap: 10px; }
                .rpt-faq details { border-radius: 14px; background: oklch(0.21 0.034 264.665 / 0.45); border: 1px solid rgba(255,255,255,0.06); padding: 0 18px; }
                .rpt-faq summary { cursor: pointer; padding: 14px 0; font-weight: 600; }
                .rpt-faq p { margin: 0 0 14px; }
                .rpt-cta { margin-top: 56px; text-align: center; padding: 32px 20px; border-radius: 22px; background: linear-gradient(135deg, oklch(0.63 0.23 304 / 0.16), oklch(0.21 0.034 264.665 / 0.5)); border: 1px solid oklch(0.63 0.23 304 / 0.3); }
                .rpt-cta h2 { font-size: 24px; font-weight: 800; margin: 0 0 8px; }
                .rpt-cta p { color: var(--muted-foreground); margin: 0 0 20px; }
                .rpt-cta-btns { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
                @media (max-width: 640px) { .rpt-h1 { font-size: 27px; } .rpt-sub { font-size: 15px; } .rpt-heat tbody th { width: 34px; } }
            ` }} />

            <StaticPageHeader title={r('title')} analyticsCategory="ReportStreamHours" />
            <BlurOrb top={-160} left="50%" w={760} h={460} color="oklch(0.63 0.23 304)" opacity={0.12} />

            <main className="rpt-wrap">
                <nav className="rpt-crumbs" aria-label="Breadcrumb">
                    <ol>
                        <li><RouteLink to="home">MultiStream Hub</RouteLink></li>
                        <li aria-hidden="true"><ChevronRight size={13} /></li>
                        <li aria-current="page">{r('title')}</li>
                    </ol>
                </nav>

                <article>
                    <header className="rpt-hero">
                        <div className="rpt-badge" aria-hidden="true"><BarChart3 size={30} /></div>
                        <div className="rpt-eyebrow">{r('hero.eyebrow')}</div>
                        <h1 className="rpt-h1">{r('hero.title')}</h1>
                        <p className="rpt-sub">{r('hero.subtitle')}</p>
                        <p className="rpt-meta">
                            {r('byline')}<RouteLink to="creator">Hsiung-Shao</RouteLink>
                            {' · '}
                            <time dateTime={REPORT_STREAM_HOURS_META.datePublished}>{REPORT_STREAM_HOURS_META.datePublished}</time>
                            {' · '}
                            {r('asOf')}
                        </p>
                    </header>

                    <section className="rpt-summary" aria-labelledby="rpt-summary-h">
                        <h2 id="rpt-summary-h">{r('summary.title')}</h2>
                        <ul>
                            {[1, 2, 3, 4].map((n) => <li key={n}>{r(`summary.${n}`)}</li>)}
                        </ul>
                    </section>

                    <section className="rpt-section" aria-labelledby="rpt-method-h">
                        <h2 id="rpt-method-h">{r('method.title')}</h2>
                        <p>{r('method.p1')}</p>
                        <p>{r('method.p2')}</p>
                        <p>{r('method.p3')}</p>
                    </section>

                    <section className="rpt-section" aria-labelledby="rpt-hours-h">
                        <h2 id="rpt-hours-h">{r('hours.title')}</h2>
                        <p>{r('hours.p1')}</p>
                        <BarTable
                            caption={r('hours.caption')}
                            labelHead={r('col.hour')}
                            rows={data.byHour.map((value, h) => ({ label: hh(h), value }))}
                            total={data.totalStreams}
                        />
                        <p>{r('hours.p2')}</p>
                    </section>

                    <section className="rpt-section" aria-labelledby="rpt-week-h">
                        <h2 id="rpt-week-h">{r('week.title')}</h2>
                        <p>{r('week.p1')}</p>
                        <table className="rpt-heat">
                            <caption>{r('week.caption')}</caption>
                            <thead>
                                <tr>
                                    <td />
                                    {data.byHour.map((_, h) => (
                                        <th scope="col" key={h} aria-label={hh(h)}>{h % 3 === 0 ? h : ''}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.byDowHour.map((row, d) => (
                                    <tr key={d}>
                                        <th scope="row">{r(`dow.${d + 1}`)}</th>
                                        {row.map((n, h) => (
                                            <td
                                                key={h}
                                                title={`${r(`dow.${d + 1}`)} ${hh(h)}: ${n}`}
                                                style={{ background: `oklch(0.63 0.23 304 / ${(0.06 + 0.94 * (n / heatMax)).toFixed(2)})` }}
                                            >
                                                <span>{n}</span>
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <p>{r('week.p2')}</p>
                        <p className="rpt-note">{r('week.note')}</p>
                    </section>

                    <section className="rpt-section" aria-labelledby="rpt-duration-h">
                        <h2 id="rpt-duration-h">{r('duration.title')}</h2>
                        <p>{r('duration.p1')}</p>
                        <BarTable
                            caption={r('duration.caption')}
                            labelHead={r('col.length')}
                            rows={data.durationBins.map((value, i) => ({ label: r(`duration.bin.${i}`), value }))}
                            total={data.totalStreams}
                        />
                    </section>

                    <section className="rpt-section" aria-labelledby="rpt-segment-h">
                        <h2 id="rpt-segment-h">{r('segment.title')}</h2>
                        <p>{r('segment.p1')}</p>
                        <table className="rpt-cmp">
                            <caption>{r('segment.caption')}</caption>
                            <thead>
                                <tr>
                                    <th scope="col">{r('col.metric')}</th>
                                    <th scope="col" className="num">{r('col.corporate')}</th>
                                    <th scope="col" className="num">{r('col.independent')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {SEGMENT_ROWS.map((k) => {
                                    const fmt = (v: string | number) => (k === 'median' ? tx('reports:hours.unit', { h: v }) : v);
                                    return (
                                        <tr key={k}>
                                            <th scope="row">{r(`segment.row.${k}`)}</th>
                                            <td className="num">{fmt(report.corporate[k])}</td>
                                            <td className="num">{fmt(report.independent[k])}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <p>{r('segment.p2')}</p>
                    </section>

                    <section className="rpt-section" aria-labelledby="rpt-twitch-h">
                        <h2 id="rpt-twitch-h">{r('twitch.title')}</h2>
                        <p>{r('twitch.p1')}</p>
                        <BarTable
                            caption={r('twitch.caption')}
                            labelHead={r('col.category')}
                            rows={data.twitchTopCategories.map((c) => ({ label: c.name, value: c.streams }))}
                            total={twitchTotal}
                        />
                    </section>

                    <section className="rpt-section" aria-labelledby="rpt-meaning-h">
                        <h2 id="rpt-meaning-h">{r('meaning.title')}</h2>
                        <p>{r('meaning.viewers')}</p>
                        <p>{r('meaning.streamers')}</p>
                    </section>

                    <section className="rpt-section" aria-labelledby="rpt-limits-h">
                        <h2 id="rpt-limits-h">{r('limits.title')}</h2>
                        <ul>
                            {[1, 2, 3, 4].map((n) => <li key={n}>{r(`limits.${n}`)}</li>)}
                        </ul>
                    </section>

                    <section className="rpt-section" aria-labelledby="rpt-faq-h">
                        <h2 id="rpt-faq-h">{r('faq.title')}</h2>
                        <div className="rpt-faq">
                            {Array.from({ length: REPORT_STREAM_HOURS_META.faqCount }, (_, i) => i + 1).map((n) => (
                                <details key={n} open={n === 1}>
                                    <summary>{r(`faq.q${n}`)}</summary>
                                    <p>{r(`faq.a${n}`)}</p>
                                </details>
                            ))}
                        </div>
                    </section>
                </article>

                <section className="rpt-cta">
                    <h2>{r('cta.title')}</h2>
                    <p>{r('cta.subtitle')}</p>
                    <div className="rpt-cta-btns">
                        <Button asChild size="lg" className="rounded-full px-8">
                            <RouteLink to="schedule" onClick={() => logEvent('ReportStreamHours', 'click_cta', 'schedule')}>
                                {r('cta.schedule')} <ArrowRight size={16} />
                            </RouteLink>
                        </Button>
                        <Button asChild size="lg" variant="outline" className="rounded-full px-8">
                            <RouteLink to="canvas" onClick={() => logEvent('ReportStreamHours', 'click_cta', 'canvas')}>
                                {r('cta.canvas')}
                            </RouteLink>
                        </Button>
                    </div>
                </section>

                <RelatedLinks
                    links={[
                        { to: 'schedule', label: tx('reports:cta.schedule') },
                        { to: guidePage('schedule'), label: tx('tutorial:article.schedule.title') },
                        { to: guidePage('watch-multiple-youtube-streams'), label: tx('tutorial:ytGuide.title') },
                        { to: guidePage('watch-multiple-twitch-streams'), label: tx('tutorial:twitchGuide.title') },
                    ]}
                />

                <SiteFooter analyticsCategory="ReportStreamHours" />
            </main>
        </div>
    );
}

export default ReportStreamHoursPage;
