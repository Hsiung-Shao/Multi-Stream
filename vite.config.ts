
/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { execSync } from 'child_process';
import tailwindcss from '@tailwindcss/vite';
import pkg from './package.json';
import { SEO_DEFAULT_TITLE, SEO_DEFAULT_DESCRIPTION, SEO_ROBOTS_INDEX } from './src/seo/defaults';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * 把 index.html 的 %SEO_*% / %APP_VERSION% / %BUILD_DATE% 佔位換成單一來源的值，
 * 讓伺服器直出的 <title>/meta/JSON-LD 與執行期 SEO.tsx 寫入的一致（dev 與 build 都生效）。
 * 殘留佔位直接讓 build 失敗，避免把 "%SEO_TITLE%" 部署上線。
 */
function seoHtmlPlugin(): Plugin {
  const replacements: Record<string, string> = {
    '%SEO_TITLE%': escapeHtml(SEO_DEFAULT_TITLE),
    '%SEO_DESCRIPTION%': escapeHtml(SEO_DEFAULT_DESCRIPTION),
    '%SEO_ROBOTS%': SEO_ROBOTS_INDEX,
    // 兩者進 JSON-LD 字串值：semver / ISO 日期都不含需跳脫字元
    '%APP_VERSION%': pkg.version,
    '%BUILD_DATE%': new Date().toISOString().slice(0, 10),
  };
  return {
    name: 'seo-html-placeholders',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        let out = html;
        for (const [key, value] of Object.entries(replacements)) {
          out = out.split(key).join(value);
        }
        const leftover = out.match(/%(SEO_[A-Z_]+|APP_VERSION|BUILD_DATE)%/);
        if (leftover) {
          throw new Error(`[seo-html-placeholders] index.html 仍有未替換的佔位 ${leftover[0]}`);
        }
        return out;
      },
    },
  };
}

/**
 * 教學內容的 git 最後修改日（供 TechArticle.dateModified）。與 scripts/generate-sitemap.js 的
 * /instructions lastmod 同一組來源檔、同一退回策略（無 git 歷史/失敗 → build 日），兩邊自洽。
 */
function guidesDateModified(): string {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const out = execSync(
      'git log -1 --format=%cI -- src/components/Pages/InstructionsPage.tsx src/i18n/locales/zh-TW/tutorial.ts',
      { cwd: __dirname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return out ? out.slice(0, 10) : today;
  } catch {
    return today;
  }
}

// isSsrBuild：`vite build --ssr src/entry-server.tsx`（SSG 預渲染用，見 scripts/prerender.mjs）。
// SSR 產物是給 Node 一次性執行的，不需要（也不能）套 client 的 manualChunks 分包。
export default defineConfig(({ isSsrBuild }) => ({
  define: {
    '__APP_VERSION__': JSON.stringify(process.env.npm_package_version ?? pkg.version),
    '__GUIDES_DATE_MODIFIED__': JSON.stringify(guidesDateModified()),
  },
  plugins: [seoHtmlPlugin(), react(), tailwindcss()],
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    alias: {
      'sonner@2.0.3': 'sonner',
      'recharts@2.15.2': 'recharts',
      'react-hook-form@7.55.0': 'react-hook-form',
      'lucide-react@0.487.0': 'lucide-react',
      'cmdk@1.1.1': 'cmdk',
      'class-variance-authority@0.7.1': 'class-variance-authority',
      '@radix-ui/react-tabs@1.1.3': '@radix-ui/react-tabs',
      '@radix-ui/react-switch@1.1.3': '@radix-ui/react-switch',
      '@radix-ui/react-slot@1.1.2': '@radix-ui/react-slot',
      '@radix-ui/react-slider@1.2.3': '@radix-ui/react-slider',
      '@radix-ui/react-select@2.1.6': '@radix-ui/react-select',
      '@radix-ui/react-scroll-area@1.2.3': '@radix-ui/react-scroll-area',
      '@radix-ui/react-radio-group@1.2.3': '@radix-ui/react-radio-group',
      '@radix-ui/react-progress@1.1.2': '@radix-ui/react-progress',
      '@radix-ui/react-popover@1.1.6': '@radix-ui/react-popover',
      '@radix-ui/react-label@2.1.2': '@radix-ui/react-label',
      '@radix-ui/react-dropdown-menu@2.1.6': '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-dialog@1.1.6': '@radix-ui/react-dialog',
      '@radix-ui/react-collapsible@1.1.3': '@radix-ui/react-collapsible',
      '@radix-ui/react-checkbox@1.1.4': '@radix-ui/react-checkbox',
      '@radix-ui/react-avatar@1.1.3': '@radix-ui/react-avatar',
      '@radix-ui/react-alert-dialog@1.1.6': '@radix-ui/react-alert-dialog',
      '@radix-ui/react-accordion@1.2.3': '@radix-ui/react-accordion',
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'esnext',
    outDir: 'build',
    rollupOptions: isSsrBuild ? {} : {
      output: {
        manualChunks: {
          // 核心庫
          'vendor-react': ['react', 'react-dom', 'zustand', '@tanstack/react-query'],

          // UI 基礎組件
          'vendor-radix': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-popover',
            '@radix-ui/react-switch',
            '@radix-ui/react-slider',
            '@radix-ui/react-accordion',
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-scroll-area',
          ],

          // 圖表庫 - 獨立打包
          'vendor-charts': ['recharts'],

          // 工具庫
          'vendor-utils': ['clsx', 'tailwind-merge', 'i18next', 'react-i18next', 'lucide-react'],
        },
      },
    },
    // 啟用代碼分割優化
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      // 將 /api/* 請求代理到 Wrangler Pages Functions（運行在 8788 端口）
      '/api': {
        target: 'http://localhost:8788',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  // vite preview（serve production build）也需要把 /api 代理到 wrangler，
  // 才能在 localhost:3000 上以正式建置模擬線上現況（含後端 Functions）。
  preview: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8788',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
  },
}));