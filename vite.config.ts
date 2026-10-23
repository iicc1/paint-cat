import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/** Public site URL (no trailing slash). Used in canonical, Open Graph, sitemap and robots. */
const SITE_URL = 'https://paint.cat';
const APP_NAME = 'paint.cat';
const DESCRIPTION =
  'The classic Windows Paint, in your browser: brushes, shapes, text, selection, zoom and saving as PNG, JPG, BMP and GIF. Free, no sign-up, and it works offline.';

/** Replaces {{SITE_URL}} in index.html and generates robots.txt and sitemap.xml with the real URL. */
function seoFiles(): Plugin {
  return {
    name: 'paintcat-seo',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replaceAll('{{SITE_URL}}', SITE_URL),
    },
    generateBundle() {
      const today = new Date().toISOString().slice(0, 10);
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        // Content-Signal: search engines and AI may index, cite and train on the site (contentsignals.org).
        source: `User-agent: *\nContent-Signal: search=yes, ai-input=yes, ai-train=yes\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
      });
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source:
          '<?xml version="1.0" encoding="UTF-8"?>\n' +
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
          `  <url>\n    <loc>${SITE_URL}/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>1.0</priority>\n  </url>\n` +
          '</urlset>\n',
      });
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    watch: process.env.VITE_USE_POLLING === 'true' ? { usePolling: true, interval: 250 } : undefined,
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
  },
  plugins: [
    seoFiles(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon.png', 'og-image.png'],
      manifest: {
        id: '/',
        name: APP_NAME,
        short_name: APP_NAME,
        description: DESCRIPTION,
        lang: 'en',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#ffffff',
        theme_color: '#f5f6f7',
        categories: ['graphics', 'productivity', 'utilities'],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
        screenshots: [
          {
            src: '/og-image.png',
            sizes: '1200x630',
            type: 'image/png',
            form_factor: 'wide',
            label: 'paint.cat with the Ribbon and a drawing',
          },
        ],
        file_handlers: [
          {
            action: '/',
            accept: {
              'image/png': ['.png'],
              'image/jpeg': ['.jpg', '.jpeg', '.jpe', '.jfif'],
              'image/bmp': ['.bmp', '.dib'],
              'image/gif': ['.gif'],
              'image/webp': ['.webp'],
              'image/x-icon': ['.ico'],
            },
          },
        ],
        launch_handler: { client_mode: 'focus-existing' },
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/(robots\.txt|sitemap\.xml)$/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
