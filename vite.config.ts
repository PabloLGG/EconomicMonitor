import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // GitHub Pages serves from /EconomicMonitor/; local dev uses site root.
  base: command === 'serve' ? '/' : '/EconomicMonitor/',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    proxy: {
      // FRED blocks browser CORS; route dev requests through Vite instead.
      '/api/fred': {
        target: 'https://api.stlouisfed.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/fred/, '/fred'),
        headers: {
          Accept: 'application/json',
        },
      },
      '/api/shiller': {
        target: 'https://r2.datahub.io',
        changeOrigin: true,
        rewrite: () => '/clv1551hg0004mj09hjz069e9/main/raw/data/data.csv',
      },
    },
  },
}));
