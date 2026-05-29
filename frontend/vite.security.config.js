/**
 * Vite 混淆和安全增强配置
 * 用于增加反编译难度和提高前端安全性
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import obfuscator from 'vite-plugin-javascript-obfuscator'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    
    // 代码混淆插件
    obfuscator({
      enable: true,
      options: {
        // 混淆选项
        compact: true,
        controlFlowFlattening: true,  // 控制流平坦化
        controlFlowFlatteningThreshold: 0.7,
        deadCodeInjection: true,  // 死代码注入
        deadCodeInjectionThreshold: 0.4,
        debugProtection: true,  // 调试保护
        debugProtectionInterval: 2000,
        disableConsoleOutput: true,  // 禁用控制台输出
        identifierNamesGenerator: 'mangled',  // 标识符重命名
        log: false,
        renameGlobals: false,
        rotateStringArray: true,  // 字符串数组旋转
        selfDefending: true,  // 自我防御
        shuffleStringArray: true,  // 字符串数组打乱
        splitStrings: true,  // 字符串分割
        splitStringsChunkLength: 10,
        transformObjectKeys: true,  // 对象键转换
        unicodeEscapeSequence: true,  // Unicode 转义序列
      },
      excludes: [],  // 排除的文件
    }),
  ],
  
  build: {
    // 代码分割优化
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
    // 混淆后禁用源码映射
    sourcemap: false,
    // 启用混淆
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,  // 移除 console
        drop_debugger: true,  // 移除 debugger
      },
      format: {
        comments: false,  // 移除注释
      },
    },
  },
  
  // 安全头配置
  server: {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
    },
  },
})
