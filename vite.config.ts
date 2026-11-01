import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          const normalizedId = id.replace(/\\/g, '/');
          if (
            normalizedId.includes('/node_modules/react/') ||
            normalizedId.includes('/node_modules/react-dom/')
          ) {
            return 'vendor-react';
          }
          if (
            normalizedId.includes('/node_modules/echarts/lib/chart/') ||
            normalizedId.includes('/node_modules/echarts/charts')
          ) {
            return 'vendor-echarts-charts';
          }
          if (normalizedId.includes('/node_modules/echarts/')) {
            return 'vendor-echarts';
          }
          if (normalizedId.includes('/node_modules/leaflet/')) {
            return 'vendor-leaflet';
          }
          if (normalizedId.includes('/node_modules/lucide-react/')) {
            return 'vendor-icons';
          }
        },
      },
    },
  },
});
