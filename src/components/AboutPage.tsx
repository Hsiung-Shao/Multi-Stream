// AboutPage — 依 multistream-hub-design-system 的 AboutPage.jsx 重建(editorial 版:
// blur orbs、gradient hero、hued icon chips(AbChip = IconChip)、eyebrow section、
// spotlight 三卡、feature grid、編號技術列表、creator 卡、contact 列、terms、
// local-first 隱私區、footer)。header 改用三靜態頁共用的 StaticPageHeader,保留多語系 i18n。
// SEO 由 App.tsx 在 case 'about' 外層統一處理,此處不重複以免雙標題。

import {
  Globe,
  Tv, Radio, Zap, LayoutGrid, MessagesSquare, Volume2, Star, Smartphone,
  Languages, ShieldCheck, Search, Youtube, RefreshCw,
  CodeXml, RadioTower, Database, Gauge,
  Gift, Github, UserX, MessageCircle, Coffee, HeartHandshake, AtSign, Mail,
  ArrowUpRight, ArrowRight, Copyright, Megaphone,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { logEvent } from '../utils/analytics';
import { useUIStore } from '../store/useUIStore';
import { StaticPageHeader } from './StaticPageHeader';
import { RouteLink } from './Navigation/RouteLink';
import { IconChip, BlurOrb, SectionHead } from './ui/ds-primitives';
import { GITHUB_URL, DISCORD_URL, COFFEE_URL, PATREON_URL, X_URL } from '../config/links';

type TFn = (key: string, options?: Record<string, unknown>) => string;

const MONO = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";

export function AboutPage() {
  const { t } = useTranslation(['about', 'common']);
  const tx = t as unknown as TFn;
  const openModal = useUIStore((s) => s.openModal);

  // spotlight 三卡 — 沿用既有 feature1 / feature10 / feature12 多語系 key。
  const spotlight: { icon: LucideIcon; hue: string; title: string; desc: string }[] = [
    { icon: Tv, hue: '#a855f7', title: tx('about:feature1.title'), desc: tx('about:feature1.description') },
    { icon: Radio, hue: '#10b981', title: tx('about:feature10.title'), desc: tx('about:feature10.description') },
    { icon: Zap, hue: '#ec4899', title: tx('about:feature12.title'), desc: tx('about:feature12.description') },
  ];

  // feature grid — 沿用既有 feature2-9 / feature11 / feature13 多語系 key,對齊 design 十項。
  const features: { icon: LucideIcon; hue: string; title: string; desc: string }[] = [
    { icon: LayoutGrid, hue: '#60a5fa', title: tx('about:feature2.title'), desc: tx('about:feature2.description') },
    { icon: MessagesSquare, hue: '#c084fc', title: tx('about:feature3.title'), desc: tx('about:feature3.description') },
    { icon: Volume2, hue: '#facc15', title: tx('about:feature4.title'), desc: tx('about:feature4.description') },
    { icon: Star, hue: '#a855f7', title: tx('about:feature5.title'), desc: tx('about:feature5.description') },
    { icon: Smartphone, hue: '#60a5fa', title: tx('about:feature6.title'), desc: tx('about:feature6.description') },
    { icon: Languages, hue: '#4ade80', title: tx('about:feature7.title'), desc: tx('about:feature7.description') },
    { icon: ShieldCheck, hue: '#ef4444', title: tx('about:feature8.title'), desc: tx('about:feature8.description') },
    { icon: Search, hue: '#9146FF', title: tx('about:feature9.title'), desc: tx('about:feature9.description') },
    { icon: Youtube, hue: '#FF3D3D', title: tx('about:feature11.title'), desc: tx('about:feature11.description') },
    { icon: RefreshCw, hue: '#22d3ee', title: tx('about:feature13.title'), desc: tx('about:feature13.description') },
  ];

  // 技術特色 — 沿用既有 tech1-5 多語系 key。
  const tech: { icon: LucideIcon; hue: string; title: string; desc: string }[] = [
    { icon: CodeXml, hue: '#c084fc', title: tx('about:tech1.title'), desc: tx('about:tech1.description') },
    { icon: RadioTower, hue: '#60a5fa', title: tx('about:tech2.title'), desc: tx('about:tech2.description') },
    { icon: Database, hue: '#4ade80', title: tx('about:tech3.title'), desc: tx('about:tech3.description') },
    { icon: Globe, hue: '#a855f7', title: tx('about:tech4.title'), desc: tx('about:tech4.description') },
    { icon: Gauge, hue: '#facc15', title: tx('about:tech5.title'), desc: tx('about:tech5.description') },
  ];

  // hero pills(design 新增,defaultValue 帶 design 中文)
  const pills: { icon: LucideIcon; label: string }[] = [
    { icon: Gift, label: tx('about:pillFree', { defaultValue: '完全免費' }) },
    { icon: Github, label: tx('about:pillOpenSource', { defaultValue: '開源專案' }) },
    { icon: CodeXml, label: tx('about:pillFrontend', { defaultValue: '純前端' }) },
    { icon: UserX, label: tx('about:pillNoSignup', { defaultValue: '無需註冊' }) },
  ];

  // 使用條款(design 新增 — 沿用既有 terms1-3 多語系 key)
  const terms: { icon: LucideIcon; hue: string; text: string }[] = [
    { icon: Gift, hue: '#4ade80', text: tx('about:terms1') },
    { icon: Copyright, hue: '#60a5fa', text: tx('about:terms2') },
    { icon: Megaphone, hue: '#facc15', text: tx('about:terms3') },
  ];

  return (
    <div className="ab-page">
      <style>{`
        /* overflow: clip(非 hidden):裁切 BlurOrb 同時不建立 scroll container,sticky header 才會生效 */
        .ab-page { position: relative; min-height: 100vh; overflow: clip; background: var(--background); color: var(--foreground); font-family: var(--font-sans); }
        .ab-wrap { position: relative; z-index: 1; max-width: 1040px; margin: 0 auto; padding: 0 24px; }

        .ab-hero { padding-top: 132px; padding-bottom: 24px; text-align: center; }
        .ab-hero-badge { width: 88px; height: 88px; border-radius: 24px; margin: 0 auto 28px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, oklch(0.63 0.23 304), #c084fc); box-shadow: 0 24px 60px -16px oklch(0.63 0.23 304 / 0.7), inset 0 1px 0 rgba(255,255,255,0.25); }
        .ab-hero-title { font-size: 56px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.05; margin: 0; background: linear-gradient(90deg, var(--foreground) 0%, color-mix(in oklch, var(--foreground) 70%, var(--muted-foreground)) 55%, var(--muted-foreground) 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; }
        .ab-hero-sub { font-size: 18px; color: var(--muted-foreground); line-height: 1.7; max-width: 640px; margin: 20px auto 0; }
        .ab-pills { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 28px; }
        .ab-pill { display: inline-flex; align-items: center; gap: 7px; padding: 7px 14px; border-radius: 9999px; background: oklch(0.21 0.034 264.665 / 0.5); border: 1px solid rgba(255,255,255,0.09); font-size: 13px; font-weight: 500; color: var(--foreground); }

        .ab-section { padding-top: 76px; }

        .ab-spotlight { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-bottom: 18px; }
        .ab-spot-card { position: relative; overflow: hidden; padding: 24px; border-radius: 18px; }
        .ab-spot-orb { position: absolute; top: -40px; right: -40px; width: 140px; height: 140px; border-radius: 50%; filter: blur(40px); opacity: 0.12; pointer-events: none; }
        .ab-spot-title { font-size: 18px; font-weight: 700; margin: 18px 0 8px; color: var(--foreground); }
        .ab-spot-desc { font-size: 14px; color: var(--muted-foreground); margin: 0; line-height: 1.6; }

        .ab-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(232px, 1fr)); gap: 14px; }
        .ab-card { display: flex; gap: 14px; padding: 18px; border-radius: 16px; background: oklch(0.21 0.034 264.665 / 0.45); border: 1px solid rgba(255,255,255,0.06); transition: transform .25s ease, border-color .25s ease, background .25s ease; }
        .ab-card:hover { transform: translateY(-3px); border-color: oklch(0.63 0.23 304 / 0.45); }
        .ab-card-body { min-width: 0; }
        .ab-card-title { font-size: 14.5px; font-weight: 700; margin: 2px 0 5px; color: var(--foreground); }
        .ab-card-desc { font-size: 12.5px; color: var(--muted-foreground); margin: 0; line-height: 1.55; }

        .ab-tech { border-radius: 18px; overflow: hidden; border: 1px solid rgba(255,255,255,0.07); background: oklch(0.21 0.034 264.665 / 0.4); }
        .ab-tech-row { display: flex; align-items: center; gap: 16px; padding: 18px 22px; }
        .ab-tech-row + .ab-tech-row { border-top: 1px solid rgba(255,255,255,0.06); }
        .ab-tech-num { font-family: ${MONO}; font-size: 12px; color: var(--muted-foreground); width: 24px; flex-shrink: 0; }
        .ab-tech-body { flex: 1; min-width: 0; }
        .ab-tech-title { font-size: 15px; font-weight: 700; margin: 0 0 3px; color: var(--foreground); }
        .ab-tech-desc { font-size: 13px; color: var(--muted-foreground); margin: 0; line-height: 1.5; }

        .ab-creator { display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-start; padding: 28px; border-radius: 20px; background: linear-gradient(135deg, oklch(0.63 0.23 304 / 0.1), oklch(0.21 0.034 264.665 / 0.5)); border: 1px solid oklch(0.63 0.23 304 / 0.18); }
        .ab-avatar { width: 72px; height: 72px; border-radius: 20px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, oklch(0.63 0.23 304), #c084fc); font-size: 30px; font-weight: 800; color: #fff; box-shadow: 0 16px 36px -12px oklch(0.63 0.23 304 / 0.6); }
        .ab-creator-body { flex: 1; min-width: 260px; }
        .ab-creator-name { font-size: 20px; font-weight: 800; margin: 0; color: var(--foreground); }
        .ab-creator-role { font-size: 13px; color: #c084fc; font-weight: 600; }
        .ab-creator-desc { font-size: 14.5px; color: var(--muted-foreground); line-height: 1.7; margin: 12px 0 0; }
        .ab-creator-link { color: inherit; text-decoration: none; }
        .ab-creator-link:hover { color: #c084fc; }
        .ab-creator-more { display: inline-flex; align-items: center; gap: 6px; margin-top: 12px; font-size: 13.5px; font-weight: 600; color: #c084fc; text-decoration: none; }
        .ab-creator-more:hover { text-decoration: underline; }
        .ab-social-row { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 20px; }
        .ab-social { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 9999px; text-decoration: none; font-size: 14px; font-weight: 600; transition: transform .2s ease, box-shadow .2s ease; }
        .ab-social:hover { transform: translateY(-2px); }
        .ab-social.primary { background: var(--primary); color: #fff; box-shadow: 0 12px 28px -12px oklch(0.63 0.23 304 / 0.7); }
        .ab-social.ghost { background: oklch(0.21 0.034 264.665 / 0.5); color: var(--foreground); border: 1px solid rgba(255,255,255,0.1); }
        .ab-social.coffee { background: linear-gradient(90deg, #ec4899 0%, #9333ea 100%); color: #fff; }
        .ab-social.patreon { background: #ff424d; color: #fff; }

        .ab-contact { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
        .ab-link-row { display: flex; align-items: center; gap: 16px; padding: 20px; border-radius: 16px; text-decoration: none; background: oklch(0.21 0.034 264.665 / 0.45); border: 1px solid rgba(255,255,255,0.07); transition: background .2s ease, border-color .2s ease; cursor: pointer; font-family: var(--font-sans); text-align: left; color: inherit; width: 100%; }
        .ab-link-row:hover { background: oklch(0.21 0.034 264.665 / 0.7); border-color: oklch(0.63 0.23 304 / 0.4); }
        .ab-link-body { flex: 1; min-width: 0; }
        .ab-link-title { font-size: 15.5px; font-weight: 700; margin: 0 0 3px; color: var(--foreground); }
        .ab-link-desc { font-size: 13px; color: var(--muted-foreground); margin: 0; }

        .ab-terms { display: flex; flex-direction: column; gap: 14px; }
        .ab-term { display: flex; gap: 16px; padding: 18px 20px; border-radius: 14px; background: oklch(0.21 0.034 264.665 / 0.4); border: 1px solid rgba(255,255,255,0.06); }
        .ab-term-text { font-size: 14.5px; color: var(--muted-foreground); margin: 0; line-height: 1.7; align-self: center; }

        .ab-privacy { padding: 26px; border-radius: 18px; background: linear-gradient(135deg, rgba(74,222,128,0.08), rgba(74,222,128,0.02)); border: 1px solid rgba(74,222,128,0.22); display: flex; align-items: flex-start; gap: 16px; }
        .ab-privacy-chip { width: 46px; height: 46px; border-radius: 13px; background: rgba(74,222,128,0.15); color: #4ade80; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .ab-privacy-eyebrow { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #4ade80; margin-bottom: 6px; }
        .ab-privacy-title { font-size: 17px; font-weight: 700; margin: 0 0 8px; color: var(--foreground); }
        .ab-privacy-desc { font-size: 14.5px; color: var(--muted-foreground); margin: 0; line-height: 1.7; }
        .ab-privacy-link { display: inline-flex; align-items: center; gap: 6px; margin-top: 16px; background: transparent; border: 0; padding: 0; cursor: pointer; text-decoration: none; color: #4ade80; font-family: var(--font-sans); font-size: 14px; font-weight: 600; }

        .ab-footer { padding-top: 64px; padding-bottom: 56px; margin-top: 76px; border-top: 1px solid rgba(255,255,255,0.07); text-align: center; }
        .ab-footer-links { display: flex; gap: 28px; justify-content: center; flex-wrap: wrap; font-size: 14px; font-weight: 500; }
        .ab-foot-link { color: var(--muted-foreground); text-decoration: none; background: none; border: 0; cursor: pointer; font-family: var(--font-sans); font-size: 14px; font-weight: 500; transition: color .2s ease; }
        .ab-foot-link:hover { color: var(--foreground); }
        .ab-copy { font-size: 13px; color: var(--muted-foreground); margin: 24px 0 0; }
        .ab-updated { font-size: 12.5px; color: var(--muted-foreground); opacity: 0.8; margin: 6px 0 0; font-family: ${MONO}; }

        /* a11y: 鍵盤聚焦可見性(自訂連結/按鈕,header 的 shadcn Button 自帶 ring) */
        .ab-page a:focus-visible, .ab-page button:focus-visible { outline: 2px solid var(--ring, oklch(0.63 0.23 304)); outline-offset: 3px; border-radius: 6px; }
        .ab-privacy-link:focus-visible { outline-color: #4ade80; }

        @media (max-width: 860px) { .ab-spotlight { grid-template-columns: 1fr; } }
        @media (max-width: 560px) { .ab-hero-title { font-size: 40px; } }
      `}</style>

      {/* 頂部返回列 — 三靜態頁共用 header */}
      <StaticPageHeader title={tx('about:title')} analyticsCategory="AboutPage" />

      <BlurOrb top={-160} left="50%" w={760} h={460} color="oklch(0.63 0.23 304)" opacity={0.16} />
      <BlurOrb top={520} right={-160} w={520} h={420} color="#3b82f6" opacity={0.07} />

      <div className="ab-wrap">
        {/* ---------- Hero ---------- */}
        <section className="ab-hero">
          <div className="ab-hero-badge"><Tv size={42} color="white" /></div>
          <h1 className="ab-hero-title">{tx('about:heroTitle')}</h1>
          <p className="ab-hero-sub">{tx('about:intro')}</p>
          <div className="ab-pills">
            {pills.map((p) => {
              const PillIcon = p.icon;
              return (
                <span className="ab-pill" key={p.label}>
                  <PillIcon size={14} color="#c084fc" /> {p.label}
                </span>
              );
            })}
          </div>
        </section>

        {/* ---------- Main features ---------- */}
        <section className="ab-section">
          <SectionHead
            eyebrow={tx('about:featuresEyebrow', { defaultValue: 'Features' })}
            title={tx('about:featuresTitle')}
            sub={tx('about:featuresSub', { defaultValue: '圍繞「同時看多台」這件事打磨的每個細節，從多平台串流到自動排版。' })}
          />

          {/* spotlight trio */}
          <div className="ab-spotlight">
            {spotlight.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="ab-card ab-spot-card"
                  style={{
                    background: `linear-gradient(155deg, ${f.hue}1f 0%, oklch(0.21 0.034 264.665 / 0.5) 60%)`,
                    border: `1px solid ${f.hue}33`,
                  }}
                >
                  <div className="ab-spot-orb" style={{ background: f.hue }} />
                  <div style={{ position: 'relative' }}>
                    <IconChip icon={Icon} hue={f.hue} size={50} />
                    <h3 className="ab-spot-title">{f.title}</h3>
                    <p className="ab-spot-desc">{f.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* feature grid */}
          <div className="ab-grid">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="ab-card">
                  <IconChip icon={Icon} hue={f.hue} size={40} />
                  <div className="ab-card-body">
                    <h4 className="ab-card-title">{f.title}</h4>
                    <p className="ab-card-desc">{f.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ---------- Tech ---------- */}
        <section className="ab-section">
          <SectionHead
            eyebrow={tx('about:techEyebrow', { defaultValue: 'Under the hood' })}
            title={tx('about:techTitle')}
            sub={tx('about:techSub', { defaultValue: '輕量、純前端、本地優先 —— 沒有後端伺服器，也不收你的資料。' })}
          />
          <div className="ab-tech">
            {tech.map((tItem, i) => {
              const Icon = tItem.icon;
              return (
                <div key={tItem.title} className="ab-tech-row">
                  <span className="ab-tech-num">{String(i + 1).padStart(2, '0')}</span>
                  <IconChip icon={Icon} hue={tItem.hue} size={40} />
                  <div className="ab-tech-body">
                    <h4 className="ab-tech-title">{tItem.title}</h4>
                    <p className="ab-tech-desc">{tItem.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ---------- Creator ---------- */}
        <section className="ab-section">
          <SectionHead
            eyebrow={tx('about:creatorEyebrow', { defaultValue: 'Creator' })}
            title={tx('about:creatorTitle')}
          />
          <div className="ab-creator">
            <div className="ab-avatar">H</div>
            <div className="ab-creator-body">
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <h3 className="ab-creator-name">
                  <RouteLink to="creator" className="ab-creator-link" onClick={() => logEvent('AboutPage', 'click_social', 'creator_page')}>
                    Hsiung-Shao
                  </RouteLink>
                </h3>
                <span className="ab-creator-role">
                  {tx('about:creatorRole', { defaultValue: '獨立開發者' })}
                </span>
              </div>
              <p className="ab-creator-desc">
                {tx('about:creatorDesc', { defaultValue: 'MultiStream Hub 由 Hsiung-Shao 獨立開發與維護。這個專案的初衷，是給直播愛好者一個免費、好用的多平台串流觀看工具，讓同時追多個直播這件事更方便、更有趣。功能會持續改進與優化，也歡迎大家提供寶貴的意見與建議。' })}
              </p>
              <RouteLink to="creator" className="ab-creator-more" onClick={() => logEvent('AboutPage', 'click_social', 'creator_page')}>
                {tx('about:creator.readMore')} <ArrowRight size={14} />
              </RouteLink>
              <div className="ab-social-row">
                <a
                  className="ab-social primary"
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => logEvent('AboutPage', 'click_social', 'github')}
                >
                  <Github size={16} /> GitHub
                </a>
                <a
                  className="ab-social ghost"
                  href={DISCORD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => logEvent('AboutPage', 'click_social', 'discord')}
                >
                  <MessageCircle size={16} /> {tx('about:joinDiscord', { defaultValue: '加入 Discord' })}
                </a>
                <a
                  className="ab-social coffee"
                  href={COFFEE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => logEvent('AboutPage', 'click_social', 'coffee')}
                >
                  <Coffee size={16} /> {tx('about:buyCoffee', { defaultValue: '請我喝杯咖啡' })}
                </a>
                <a
                  className="ab-social patreon"
                  href={PATREON_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => logEvent('AboutPage', 'click_social', 'patreon')}
                >
                  <HeartHandshake size={16} /> Patreon
                </a>
                <a
                  className="ab-social ghost"
                  href={X_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => logEvent('AboutPage', 'click_social', 'twitter')}
                >
                  <AtSign size={16} /> X
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Contact ---------- */}
        <section className="ab-section">
          <SectionHead
            eyebrow={tx('about:contactEyebrow', { defaultValue: 'Contact' })}
            title={tx('about:contactTitle')}
            sub={tx('about:contactSub', { defaultValue: '有任何問題、建議或意見回饋，歡迎透過以下方式聯繫。' })}
          />
          <div className="ab-contact">
            <button
              type="button"
              className="ab-link-row"
              onClick={() => {
                logEvent('AboutPage', 'click_social', 'feedback_form');
                openModal('feedback');
              }}
            >
              <IconChip icon={Mail} hue="#60a5fa" size={46} />
              <div className="ab-link-body">
                <h4 className="ab-link-title">{tx('about:feedbackForm')}</h4>
                <p className="ab-link-desc">{tx('about:feedbackFormDesc')}</p>
              </div>
              <ArrowUpRight size={18} className="text-muted-foreground shrink-0" />
            </button>
            <a
              className="ab-link-row"
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => logEvent('AboutPage', 'click_social', 'discord')}
            >
              <IconChip icon={MessageCircle} hue="#c084fc" size={46} />
              <div className="ab-link-body">
                <h4 className="ab-link-title">{tx('about:discordCommunity')}</h4>
                <p className="ab-link-desc">{tx('about:discordCommunityDesc')}</p>
              </div>
              <ArrowUpRight size={18} className="text-muted-foreground shrink-0" />
            </a>
          </div>
        </section>

        {/* ---------- Terms ---------- */}
        <section className="ab-section">
          <SectionHead
            eyebrow={tx('about:termsEyebrow', { defaultValue: 'Terms' })}
            title={tx('about:termsTitle')}
          />
          <div className="ab-terms">
            {terms.map((term) => {
              const Icon = term.icon;
              return (
                <div key={term.text} className="ab-term">
                  <IconChip icon={Icon} hue={term.hue} size={38} />
                  <p className="ab-term-text">{term.text}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ---------- Privacy ---------- */}
        <section className="ab-section">
          <SectionHead
            eyebrow={tx('about:privacyEyebrow', { defaultValue: 'Privacy' })}
            title={tx('about:privacyTitle')}
          />
          <div className="ab-privacy">
            <div className="ab-privacy-chip"><ShieldCheck size={22} /></div>
            <div className="flex-1">
              <div className="ab-privacy-eyebrow">
                {tx('about:localFirstEyebrow', { defaultValue: 'Local first' })}
              </div>
              <h3 className="ab-privacy-title">
                {tx('about:localFirstTitle', { defaultValue: '你的資料留在你這裡' })}
              </h3>
              <p className="ab-privacy-desc">
                {tx('about:localFirstDesc', { defaultValue: '我們重視你的隱私權。你的設定與收藏資料都儲存在你的瀏覽器本地（LocalStorage 與 IndexedDB），我們不會收集能識別你個人的資料。唯一會回傳的是被加入的 YouTube 頻道 ID —— 以匿名、聚合的方式統計熱門頻道，不綁定任何使用者或裝置。' })}
              </p>
              <RouteLink to="privacy" className="ab-privacy-link">
                {tx('about:privacyLinkText', { defaultValue: '詳細的隱私權政策請參閱：隱私權政策' })}
                <ArrowRight size={15} />
              </RouteLink>
            </div>
          </div>
        </section>

        {/* ---------- Footer ---------- */}
        <footer className="ab-footer">
          <div className="ab-footer-links">
            <RouteLink className="ab-foot-link" to="home">
              {tx('about:home')}
            </RouteLink>
            <RouteLink className="ab-foot-link" to="privacy">
              {tx('about:privacyPolicy')}
            </RouteLink>
            <button
              type="button"
              className="ab-foot-link"
              onClick={() => {
                logEvent('AboutPage', 'click_social', 'feedback_footer');
                openModal('feedback');
              }}
            >
              {tx('about:giveFeedback')}
            </button>
          </div>
          <p className="ab-copy">{tx('about:copyright')}</p>
          <p className="ab-updated">{tx('about:lastUpdated')}</p>
        </footer>
      </div>
    </div>
  );
}
