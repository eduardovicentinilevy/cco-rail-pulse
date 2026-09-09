import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const backendOrigin = env.VITE_BACKEND_ORIGIN ?? 'http://localhost:3333';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // Proxy do backend: o código do app usa caminhos relativos (/api, /socket.io)
      // em vez de hardcode de http://localhost:3333.
      proxy: {
        '/api': { target: backendOrigin, changeOrigin: true },
        '/socket.io': { target: backendOrigin, changeOrigin: true, ws: true },
        '/health': { target: backendOrigin, changeOrigin: true },
      },
    },
    build: {
      target: 'es2022',
      sourcemap: mode !== 'production',
      rollupOptions: {
        output: {
          // Isola libs pesadas do bundle da aplicação para melhorar o cache.
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('recharts') || id.includes('d3-')) return 'charts';
            if (id.includes('socket.io') || id.includes('engine.io')) return 'realtime';
            if (id.includes('react')) return 'react';
            return undefined;
          },
        },
      },
    },
  };
});
