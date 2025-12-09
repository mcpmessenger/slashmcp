import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env vars - Vite automatically loads .env.local in dev mode
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    server: {
      // Use localhost for local dev to avoid CORS issues
      // Set VITE_DEV_HOST=0.0.0.0 in .env.local if you need network access
      host: env.VITE_DEV_HOST || "localhost",
      port: 8080,
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
