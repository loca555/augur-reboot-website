// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import rehypeHeadingIcons from './src/lib/rehype-heading-icons.mjs';
import rehypeCallouts from './src/lib/rehype-callouts.mjs';

// Check if building in GitHub Actions (for GitHub Pages)
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';

// GitHub Pages specific configuration
const gitHubPagesConfig = {
  base: process.env.BASE_PATH || '/',
  output: /** @type {'static'} */ ('static'),
  // На GH Pages без Cloudflare-рантайма sharp доступен, но под base-путём
  // Astro image pipeline иногда конструирует URL вне схемы file://, что роняет readFile.
  // Отключаем оптимизацию — статика копируется как есть.
  image: {
    service: { entrypoint: 'astro/assets/services/noop' }
  }
};

// Cloudflare specific configuration (for local development and preview)
const cloudflareConfig = {
  adapter: cloudflare({
    platformProxy: {
      enabled: true
    }
  }),
  output: /** @type {'server'} */ ('server')
};

// https://astro.build/config
export default defineConfig({
  // Site URL for RSS feeds, canonical URLs, sitemap generation
  // Set via SITE_URL environment variable
  ...(process.env.SITE_URL && { site: process.env.SITE_URL }),
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: process.env.NODE_ENV === 'production' ? {
        "react-dom/server": "react-dom/server.edge"
      } : undefined
    }
  },
  integrations: [react(), sitemap(), mdx({ rehypePlugins: [rehypeHeadingIcons, rehypeCallouts] })],
  ...(isGitHubActions ? gitHubPagesConfig : cloudflareConfig)
});
