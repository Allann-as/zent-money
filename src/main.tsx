import React from 'react'
import ReactDOM from 'react-dom/client'
import '@/design/tokens.css'
import { App } from '@/app/App'
import { QuickEntryApp } from '@/app/QuickEntryApp'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root não encontrado')

// A mini-janela da bandeja (M5) carrega o MESMO bundle com `#quick`; o preload
// expõe `windowKind` a partir do hash. Aqui decidimos o que montar.
const Root = window.zent.windowKind === 'quick' ? QuickEntryApp : App

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
