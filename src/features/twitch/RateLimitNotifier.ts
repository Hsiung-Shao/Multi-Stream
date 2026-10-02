import { RateLimitNotifierContract } from './types.ts';
import i18n from '../../i18n/i18n';

const SECONDS_PLACEHOLDER = '__SECONDS__';

/**
 * Creates a RateLimitNotifier that mimics the legacy DOM behavior.
 * Shows a yellow warning box when rate limit is hit.
 */
export class DomRateLimitNotifier implements RateLimitNotifierContract {
    public notify(waitSeconds: number): void {
        if (typeof document === 'undefined') return;

        // Check dedupe
        if (document.getElementById('twitch-rate-limit-notification')) return;

        const notification = document.createElement('div');
        notification.id = 'twitch-rate-limit-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ffaa00;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            z-index: 10000;
            max-width: 400px;
            font-size: 14px;
            line-height: 1.6;
        `;

        const title = document.createElement('div');
        title.style.cssText = 'font-weight: bold; margin-bottom: 8px; font-size: 16px;';
        title.textContent = `⚠️ ${i18n.t('stream:twitch_rate_limit_title')}`;

        const message = document.createElement('div');
        message.style.cssText = 'margin-bottom: 10px;';

        // 倒數秒數要放在獨立 span 裡每秒更新：先用佔位字串取出翻譯，再從佔位處切成前後兩段文字
        const [pre, post = ''] = i18n
            .t('stream:twitch_rate_limit_body', { seconds: SECONDS_PLACEHOLDER })
            .split(SECONDS_PLACEHOLDER);
        const textPre = document.createTextNode(pre);
        const countdownSpan = document.createElement('span');
        countdownSpan.id = 'twitch-rate-limit-countdown';
        countdownSpan.style.cssText = 'font-weight: bold; font-size: 18px;';
        countdownSpan.textContent = waitSeconds.toString();
        const textPost = document.createTextNode(post);

        message.appendChild(textPre);
        message.appendChild(countdownSpan);
        message.appendChild(textPost);

        const closeBtn = document.createElement('button');
        closeBtn.style.cssText = `
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            margin-top: 8px;
        `;
        closeBtn.textContent = i18n.t('common:common.got_it');

        let interval: any = null;

        const close = () => {
            if (interval) clearInterval(interval);
            notification.remove();
        };

        closeBtn.onclick = close;

        notification.appendChild(title);
        notification.appendChild(message);
        notification.appendChild(closeBtn);
        document.body.appendChild(notification);

        // Countdown Logic
        let remaining = waitSeconds;
        interval = setInterval(() => {
            remaining--;
            if (remaining >= 0) countdownSpan.textContent = remaining.toString();
            if (remaining <= 0) {
                clearInterval(interval);
                setTimeout(() => {
                    if (notification.parentNode) notification.remove();
                }, 1000);
            }
        }, 1000);
    }
}
