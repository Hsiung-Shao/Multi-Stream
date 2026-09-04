// PrivacyPage — 依 multistream-hub-design-system 的 PrivacyPage.jsx 重建(editorial 版:
// blur orbs、綠色 gradient hero(shield-check)、pills、local-first 強調區、
// 收集 / 不收集雙欄對比、匿名頻道統計、整合與廣告卡、footer)。在 design 視覺精華區
// 之後,完整保留 next 既有的 9 段法律條文(section1~9 多語系 i18n,用同套 editorial 卡片排版),
// 不因視覺重建而丟失生效中的法律內容。保留 next 既有 props/header。
// SEO 由 App.tsx 在 case 'privacy' 外層統一處理,此處不重複以免雙標題。

import type { ReactNode } from 'react';
import {
  ArrowLeft, Globe, Sun, Moon,
  ShieldCheck, Lock, HardDrive, CodeXml, BadgeDollarSign, BarChart3,
  Users, MousePointerClick, Clock, X, ShieldOff, CheckCircle2,
  Megaphone, Eye, Database, FileText, AlertCircle, Cookie,
  type LucideIcon,
} from 'lucide-react';
import { Button } from './ui/button';
import { RouteLink } from './Navigation/RouteLink';
import { SiteFooter } from './SiteFooter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useTranslation } from 'react-i18next';
import { logEvent } from '../utils/analytics';
import { IconChip, BlurOrb, SectionHead } from './ui/ds-primitives';

interface PrivacyPageProps {
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  // 站內導覽由全站共用 <SiteFooter> 負責，不再由父層注入 callback（terms 頁不存在，舊的 onNavigateToTerms 已移除）
}

type TFn = (key: string, options?: Record<string, unknown>) => string;

const GA_PRIVACY_URL = 'https://policies.google.com/privacy';
const TWITCH_PRIVACY_URL = 'https://www.twitch.tv/p/legal/privacy-policy';
const FEEDBACK_MAIL = 'feedback@multistreaming.org';
const MONO = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";

const GREEN = '#10b981';
const GREEN_LIGHT = '#4ade80';

export function PrivacyPage({ theme, onThemeToggle }: PrivacyPageProps) {
  const { t, i18n } = useTranslation(['common', 'privacy', 'about']);
  const tx = t as unknown as TFn;
  const locale = i18n.language;

  const languages = [
    { value: 'zh-TW' as const, label: tx('common:chineseTraditional') },
    { value: 'zh-CN' as const, label: tx('common:chineseSimplified') },
    { value: 'en' as const, label: tx('common:english') },
    { value: 'ja' as const, label: tx('common:japanese') },
    { value: 'ko' as const, label: tx('common:korean') },
  ];

  // hero pills(design 新增,defaultValue 帶 design 中文)
  const pills: { icon: LucideIcon; label: string }[] = [
    { icon: HardDrive, label: tx('privacy:pillLocalFirst', { defaultValue: '本地優先' }) },
    { icon: CodeXml, label: tx('privacy:pillFrontend', { defaultValue: '純前端' }) },
    { icon: BadgeDollarSign, label: tx('privacy:pillNoSell', { defaultValue: '不賣資料' }) },
    { icon: BarChart3, label: tx('privacy:pillAnonStats', { defaultValue: '僅匿名統計' }) },
  ];

  // 我們收集什麼(design 新增,defaultValue 帶 design 中文)
  const collect: { icon: LucideIcon; text: string }[] = [
    { icon: Users, text: tx('privacy:collect1', { defaultValue: '匿名訪客數量（透過 Google Analytics 4）' }) },
    { icon: MousePointerClick, text: tx('privacy:collect2', { defaultValue: '頁面瀏覽事件（不含個人識別資訊）' }) },
    { icon: Clock, text: tx('privacy:collect3', { defaultValue: '串流播放時間總計（聚合資料，無法回溯到個人）' }) },
    { icon: BarChart3, text: tx('privacy:collect4', { defaultValue: '被加入的 YouTube 頻道 ID（僅匿名聚合計數，不含任何使用者識別碼）' }) },
  ];

  // 我們不收集什麼(design 新增)
  const never: string[] = [
    tx('privacy:never1', { defaultValue: '「哪個使用者」收藏了哪些頻道（頻道統計是匿名聚合的，無法回溯到你）' }),
    tx('privacy:never2', { defaultValue: '你看了什麼直播、看了多久' }),
    tx('privacy:never3', { defaultValue: '你的 Twitch / YouTube 帳號內容' }),
    tx('privacy:never4', { defaultValue: '任何能識別你個人的資訊' }),
  ];

  // 完整法律條文(沿用 next 既有 section1~9 多語系 key),用同套 editorial 卡片排版。
  const sections: { icon: LucideIcon; hue: string; title: string; body: ReactNode }[] = [
    {
      icon: Eye, hue: '#60a5fa', title: tx('privacy:section1.title'),
      body: <PvList items={[tx('privacy:section1.item1'), tx('privacy:section1.item2'), tx('privacy:section1.item3')]} />,
    },
    {
      icon: BarChart3, hue: GREEN_LIGHT, title: tx('privacy:section1_5.title'),
      body: (
        <>
          <p className="pv-p">{tx('privacy:section1_5.intro')}</p>
          <PvList
            items={[
              tx('privacy:section1_5.item1'), tx('privacy:section1_5.item2'),
              tx('privacy:section1_5.item3'), tx('privacy:section1_5.item4'),
            ]}
          />
          <p className="pv-p" style={{ marginTop: 12 }}>
            {tx('privacy:section1_5.item5')}{' '}
            <a className="pv-inline-link" href={GA_PRIVACY_URL} target="_blank" rel="noopener noreferrer">{GA_PRIVACY_URL}</a>
          </p>
        </>
      ),
    },
    {
      icon: BarChart3, hue: '#c084fc', title: tx('privacy:section1_5_5.title'),
      body: (
        <>
          <p className="pv-p">{tx('privacy:section1_5_5.intro')}</p>
          <PvList
            items={[
              tx('privacy:section1_5_5.item1'), tx('privacy:section1_5_5.item2'),
              tx('privacy:section1_5_5.item3'), tx('privacy:section1_5_5.item4'),
              tx('privacy:section1_5_5.item5'), tx('privacy:section1_5_5.item6'),
            ]}
          />
        </>
      ),
    },
    {
      icon: Database, hue: '#a855f7', title: tx('privacy:section2.title'),
      body: (
        <>
          <p className="pv-p">{tx('privacy:section2.intro')}</p>
          <PvList items={[tx('privacy:section2.item1'), tx('privacy:section2.item2'), tx('privacy:section2.item3')]} />
          <p className="pv-p" style={{ marginTop: 12, fontWeight: 600, color: 'var(--foreground)' }}>{tx('privacy:section2.youCan')}</p>
          <PvList items={[tx('privacy:section2.item4'), tx('privacy:section2.item5')]} />
        </>
      ),
    },
    {
      icon: FileText, hue: '#f87171', title: tx('privacy:section3.title'),
      body: (
        <>
          <PvList items={[tx('privacy:section3.item1'), tx('privacy:section3.item2'), tx('privacy:section3.item3')]} />
          <div style={{ marginTop: 10, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p className="pv-p">
              {tx('privacy:section3.item4')}{' '}
              <a className="pv-inline-link" href={TWITCH_PRIVACY_URL} target="_blank" rel="noopener noreferrer">{TWITCH_PRIVACY_URL}</a>
            </p>
            <p className="pv-p">
              {tx('privacy:section3.item5')}{' '}
              <a className="pv-inline-link" href={GA_PRIVACY_URL} target="_blank" rel="noopener noreferrer">{GA_PRIVACY_URL}</a>
            </p>
          </div>
        </>
      ),
    },
    {
      icon: Cookie, hue: '#facc15', title: tx('privacy:section4.title'),
      body: (
        <>
          <p className="pv-p">{tx('privacy:section4.intro')}</p>
          <PvList
            items={[
              tx('privacy:section4.item1'), tx('privacy:section4.item2'), tx('privacy:section4.item3'),
              tx('privacy:section4.item4'), tx('privacy:section4.item5'), tx('privacy:section4.item6'),
            ]}
          />
        </>
      ),
    },
    {
      icon: Megaphone, hue: '#fb923c', title: tx('privacy:section5.title'),
      body: (
        <>
          <p className="pv-p">{tx('privacy:section5.intro')}</p>
          <PvList
            items={[tx('privacy:section5.item1'), tx('privacy:section5.item2')]}
          />
          <p className="pv-p" style={{ marginTop: 12 }}>
            {tx('privacy:section5.item3')}{' '}
            <a className="pv-inline-link" href={GA_PRIVACY_URL} target="_blank" rel="noopener noreferrer">{GA_PRIVACY_URL}</a>
          </p>
          <PvList items={[tx('privacy:section5.item4'), tx('privacy:section5.item5')]} />
        </>
      ),
    },
    {
      icon: Cookie, hue: '#22d3ee', title: tx('privacy:section5_5.title'),
      body: (
        <>
          <p className="pv-p">{tx('privacy:section5_5.intro')}</p>
          <PvList
            items={[
              tx('privacy:section5_5.item1'), tx('privacy:section5_5.item2'), tx('privacy:section5_5.item3'),
              tx('privacy:section5_5.item4'), tx('privacy:section5_5.item5'),
            ]}
          />
        </>
      ),
    },
    {
      icon: Users, hue: '#34d399', title: tx('privacy:section6.title'),
      body: (
        <>
          <p className="pv-p">{tx('privacy:section6.intro')}</p>
          <PvList items={[tx('privacy:section6.item1'), tx('privacy:section6.item2'), tx('privacy:section6.item3'), tx('privacy:section6.item4')]} />
          <p className="pv-p" style={{ marginTop: 12 }}>
            {tx('privacy:section6.contact')}{' '}
            <a className="pv-inline-link" href={`mailto:${FEEDBACK_MAIL}`}>{FEEDBACK_MAIL}</a>
            {tx('privacy:section6.responseTime')}
          </p>
        </>
      ),
    },
    {
      icon: ShieldCheck, hue: '#f472b6', title: tx('privacy:section7.title'),
      body: <p className="pv-p">{tx('privacy:section7.content')}</p>,
    },
    {
      icon: FileText, hue: '#2dd4bf', title: tx('privacy:section8.title'),
      body: <p className="pv-p">{tx('privacy:section8.content')}</p>,
    },
    {
      icon: AlertCircle, hue: '#a855f7', title: tx('privacy:section9.title'),
      body: (
        <p className="pv-p">
          {tx('privacy:section9.content')}{' '}
          <a className="pv-inline-link" href={`mailto:${FEEDBACK_MAIL}`}>{FEEDBACK_MAIL}</a>
        </p>
      ),
    },
  ];

  return (
    <div className="pv-page">
      <style>{`
        .pv-page { position: relative; min-height: 100vh; overflow: hidden; background: var(--background); color: var(--foreground); font-family: var(--font-sans); }
        .pv-wrap { position: relative; z-index: 1; max-width: 1000px; margin: 0 auto; padding: 0 24px; }

        .pv-hero { padding-top: 132px; padding-bottom: 24px; text-align: center; }
        .pv-hero-badge { width: 88px; height: 88px; border-radius: 24px; margin: 0 auto 28px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, ${GREEN}, ${GREEN_LIGHT}); box-shadow: 0 24px 60px -16px rgba(16,185,129,0.6), inset 0 1px 0 rgba(255,255,255,0.25); }
        .pv-hero-title { font-size: 52px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.05; margin: 0; background: linear-gradient(90deg, var(--foreground) 0%, color-mix(in oklch, var(--foreground) 70%, var(--muted-foreground)) 55%, var(--muted-foreground) 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; }
        .pv-hero-sub { font-size: 18px; color: var(--muted-foreground); line-height: 1.7; max-width: 620px; margin: 20px auto 0; }
        .pv-hero-dates { display: flex; flex-wrap: wrap; gap: 8px 24px; justify-content: center; margin-top: 16px; font-size: 13px; color: var(--muted-foreground); font-family: ${MONO}; }
        .pv-pills { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 28px; }
        .pv-pill { display: inline-flex; align-items: center; gap: 7px; padding: 7px 14px; border-radius: 9999px; background: oklch(0.21 0.034 264.665 / 0.5); border: 1px solid rgba(255,255,255,0.09); font-size: 13px; font-weight: 500; color: var(--foreground); }

        .pv-section { padding-top: 72px; }
        .pv-section.tight { padding-top: 40px; }

        .pv-highlight { padding: 28px; border-radius: 20px; background: linear-gradient(135deg, rgba(16,185,129,0.1), rgba(16,185,129,0.02)); border: 1px solid rgba(16,185,129,0.25); display: flex; align-items: flex-start; gap: 18px; }
        .pv-highlight-chip { width: 50px; height: 50px; border-radius: 14px; background: rgba(16,185,129,0.15); color: ${GREEN}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .pv-highlight-eyebrow { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: ${GREEN}; margin-bottom: 6px; }
        .pv-highlight-title { font-size: 19px; font-weight: 800; margin: 0 0 8px; color: var(--foreground); }
        .pv-highlight-desc { font-size: 15px; color: var(--muted-foreground); margin: 0; line-height: 1.7; }

        .pv-grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 18px; }
        .pv-card { padding: 24px; border-radius: 18px; background: oklch(0.21 0.034 264.665 / 0.45); border: 1px solid rgba(255,255,255,0.07); transition: transform .25s ease, border-color .25s ease; }
        .pv-card:hover { transform: translateY(-3px); border-color: oklch(0.63 0.23 304 / 0.4); }
        .pv-card-head { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
        .pv-card-title { font-size: 17px; font-weight: 700; margin: 0; color: var(--foreground); }
        .pv-rows { display: flex; flex-direction: column; gap: 12px; }
        .pv-row { display: flex; align-items: flex-start; gap: 11px; }
        .pv-row-icon { display: flex; margin-top: 1px; flex-shrink: 0; }
        .pv-row-text { font-size: 14px; color: var(--muted-foreground); line-height: 1.55; }

        .pv-stat { display: flex; gap: 18px; align-items: flex-start; padding: 26px; border-radius: 18px; background: linear-gradient(135deg, rgba(96,165,250,0.08), oklch(0.21 0.034 264.665 / 0.5)); border: 1px solid rgba(96,165,250,0.2); }
        .pv-stat-text { font-size: 15px; color: var(--muted-foreground); margin: 0; line-height: 1.75; align-self: center; }

        .pv-policy { display: flex; flex-direction: column; gap: 14px; }
        .pv-policy-card { padding: 22px 24px; border-radius: 16px; background: oklch(0.21 0.034 264.665 / 0.4); border: 1px solid rgba(255,255,255,0.06); }
        .pv-policy-head { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
        .pv-policy-title { font-size: 16.5px; font-weight: 700; margin: 0; color: var(--foreground); line-height: 1.4; }
        .pv-policy-body { padding-left: 54px; }
        .pv-p { font-size: 14px; color: var(--muted-foreground); margin: 0; line-height: 1.7; }
        .pv-p + .pv-p { margin-top: 8px; }
        .pv-ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; }
        .pv-li { display: flex; gap: 10px; font-size: 14px; color: var(--muted-foreground); line-height: 1.6; }
        .pv-li::before { content: ""; flex-shrink: 0; width: 5px; height: 5px; border-radius: 50%; background: var(--primary); margin-top: 9px; }
        .pv-inline-link { color: #60a5fa; text-decoration: none; word-break: break-all; }
        .pv-inline-link:hover { text-decoration: underline; }

        .pv-note { margin-top: 32px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.07); }
        .pv-note p { font-size: 13px; color: var(--muted-foreground); margin: 0; font-family: ${MONO}; }

        .pv-copy { font-size: 13px; color: var(--muted-foreground); margin: 24px 0 0; }
        .pv-updated { font-size: 12.5px; color: var(--muted-foreground); opacity: 0.8; margin: 6px 0 0; font-family: ${MONO}; }

        /* a11y: 鍵盤聚焦可見性(自訂連結/按鈕,header 的 shadcn Button 自帶 ring) */
        .pv-page a:focus-visible, .pv-page button:focus-visible { outline: 2px solid var(--ring, oklch(0.63 0.23 304)); outline-offset: 3px; border-radius: 6px; }

        @media (max-width: 560px) { .pv-hero-title { font-size: 38px; } .pv-policy-body { padding-left: 0; } }
      `}</style>

      {/* Header Navigation(保留 next 既有,token 化) */}
      <div className="relative z-10 border-b border-border bg-card/60 px-6 py-4 backdrop-blur">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Button
            asChild
            variant="ghost"
            className="text-muted-foreground hover:text-foreground hover:bg-transparent"
          >
            <RouteLink to="home">
              <ArrowLeft className="size-4 mr-2" />
              {tx('about:backToHome')}
            </RouteLink>
          </Button>

          <div className="flex items-center gap-2">
            <Select value={locale} onValueChange={(value: string) => i18n.changeLanguage(value)}>
              <SelectTrigger className="min-w-[140px] bg-card border-border text-foreground">
                <Globe className="size-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((lang) => (
                  <SelectItem key={lang.value} value={lang.value}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                onThemeToggle();
                logEvent('PrivacyPage', 'toggle_theme', theme === 'dark' ? 'light' : 'dark');
              }}
              className="text-muted-foreground hover:text-foreground hover:bg-transparent"
            >
              {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </Button>
          </div>
        </div>
      </div>

      <BlurOrb top={-160} left="50%" w={760} h={460} color={GREEN} opacity={0.1} />
      <BlurOrb top={480} right={-160} w={520} h={420} color="oklch(0.63 0.23 304)" opacity={0.08} />

      <div className="pv-wrap">
        {/* ---------- Hero ---------- */}
        <section className="pv-hero">
          <div className="pv-hero-badge"><ShieldCheck size={42} color="white" /></div>
          <h1 className="pv-hero-title">{tx('privacy:title')}</h1>
          <p className="pv-hero-sub">
            {tx('privacy:heroSub', { defaultValue: 'MultiStream Hub 是純前端工具。你的個人資料留在你自己的瀏覽器裡，我們的伺服器看不到。' })}
          </p>
          <div className="pv-hero-dates">
            <span>{tx('privacy:effectiveDate')}{tx('privacy:effectiveDateValue')}</span>
            <span>{tx('privacy:lastUpdated')}{tx('privacy:lastUpdatedValue')}</span>
          </div>
          <div className="pv-pills">
            {pills.map((p) => {
              const PillIcon = p.icon;
              return (
                <span className="pv-pill" key={p.label}>
                  <PillIcon size={14} color={GREEN_LIGHT} /> {p.label}
                </span>
              );
            })}
          </div>
        </section>

        {/* ---------- Local-first highlight ---------- */}
        <section className="pv-section tight">
          <div className="pv-highlight">
            <div className="pv-highlight-chip"><Lock size={24} /></div>
            <div className="flex-1">
              <div className="pv-highlight-eyebrow">{tx('privacy:localFirstEyebrow', { defaultValue: 'Local first' })}</div>
              <h3 className="pv-highlight-title">{tx('privacy:localFirstTitle', { defaultValue: '你的資料留在你這裡' })}</h3>
              <p className="pv-highlight-desc">
                {tx('privacy:localFirstDesc', { defaultValue: '你的收藏、分類、標籤、設定與布局全部儲存在你自己的 LocalStorage 與 IndexedDB，伺服器看不到。唯一的例外是被加入的 YouTube 頻道 ID 會以匿名、聚合的方式回報，用來統計熱門頻道 —— 這筆資料不會綁定到你或你的裝置。' })}
              </p>
            </div>
          </div>
        </section>

        {/* ---------- Collect vs never ---------- */}
        <section className="pv-section">
          <SectionHead color="#10b981"
            eyebrow={tx('privacy:transparencyEyebrow', { defaultValue: 'Transparency' })}
            title={tx('privacy:collectTitle', { defaultValue: '我們收集 / 不收集什麼' })}
            sub={tx('privacy:collectSub', { defaultValue: '把界線講清楚：我們只看匿名聚合數字，看不到任何指向你個人的東西。' })}
          />
          <div className="pv-grid2">
            {/* collect */}
            <div className="pv-card">
              <div className="pv-card-head">
                <IconChip icon={CheckCircle2} hue={GREEN_LIGHT} size={42} />
                <h3 className="pv-card-title">{tx('privacy:collectHeading', { defaultValue: '我們收集什麼' })}</h3>
              </div>
              <div className="pv-rows">
                {collect.map((it) => {
                  const RowIcon = it.icon;
                  return (
                    <div className="pv-row" key={it.text}>
                      <span className="pv-row-icon" style={{ color: GREEN_LIGHT }}><RowIcon size={16} /></span>
                      <span className="pv-row-text">{it.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* never */}
            <div className="pv-card">
              <div className="pv-card-head">
                <IconChip icon={ShieldOff} hue="#f87171" size={42} />
                <h3 className="pv-card-title">{tx('privacy:neverHeading', { defaultValue: '我們不收集什麼' })}</h3>
              </div>
              <div className="pv-rows">
                {never.map((text) => (
                  <div className="pv-row" key={text}>
                    <span className="pv-row-icon" style={{ color: '#f87171' }}><X size={16} /></span>
                    <span className="pv-row-text">{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Anonymous channel stats ---------- */}
        <section className="pv-section">
          <SectionHead color="#10b981"
            eyebrow={tx('privacy:howEyebrow', { defaultValue: 'How it works' })}
            title={tx('privacy:anonStatsTitle', { defaultValue: '匿名頻道統計' })}
          />
          <div className="pv-stat">
            <IconChip icon={BarChart3} hue="#60a5fa" size={50} />
            <p className="pv-stat-text">
              {tx('privacy:anonStatsDesc', { defaultValue: '當你把一個 YouTube 頻道加入收藏時，我們只會把該頻道的 ID 傳給伺服器做計數，用來了解哪些頻道最受歡迎、改善推薦。我們不會記錄「是誰」或「哪台裝置」加入，不附帶 IP、帳號或任何識別碼，因此這份統計無法回溯到你個人。你個人的收藏清單本身仍然只留在你的瀏覽器本地。' })}
            </p>
          </div>
        </section>

        {/* ---------- Full policy(保留 next 既有 9 段法律條文) ---------- */}
        <section className="pv-section">
          <SectionHead color="#10b981"
            eyebrow={tx('privacy:detailsEyebrow', { defaultValue: 'Full policy' })}
            title={tx('privacy:detailsTitle', { defaultValue: '完整隱私權條款' })}
            sub={tx('privacy:intro')}
          />
          <div className="pv-policy">
            {sections.map((s) => {
              const SecIcon = s.icon;
              return (
                <div className="pv-policy-card" key={s.title}>
                  <div className="pv-policy-head">
                    <IconChip icon={SecIcon} hue={s.hue} size={40} />
                    <h2 className="pv-policy-title">{s.title}</h2>
                  </div>
                  <div className="pv-policy-body">{s.body}</div>
                </div>
              );
            })}
          </div>

          <div className="pv-note">
            <p>{tx('privacy:footerNote')}</p>
          </div>
        </section>

        {/* ---------- Footer ---------- */}
        <SiteFooter analyticsCategory="PrivacyPage" />
      </div>
    </div>
  );
}

// 條列(原 list-disc 的 token 化版)
function PvList({ items }: { items: string[] }): ReactNode {
  return (
    <ul className="pv-ul">
      {items.map((it) => (
        <li className="pv-li" key={it}>{it}</li>
      ))}
    </ul>
  );
}
