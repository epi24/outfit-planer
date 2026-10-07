import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ColorDetail } from '../features/wada/ColorDetail'
import { ColorsScreen } from '../features/wada/ColorsScreen'
import { CombinationDetail } from '../features/wada/CombinationDetail'
import { CombinationsScreen } from '../features/wada/CombinationsScreen'
import { CustomColorScreen } from '../features/wada/CustomColorScreen'
import { type SizeFilter, colorById } from '../features/wada/data'
import { NotFound } from '../features/wada/parts'
import { GarmentDetail } from '../features/wardrobe/GarmentDetail'
import { GarmentNew } from '../features/wardrobe/GarmentNew'
import { type WardrobeFilter, WardrobeScreen } from '../features/wardrobe/WardrobeScreen'
import { type Route, parseRoute, tabOf } from './routes'
import { scrollTarget, useNav } from './router'
import { TabBar } from './TabBar'

const APP_NAME = 'Outfit Planner'

function titleOf(route: Route): string {
  switch (route.name) {
    case 'combinations':
      return 'Kombinationen'
    case 'combination':
      return `Kombination ${route.id}`
    case 'colors':
      return 'Farbe wählen'
    case 'color':
      return colorById(route.id)?.name ?? 'Farbe'
    case 'custom':
      return 'Eigene Farbe'
    case 'wardrobe':
      return 'Kleiderschrank'
    case 'garmentNew':
      return 'Neues Kleidungsstück'
    case 'garment':
      return 'Kleidungsstück'
    case 'notFound':
      return 'Nicht gefunden'
  }
}

export function App() {
  const nav = useNav()
  const route = useMemo(() => parseRoute(nav.path), [nav.path])

  // Lives here so that search and filter survive opening a detail page and
  // switching tabs.
  const [query, setQuery] = useState('')
  const [size, setSize] = useState<SizeFilter>(0)
  const [wardrobeFilter, setWardrobeFilter] = useState<WardrobeFilter>('all')

  // Restore the scroll position on push and back/forward, but not when an
  // entry is merely replaced (previous/next combination, updated colour).
  const restoredSeq = useRef(-1)
  useLayoutEffect(() => {
    if (restoredSeq.current === nav.scrollSeq) return
    restoredSeq.current = nav.scrollSeq
    window.scrollTo(0, scrollTarget(nav))
  }, [nav])

  const focusedPath = useRef(nav.path)
  useEffect(() => {
    document.title = `${titleOf(route)} – ${APP_NAME}`
    if (focusedPath.current === nav.path) return
    focusedPath.current = nav.path
    // Move screen-reader and keyboard focus to the new page's heading.
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true })
  }, [route, nav.path])

  let screen
  switch (route.name) {
    case 'combinations':
      screen = (
        <CombinationsScreen
          query={query}
          size={size}
          onQueryChange={setQuery}
          onSizeChange={setSize}
        />
      )
      break
    case 'combination':
      screen = <CombinationDetail id={route.id} />
      break
    case 'colors':
      screen = <ColorsScreen />
      break
    case 'color':
      screen = <ColorDetail id={route.id} />
      break
    case 'custom':
      screen = <CustomColorScreen hex={route.hex} />
      break
    case 'wardrobe':
      screen = <WardrobeScreen filter={wardrobeFilter} onFilterChange={setWardrobeFilter} />
      break
    case 'garmentNew':
      screen = <GarmentNew />
      break
    case 'garment':
      screen = <GarmentDetail id={route.id} />
      break
    case 'notFound':
      screen = <NotFound />
      break
  }

  return (
    <>
      <main>{screen}</main>
      <TabBar active={tabOf(route)} path={nav.path} />
    </>
  )
}
