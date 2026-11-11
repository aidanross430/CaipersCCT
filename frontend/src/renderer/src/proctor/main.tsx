// Entry point for the proctor page (proctor.html). This runs in an ordinary browser on the
// proctor's machine, not in Electron: there is no window.api, so nothing under proctor/ may
// import code that uses it (SessionContext, useChat, optionsContext). Components and shared/
// are fine
import '../assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ProctorApp from './ProctorApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProctorApp />
  </StrictMode>
)
