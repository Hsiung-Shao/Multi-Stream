import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { SEO } from '../../src/components/SEO';
import {
    SEO_DEFAULT_TITLE,
    SEO_ROBOTS_INDEX,
    SEO_ROBOTS_NOINDEX,
    SEO_SITE_URL,
} from '../../src/seo/defaults';

const robots = () => document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null;
const canonical = () => document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;

describe('SEO', () => {
    beforeEach(() => {
        document.head.innerHTML = '';
        document.title = '';
    });

    it('預設值：title 為單一來源常數、robots 可索引、canonical 指向首頁、不再寫 keywords', () => {
        render(<SEO />);
        expect(document.title).toBe(SEO_DEFAULT_TITLE);
        expect(robots()).toBe(SEO_ROBOTS_INDEX);
        expect(canonical()).toBe(`${SEO_SITE_URL}/`);
        expect(document.querySelector('meta[name="keywords"]')).toBeNull();
    });

    it('noindex：robots 設為 noindex,follow 並移除既有 canonical', () => {
        // 模擬 index.html 靜態帶進來的 canonical（軟 404 時不該殘留）
        const link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        link.setAttribute('href', `${SEO_SITE_URL}/`);
        document.head.appendChild(link);

        render(<SEO noindex title="找不到頁面 - MultiStream Hub" />);
        expect(document.title).toBe('找不到頁面 - MultiStream Hub');
        expect(robots()).toBe(SEO_ROBOTS_NOINDEX);
        expect(canonical()).toBeNull();
    });

    it('從 noindex 頁切回一般頁：robots 恢復 index、canonical 重建為該頁 URL', () => {
        const { rerender } = render(<SEO noindex title="404" />);
        expect(robots()).toBe(SEO_ROBOTS_NOINDEX);
        expect(canonical()).toBeNull();

        rerender(<SEO title="關於我們 - MultiStream Hub" url={`${SEO_SITE_URL}/about`} />);
        expect(robots()).toBe(SEO_ROBOTS_INDEX);
        expect(canonical()).toBe(`${SEO_SITE_URL}/about`);
        expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(`${SEO_SITE_URL}/about`);
    });

    it('jsonLd：有傳入時注入 data-seo-jsonld script，移除後清掉', () => {
        const { rerender } = render(<SEO jsonLd={{ '@type': 'FAQPage' }} />);
        const script = document.querySelector('script[data-seo-jsonld]');
        expect(script?.textContent).toBe(JSON.stringify({ '@type': 'FAQPage' }));

        rerender(<SEO />);
        expect(document.querySelector('script[data-seo-jsonld]')).toBeNull();
    });

    it('jsonLd：內容含 < 時跳脫為 \\u003c，避免 </script> 提前關閉標籤；解析回來仍等值', () => {
        const payload = { '@type': 'Article', headline: 'a </script><b>b' };
        render(<SEO jsonLd={payload} />);
        const text = document.querySelector('script[data-seo-jsonld]')?.textContent ?? '';
        expect(text).not.toContain('</script>');
        expect(text).toContain('\\u003c/script>');
        expect(JSON.parse(text)).toEqual(payload);
    });
});
