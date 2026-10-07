import type { ReactNode } from 'react'
import { Link } from './Link'
import { type Tab, paths } from './routes'

interface TabEntry {
  tab: Tab
  path: string
  label: string
  icon: ReactNode
}

// Later features add one entry here.
const TABS: readonly TabEntry[] = [
  {
    tab: 'combinations',
    path: paths.combinations,
    label: 'Kombinationen',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4" width="5" height="16" rx="1.5" />
        <rect x="9.5" y="4" width="5" height="16" rx="1.5" />
        <rect x="16" y="4" width="5" height="16" rx="1.5" />
      </svg>
    ),
  },
  {
    tab: 'colors',
    path: paths.colors,
    label: 'Farbe wählen',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3c3.2 4 6 7.2 6 10.5a6 6 0 0 1-12 0C6 10.2 8.8 7 12 3z" />
      </svg>
    ),
  },
  {
    tab: 'wardrobe',
    path: paths.wardrobe,
    label: 'Kleiderschrank',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 3h6l5 3-2 4-2-1v11H8V9l-2 1-2-4 5-3zm1.2 1.6a1.9 1.9 0 0 0 3.6 0h-3.6z" />
      </svg>
    ),
  },
]

export function TabBar({ active, path }: { active: Tab | null; path: string }) {
  return (
    <nav className="tabbar" aria-label="Hauptnavigation">
      {TABS.map((entry) => (
        <Link
          key={entry.tab}
          to={entry.path}
          aria-current={active === entry.tab ? 'page' : undefined}
          onClick={(event) => {
            // Tapping the tab that is already open scrolls its list to the top.
            if (path === entry.path) {
              event.preventDefault()
              window.scrollTo(0, 0)
            }
          }}
        >
          {entry.icon}
          <span>{entry.label}</span>
        </Link>
      ))}
    </nav>
  )
}
