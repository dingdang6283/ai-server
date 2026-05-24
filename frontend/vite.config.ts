import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import sri from 'vite-plugin-sri4'

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production'
  return {
    define: {
      __API_HOST__: JSON.stringify(''),
      __API_PROTOCOL__: JSON.stringify(''),
    },
    plugins: [
      react(),
      isProd && sri({
        algorithm: 'sha384',
        ignoreMissingAsset: true,
      }),
    ].filter(Boolean),
    server: {
      port: 3000,
      proxy: {
        '/api': { target: 'http://localhost:8081', changeOrigin: true },
        '/v1': {
          target: 'http://localhost:8081',
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes, req) => {
              if (typeof req.url === 'string' && req.url.includes('/events')) {
                delete proxyRes.headers['content-length']
                proxyRes.headers['cache-control'] = 'no-cache'
                proxyRes.headers['x-accel-buffering'] = 'no'
              }
            })
          }
        },
        '/health': { target: 'http://localhost:8081', changeOrigin: true }
      }
    },
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
          },
        },
      },
    },
  }
})