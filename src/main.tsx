import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './app/App'
import './app/app.css'
import './features/wada/wada.css'
import './features/wardrobe/wardrobe.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    // iOS resumes an installed web app instead of reloading it, so look for a
    // new version whenever the app comes back to the foreground.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {})
    })
  },
  // A new version is active. Reloading right away would throw away search,
  // filter and scroll position mid-use, so wait until the app is in the background.
  onNeedReload() {
    if (document.visibilityState === 'hidden') {
      window.location.reload()
      return
    }
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.visibilityState === 'hidden') window.location.reload()
      },
      { once: true },
    )
  },
})
