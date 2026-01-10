import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      '/api/ridb': {
        target: 'https://ridb.recreation.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ridb/, '/api/v1'),
      },
      '/api/blm-sma': {
        target: 'https://gis.blm.gov/arcgis/rest/services/lands',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/blm-sma/, ''),
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
