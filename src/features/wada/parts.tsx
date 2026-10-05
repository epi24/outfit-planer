import { useEffect, useState } from 'react'
import { Link } from '../../app/Link'
import { paths } from '../../app/routes'
import { back } from '../../app/router'
import { type Combination, type WadaColor, colorsOf, groupBySize } from './data'
import { swatchStyle } from './swatchStyle'

export function ScreenHeader({
  title,
  subtitle,
  backTo,
  lang,
}: {
  title: string
  subtitle?: string
  /** tab root to fall back to when there is no history to go back to */
  backTo?: string
  lang?: string
}) {
  return (
    <header className="screen-header">
      {backTo && (
        <button type="button" className="back" onClick={() => back(backTo)}>
          ‹ Zurück
        </button>
      )}
      <h1 tabIndex={-1} lang={lang}>
        {title}
      </h1>
      {subtitle && <p className="subtitle">{subtitle}</p>}
    </header>
  )
}

/** Equal-width colour stripes; the dataset has no proportions. */
export function Stripes({ colors, pickedId }: { colors: readonly WadaColor[]; pickedId?: number }) {
  return (
    <span className="stripes" aria-hidden="true">
      {colors.map((color) => (
        <span
          key={color.id}
          className={color.id === pickedId ? 'is-picked' : undefined}
          style={swatchStyle(color.hex, { color: color.textColor })}
        />
      ))}
    </span>
  )
}

export function CombinationCard({
  combination,
  pickedId,
}: {
  combination: Combination
  /** colour to mark, on pages that list the combinations of one colour */
  pickedId?: number
}) {
  const members = colorsOf(combination)
  const names = members.map((color) => color.name).join(', ')
  return (
    <Link
      className="card"
      to={paths.combination(combination.id)}
      data-combination={combination.id}
      aria-label={`Kombination ${combination.id}: ${names}`}
    >
      <Stripes colors={members} pickedId={pickedId} />
      <span className="card-caption">
        <span className="card-id">#{combination.id}</span>
        <span className="card-names" lang="en">
          {members.map((color, index) => (
            <span key={color.id}>
              {index > 0 && ' · '}
              {color.id === pickedId ? <strong>{color.name}</strong> : color.name}
            </span>
          ))}
        </span>
      </span>
    </Link>
  )
}

/** Combinations under the sub-headings "2 Farben", "3 Farben", "4 Farben". */
export function CombinationGroups({
  combinations,
  pickedId,
}: {
  combinations: readonly Combination[]
  pickedId?: number
}) {
  return (
    <>
      {groupBySize(combinations).map((group) => (
        <div key={group.size} className="group">
          <h3>
            {group.size} Farben <small>{group.items.length}</small>
          </h3>
          <ul className="card-list">
            {group.items.map((combination) => (
              <li key={combination.id}>
                <CombinationCard combination={combination} pickedId={pickedId} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}

type CopyState = 'idle' | 'copied' | 'failed'

const COPY_LABELS: Record<CopyState, string> = {
  idle: 'Kopieren',
  copied: 'Kopiert',
  failed: 'Kopieren nicht möglich',
}

export function CopyHex({ hex, name }: { hex: string; name: string }) {
  const [state, setState] = useState<CopyState>('idle')

  useEffect(() => {
    if (state === 'idle') return
    const timer = window.setTimeout(() => setState('idle'), 1500)
    return () => window.clearTimeout(timer)
  }, [state])

  function copy() {
    // The clipboard is missing on pages that are not served securely.
    if (!navigator.clipboard) {
      setState('failed')
      return
    }
    navigator.clipboard.writeText(hex).then(
      () => setState('copied'),
      () => setState('failed'),
    )
  }

  return (
    <>
      <button
        type="button"
        className="copy-hex"
        onClick={copy}
        aria-label={`Hex-Wert ${hex} von ${name} kopieren`}
      >
        <span className="hex">{hex}</span>
        <span className="copy-state" aria-hidden="true">
          {COPY_LABELS[state]}
        </span>
      </button>
      {/* Outside the button, whose label is fixed: this is what gets announced. */}
      <span className="visually-hidden" role="status">
        {state === 'idle' ? '' : COPY_LABELS[state]}
      </span>
    </>
  )
}

export function NotFound() {
  return (
    <>
      <ScreenHeader title="Diese Seite gibt es nicht." />
      <p>
        <Link className="text-link" to={paths.combinations}>
          Zu den Kombinationen
        </Link>
      </p>
    </>
  )
}
