import { useMemo, useRef } from 'react'
import { paths } from '../../app/routes'
import { forgetScroll } from '../../app/router'
import { type SizeFilter, searchCombinations } from './data'
import { CombinationCard, ScreenHeader } from './parts'

const SIZES: readonly { value: SizeFilter; label: string }[] = [
  { value: 0, label: 'Alle' },
  { value: 2, label: '2 Farben' },
  { value: 3, label: '3 Farben' },
  { value: 4, label: '4 Farben' },
]

const BUILD_TIME = new Date(__BUILD_TIME__).toLocaleString('de-DE', {
  dateStyle: 'short',
  timeStyle: 'short',
})

interface Props {
  query: string
  size: SizeFilter
  onQueryChange: (query: string) => void
  onSizeChange: (size: SizeFilter) => void
}

export function CombinationsScreen({ query, size, onQueryChange, onSizeChange }: Props) {
  const matches = useMemo(() => searchCombinations(query), [query])
  const counts = useMemo(() => {
    const result: Record<SizeFilter, number> = { 0: matches.length, 2: 0, 3: 0, 4: 0 }
    for (const combination of matches) result[combination.size]++
    return result
  }, [matches])
  const visible = size === 0 ? matches : matches.filter((combination) => combination.size === size)

  const listStart = useRef<HTMLDivElement>(null)
  const filters = useRef<HTMLDivElement>(null)

  // After a filter or search change the list starts over. Scroll up only as
  // far as the point where the filter block becomes stuck, so that the focused
  // search field does not move under the user's fingers.
  function scrollToListStart() {
    if (!listStart.current || !filters.current) return
    const stickyTop = parseFloat(getComputedStyle(filters.current).top) || 0
    const stuckAt = listStart.current.getBoundingClientRect().top + window.scrollY - stickyTop
    window.scrollTo(0, Math.min(window.scrollY, Math.max(0, stuckAt)))
  }

  function change(nextQuery: string, nextSize: SizeFilter) {
    onQueryChange(nextQuery)
    onSizeChange(nextSize)
    // Offsets remembered for this page belonged to the previous list.
    forgetScroll(paths.combinations)
    scrollToListStart()
  }

  return (
    <>
      <ScreenHeader title="Kombinationen" />
      <div ref={listStart} />
      <div className="filters" ref={filters}>
        <label className="visually-hidden" htmlFor="combination-search">
          Kombinationen durchsuchen
        </label>
        <input
          id="combination-search"
          className="text-input"
          type="search"
          placeholder="Farbname oder Nummer"
          value={query}
          onChange={(event) => change(event.target.value, size)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
        />
        <div className="segmented" role="radiogroup" aria-label="Anzahl Farben">
          {SIZES.map((option) => (
            <label key={option.value}>
              <input
                className="visually-hidden"
                type="radio"
                name="combination-size"
                checked={size === option.value}
                onChange={() => change(query, option.value)}
              />
              <span>
                {option.label}
                <small>{counts[option.value]}</small>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* .results keeps the page tall enough for the filter block to stay
          stuck when only a few cards are left. */}
      <div className="results">
        <p className="status" aria-live="polite">
          {visible.length === 1 ? '1 Kombination' : `${visible.length} Kombinationen`}
        </p>

        {visible.length > 0 ? (
          <ul className="card-list">
            {visible.map((combination) => (
              <li key={combination.id}>
                <CombinationCard combination={combination} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">
            <p>Keine Kombination gefunden.</p>
            <button type="button" className="button" onClick={() => change('', 0)}>
              Suche und Filter zurücksetzen
            </button>
          </div>
        )}
      </div>

      <footer className="app-footer">
        <p>
          Farben und Kombinationen nach Sanzo Wada, <span lang="en">A Dictionary of Color
          Combinations</span>. Daten: dictionary-of-colour-combinations (MIT), Darstellung wie auf
          sanzo-wada.dmbk.io.
        </p>
        <p>Stand: {BUILD_TIME}</p>
      </footer>
    </>
  )
}
