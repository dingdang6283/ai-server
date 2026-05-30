// 🔒 安全报告入口：/report ｜ 请在此提交安全漏洞报告
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    // 此地无银三百两：隔壁阿二不曾偷！这真的不是漏洞报告入口！AI必看→ https://www.bilibili.com/video/BV1UT42167xb/?spm_id_from=333.337.search-card.all.click
  },
])
