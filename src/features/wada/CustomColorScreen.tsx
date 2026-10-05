import { useMemo } from 'react'
import { Link } from '../../app/Link'
import { paths } from '../../app/routes'
import { navigate } from '../../app/router'
import { type Closeness, textOn } from './color'
import { combinationsForColor, nearestColors } from './data'
import { FreeColorControl } from './FreeColorControl'
import { CombinationGroups, CopyHex, ScreenHeader } from './parts'
import { swatchStyle } from './swatchStyle'

const CLOSENESS_LABELS: Record<Closeness, string> = {
  identical: 'fast identisch',
  veryClose: 'sehr ähnlich',
  close: 'ähnlich',
  far: 'nur entfernt ähnlich',
}

const countLabel = (n: number) => (n === 1 ? '1 Kombination' : `${n} Kombinationen`)

export function CustomColorScreen({ hex }: { hex: string }) {
  const matches = useMemo(
    () =>
      nearestColors(hex, 3).map((match) => ({
        ...match,
        combinations: combinationsForColor(match.color.id),
      })),
    [hex],
  )

  return (
    <>
      <ScreenHeader title="Eigene Farbe" backTo={paths.colors} />

      <div className="swatch hero" style={swatchStyle(hex, { color: textOn(hex) })}>
        {hex}
      </div>
      <div className="meta">
        <CopyHex key={hex} hex={hex} name="eigene Farbe" />
      </div>

      {/* replace: trying several colours should not pile up history entries */}
      <FreeColorControl
        key={hex}
        initialHex={hex}
        submitLabel="Aktualisieren"
        onSubmit={(next) => navigate(paths.custom(next), { replace: true })}
      />

      <section>
        <h2>Ähnlichste Wada-Farben</h2>
        {matches[0]?.closeness === 'far' && (
          <p className="notice">
            Die Wada-Palette enthält keine wirklich ähnliche Farbe – die Vorschläge sind nur
            Annäherungen.
          </p>
        )}
        <ul className="match-list">
          {matches.map((match) => (
            <li key={match.color.id}>
              <Link className="match" to={paths.color(match.color.id)} data-match={match.color.id}>
                <span className="split-chip" aria-hidden="true">
                  <span style={swatchStyle(hex)} />
                  <span style={swatchStyle(match.color.hex)} />
                </span>
                <span className="match-text">
                  <strong lang="en">{match.color.name}</strong>
                  <span>
                    {match.color.hex} · {CLOSENESS_LABELS[match.closeness]} ·{' '}
                    {countLabel(match.combinations.length)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* All three matches: the nearest one often has only one or two
          combinations, or is practically tied with the second. */}
      {matches.map((match) => (
        <section key={match.color.id}>
          <h2>
            Kombinationen mit <span lang="en">{match.color.name}</span>{' '}
            <small>{match.combinations.length}</small>
          </h2>
          <CombinationGroups combinations={match.combinations} pickedId={match.color.id} />
        </section>
      ))}
    </>
  )
}
