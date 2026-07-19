import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Versão do PRODUTO (package.json), injetada em tempo de build. Em dev,
// `app.getVersion()` devolve a versão do Electron quando o app roda
// desempacotado — o rodapé mostraria algo como "v33.x". A constante resolve
// isso e mantém o número correto também no build empacotado.
const APP_VERSION = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION),
    },
    build: {
      lib: { entry: 'electron/main.ts' },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: { entry: 'electron/preload.ts' },
    },
  },
  renderer: {
    root: '.',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': resolve(__dirname, 'src') },
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'index.html'),
      },
    },
  },
})
