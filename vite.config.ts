import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');

  return {
  server: {
    host: "::",
    port: 8080,
    proxy: {
      '/api/ridb': {
        target: 'https://ridb.recreation.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ridb/, '/api/v1'),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('apikey', env.VITE_RIDB_API_KEY || '');
            console.log('[RIDB Proxy] Adding API key to request');
          });
        },
      },
      '/api/blm-sma': {
        target: 'https://gis.blm.gov/arcgis/rest/services/lands',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/blm-sma/, ''),
      },
      '/api/recreation-availability': {
        target: 'https://www.recreation.gov',
        changeOrigin: true,
        rewrite: (path) => {
          // Parse query params to get ID and rewrite to Recreation.gov format
          const url = new URL(path, 'http://localhost');
          const id = url.searchParams.get('id');
          const startDate = url.searchParams.get('start_date');
          const newPath = `/api/camps/availability/campground/${id}/month${startDate ? `?start_date=${startDate}` : ''}`;
          console.log('[Recreation Proxy] Rewriting to:', newPath);
          return newPath;
        },
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
};
});
