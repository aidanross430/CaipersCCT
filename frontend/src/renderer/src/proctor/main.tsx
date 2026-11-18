// Entry point for the proctor client's window (proctor.html, --mode=proctor). Its preload is
// preload/proctor.ts, which exposes window.proctorApi only: there is no window.api, so nothing
// under proctor/ may import code that uses it (SessionContext, useChat, optionsContext,
// usePartnerStatus). Components and shared/ are fine
import '../assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ProctorApp from './ProctorApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProctorApp />
  </StrictMode>
)
