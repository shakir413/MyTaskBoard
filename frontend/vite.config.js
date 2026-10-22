import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In local development, forward /api calls to the Node backend.
// In production, CloudFront does this job (same idea, different tool).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": "http://localhost:5000" },
  },
});
