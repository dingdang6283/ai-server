import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import obfuscatorPlugin from 'vite-plugin-javascript-obfuscator'
import sri from 'vite-plugin-sri4'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isProd = mode === 'production'

  return {
    define: {
      __API_HOST__: JSON.stringify(env.API_HOST || 'localhost'),
      __API_PROTOCOL__: JSON.stringify(env.API_PROTOCOL || 'http'),
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