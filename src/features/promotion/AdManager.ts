import { AdConfig, AdManagerContract } from './types.ts';

// --- Default Configuration (Matched Legacy) ---
const DEFAULT_CONFIG: AdConfig = {
    enabled: true,
    showControlButtons: false,
    testMode: false,
    showInterval: 2 * 60 * 60 * 1000, // 2 hours
    displayDuration: {
        min: 1 * 60 * 1000,
        max: 2 * 60 * 1000
    }
};

const TEST_MODE_CONFIG: Partial<AdConfig> = {
    showInterval: 30 * 1000,
    displayDuration: { min: 5 * 1000, max: 10 * 1000 }
};

const NORMAL_MODE_CONFIG: Partial<AdConfig> = {
    showInterval: 30 * 60 * 1000, // Note: Legacy toggleAdTestMode sets this to 30 mins, but default is 2h? 
    // Legacy code: init uses 2h. toggleTestMode(false) uses 30m.
    // We will follow legacy behavior strictly.
    displayDuration: { min: 1 * 60 * 1000, max: 3 * 60 * 1000 }
};

// --- Storage Helper ---
const STORAGE_KEY_CONFIG = 'adConfig';
const STORAGE_KEY_LAST_SHOWN = 'adLastShown';
const STORAGE_KEY_LAST_CLOSED = 'adLastClosed'; // Legacy uses this

class AdConfigStore {
    static load(): AdConfig {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
            if (saved) {
                const parsed = JSON.parse(saved);
                const config = { ...DEFAULT_CONFIG, ...parsed };
                config.testMode = false; // Legacy enforces testMode = false on load
                return config;
            }
        } catch (e) { /* ignore */ }
        return { ...DEFAULT_CONFIG };
    }

    static save(config: AdConfig) {
        try {
            localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
        } catch (e) { /* ignore */ }
    }

    static getLastShown(): number {
        const val = localStorage.getItem(STORAGE_KEY_LAST_SHOWN);
        return val ? parseInt(val, 10) : 0;
    }

    static setLastShown(ts: number) {
        localStorage.setItem(STORAGE_KEY_LAST_SHOWN, ts.toString());
    }
}

// --- DOM Adapter (Internal) ---
class DomAdapter {
    private adHTMLCreated = false;
    private adScriptLoaded = false;

    constructor(private manager: AdManager) { }

    public hasValidPublisherContent(): boolean {
        if (typeof document === 'undefined') return false;

        // 1. Initial Content
        const initial = document.getElementById('initial-content');
        if (initial) {
            const style = window.getComputedStyle(initial);
            if (style.opacity !== '0' && style.visibility !== 'hidden') return true;
        }

        // 2. Stream Boxes
        const boxes = document.querySelectorAll('.stream-box');
        if (boxes.length === 0) return false;

        // 3. Valid Streams
        // Simplified check: do we have player instances or src?
        const players = window.players || {};
        const streamData = window.streamData || {};

        for (let i = 0; i < boxes.length; i++) {
            const box = boxes[i] as HTMLElement;
            const sId = parseInt(box.dataset.streamId || '0');
            if (sId && streamData[sId]) {
                if (players[sId]) return true;
                const iframe = box.querySelector('iframe');
                if (iframe && iframe.src) return true;
            }
        }
        return false;
    }

    public updateControlButtons(config: AdConfig) {
        if (typeof document === 'undefined') return;

        // Section visibility
        const section = document.getElementById('ad-control-section');
        if (section) section.style.display = config.showControlButtons ? 'block' : 'none';

        // Enabled Btn
        const enabledBtn = document.getElementById('ad-enabled-btn');
        if (enabledBtn) {
            if (config.enabled) {
                enabledBtn.textContent = '✅ 廣告（開）';
                enabledBtn.style.background = '#9147ff';
            } else {
                enabledBtn.textContent = '❌ 廣告（關）';
                enabledBtn.style.background = '#444';
            }
        }

        // Test Mode Btn
        const testBtn = document.getElementById('ad-test-mode-btn');
        if (testBtn) {
            if (config.testMode) {
                testBtn.textContent = '🔄 測試模式（開）';
                testBtn.style.background = '#9147ff';
            } else {
                testBtn.textContent = '🔄 測試模式（關）';
                testBtn.style.background = '';
            }
        }
    }

    public async loadAdSenseScript(): Promise<void> {
        if (typeof document === 'undefined') return;
        if (this.adScriptLoaded || document.querySelector('script[src*="adsbygoogle.js"]')) {
            this.adScriptLoaded = true;
            return;
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.async = true;
            script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8415424787944153';
            script.crossOrigin = 'anonymous';
            script.onload = () => {
                this.adScriptLoaded = true;
                resolve();
            };
            script.onerror = () => reject(new Error('AdSense script load failed'));
            document.head.appendChild(script);
        });
    }

    public createAdHTML(): HTMLElement | null {
        if (typeof document === 'undefined') return null;
        let banner = document.getElementById('ad-banner');
        if (banner) {
            this.adHTMLCreated = true;
            return banner;
        }

        banner = document.createElement('div');
        banner.id = 'ad-banner';
        banner.className = 'ad-banner';

        const content = document.createElement('div');
        content.className = 'ad-content';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'ad-close-btn';
        closeBtn.textContent = '×';
        closeBtn.title = '關閉廣告';
        closeBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.manager.closeAd();
        };

        const body = document.createElement('div');
        body.className = 'ad-body';

        const ins = document.createElement('ins');
        ins.className = 'adsbygoogle';
        ins.style.cssText = 'display:block;margin:0 auto;width:100%;min-height:90px;';
        ins.dataset.adClient = 'ca-pub-8415424787944153';
        ins.dataset.adSlot = '2327980476';
        ins.dataset.adFormat = 'auto';
        ins.dataset.fullWidthResponsive = 'true';

        body.appendChild(ins);
        content.appendChild(closeBtn);
        content.appendChild(body);
        banner.appendChild(content);

        document.body.appendChild(banner);
        this.adHTMLCreated = true;
        return banner;
    }

    public removeAdHTML() {
        const banner = document.getElementById('ad-banner');
        if (banner) banner.remove();
        this.adHTMLCreated = false;
    }

    public removeAdScript() {
        const script = document.querySelector('script[src*="adsbygoogle.js"]');
        if (script) script.remove();
        this.adScriptLoaded = false;
    }

    public showBanner(banner: HTMLElement) {
        banner.style.visibility = 'visible';
        banner.style.opacity = '1';
        banner.style.pointerEvents = 'auto';
        banner.classList.add('show');

        // Layout adjustments
        const container = document.getElementById('container');
        if (container) {
            container.classList.add('has-ad');
            // Simplified layout logic for brevity, legacy does complex height calc
            // We'll trust CSS 'has-ad' class mostly, but legacy injects styles.
            // Replicating legacy:
            const estH = 200;
            container.style.paddingBottom = estH + 'px';
            container.style.height = `calc(100vh - ${estH}px)`;

            setTimeout(() => {
                const h = banner.offsetHeight || 200;
                container.style.paddingBottom = h + 'px';
                container.style.height = `calc(100vh - ${h}px)`;
            }, 100);
        }

        // Trigger AdSense
        setTimeout(() => {
            try {
                const ads = (window.adsbygoogle = window.adsbygoogle || []);
                // Find unprocessed
                const units = banner.querySelectorAll('.adsbygoogle:not([data-adsbygoogle-status])');
                if (units.length > 0) ads.push({});
            } catch (e) { console.error(e); }
        }, 400);
    }

    public hideBanner() {
        const banner = document.getElementById('ad-banner');
        const container = document.getElementById('container');

        if (banner) {
            banner.classList.remove('show');
            banner.style.transform = 'translateY(100%)';
            banner.style.pointerEvents = 'none';

            setTimeout(() => {
                if (container) {
                    container.classList.remove('has-ad');
                    container.style.paddingBottom = '';
                    container.style.height = '';
                }
                banner.remove();
                this.adHTMLCreated = false;
            }, 300);
        }
    }
}

// --- AdManager Logic ---
export class AdManager implements AdManagerContract {
    private config: AdConfig;
    private dom: DomAdapter;
    private checkTimer: any = null;
    private displayTimer: any = null;
    private isVisible = false;

    constructor() {
        this.config = AdConfigStore.load();
        this.dom = new DomAdapter(this);
    }

    public init() {
        this.dom.updateControlButtons(this.config);
        if (!this.config.enabled) return;

        this.checkAndShowAd();
        this.startCheckTimer();
    }

    public checkAndShowAd() {
        if (!this.config.enabled) return;
        if (!this.dom.hasValidPublisherContent()) {
            this.startCheckTimer();
            return;
        }

        const now = Date.now();
        const last = AdConfigStore.getLastShown();
        if (now - last >= this.config.showInterval) {
            this.showAd();
        }
    }

    public async triggerManually() {
        if (!this.config.enabled) {
            // Legacy behavior: confirm enable
            if (typeof confirm !== 'undefined' && confirm('廣告功能目前關閉，是否要啟用並顯示？')) {
                this.toggleEnabled();
                // Toggle calls init, which checks... but let's force show
            } else {
                return;
            }
        }

        if (this.isVisible) {
            this.closeAd();
            setTimeout(() => this.showAd(), 600);
        } else {
            localStorage.removeItem(STORAGE_KEY_LAST_SHOWN);
            this.showAd();
        }
    }

    public closeAd() {
        this.dom.hideBanner();
        this.isVisible = false;
        if (this.displayTimer) clearTimeout(this.displayTimer);
        localStorage.setItem(STORAGE_KEY_LAST_CLOSED, Date.now().toString());

        // Restart timer if enabled
        if (this.config.enabled) this.startCheckTimer();
    }

    public toggleEnabled() {
        this.config.enabled = !this.config.enabled;
        AdConfigStore.save(this.config);
        this.dom.updateControlButtons(this.config);

        if (this.config.enabled) {
            if (this.isVisible) this.closeAd();
            this.init();
        } else {
            this.stopAllTimers();
            if (this.isVisible) this.dom.hideBanner();
            this.isVisible = false;
            this.dom.removeAdHTML();
            this.dom.removeAdScript();
        }
    }

    public toggleTestMode() {
        this.config.testMode = !this.config.testMode;
        const settings = this.config.testMode ? TEST_MODE_CONFIG : NORMAL_MODE_CONFIG;
        Object.assign(this.config, settings);

        AdConfigStore.save(this.config);
        this.dom.updateControlButtons(this.config);

        if (this.checkTimer) clearTimeout(this.checkTimer);
        if (this.config.enabled) this.startCheckTimer();
    }

    // --- Legacy Aliases for Bridge ---
    public triggerAdManually() { return this.triggerManually(); }
    public toggleAdEnabled() { return this.toggleEnabled(); }
    public toggleAdTestMode() { return this.toggleTestMode(); }
    public closeAdBanner() { return this.closeAd(); }

    public isEnabled() { return this.config.enabled; }

    public isTestMode() { return this.config.testMode; }

    // --- Private ---

    private startCheckTimer() {
        if (this.checkTimer) clearTimeout(this.checkTimer);
        this.checkTimer = setTimeout(() => {
            this.checkAndShowAd();
        }, this.config.showInterval);
    }

    private stopAllTimers() {
        if (this.checkTimer) clearTimeout(this.checkTimer);
        if (this.displayTimer) clearTimeout(this.displayTimer);
    }

    private async showAd() {
        if (this.isVisible) return;
        if (!this.dom.hasValidPublisherContent()) return;

        const banner = this.dom.createAdHTML();
        if (!banner) return;

        try {
            await this.dom.loadAdSenseScript();
        } catch { return; }

        this.isVisible = true;
        this.dom.showBanner(banner);
        AdConfigStore.setLastShown(Date.now());

        const duration = this.config.displayDuration.min +
            Math.random() * (this.config.displayDuration.max - this.config.displayDuration.min);

        this.displayTimer = setTimeout(() => {
            this.closeAd();
        }, duration);
    }
}

export const adManager = new AdManager();
