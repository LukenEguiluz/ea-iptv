import { writeFileSync, cpSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const buildVersion = process.env.BUILD_VERSION || String(Date.now())

function deployVersionPlugin(version) {
  return {
    name: 'deploy-version',
    closeBundle() {
      writeFileSync(
        resolve(__dirname, 'dist/version.json'),
        JSON.stringify({ version, builtAt: new Date().toISOString() }),
      )
      const vendorSrc = resolve(__dirname, 'node_modules/avbridge/vendor')
      const vendorDest = resolve(__dirname, 'dist/vendor')
      if (existsSync(vendorSrc)) {
        cpSync(vendorSrc, vendorDest, { recursive: true })
      }
    },
  }
}

export default defineConfig({
  define: {
    __APP_BUILD_VERSION__: JSON.stringify(buildVersion),
  },
  plugins: [react(), deployVersionPlugin(buildVersion)],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_PROXY_TARGET || 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
