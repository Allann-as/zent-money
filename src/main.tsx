import React from 'react'
import ReactDOM from 'react-dom/client'
import '@/design/tokens.css'
import { App } from '@/app/App'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root não encontrado')

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
