import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// Enable HTTPS by default so modern mobile browsers (Safari on iOS, Chrome on Android)
// and Android WebView grant navigator.mediaDevices.getUserMedia for live WebRTC barcode scanning without insecure context restrictions.
// Can be explicitly disabled if needed via HTTPS=false, SSL=false, or NO_SSL=true.
const isSslDisabled = process.env.HTTPS === 'false' || process.env.SSL === 'false' || process.env.NO_SSL === 'true'
const isSslEnabled = !isSslDisabled

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
    ...(isSslEnabled ? [basicSsl()] : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/app'),
    },
  },
  server: {
    host: true,
    ...(isSslEnabled ? { https: true } : {}),
    allowedHosts: [
      'civilian-wallet-flying-poster.trycloudflare.com',
      '.trycloudflare.com',
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
  preview: {
    host: true,
    allowedHosts: [
      'civilian-wallet-flying-poster.trycloudflare.com',
      '.trycloudflare.com',
    ],
  },
})
