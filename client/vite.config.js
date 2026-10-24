import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Dev convenience: API calls to /api/v1 reach the Express server on :4001
    // without needing VITE_API_URL. Production builds use VITE_API_URL instead.
    proxy: { '/api': 'http://localhost:4001' },
  },
});
