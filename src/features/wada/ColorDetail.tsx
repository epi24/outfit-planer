import { Link } from '../../app/Link'
import { paths } from '../../app/routes'
import { COLLECTION_LABELS, colorById, colors, combinationsForColor, partnersOf } from './data'
import { CombinationGroups, CopyHex, NotFound, ScreenHeader } from './parts'
import { swatchStyle } from './swatchStyle'

export function ColorDetail({ id }: { id: number }) {
  const color = colorById(id)
  if (!color) return <NotFound />
  const partners = partnersOf(id)
  const list = combinationsForColor(id)

  return (
    <>
      <ScreenHeader title={color.name} lang="en" backTo={paths.colors} />

      <div className="swatch hero" style={swatchStyle(color.hex, { color: color.textColor })}>
        {color.hex}
      </div>
      <div className="meta">
        <CopyHex key={color.hex} hex={color.hex} name={color.name} />
        <span>
          Farbe {color.id} von {colors.length} · {COLLECTION_LABELS[color.collection]}
        </span>
      </div>

      <section>
        <h2>
          Passt zu <small>{partners.length === 1 ? '1 Farbe' : `${partners.length} Farben`}</small>
        </h2>
        <div className="partner-grid">
          {partners.map(({ color: partner, shared }) => (
            <Link
              key={partner.id}
              className="swatch"
              to={paths.color(partner.id)}
              style={swatchStyle(partner.hex)}
              title={partner.name}
              lang={shared > 1 ? undefined : 'en'}
              aria-label={
                shared > 1 ? `${partner.name}, ${shared} gemeinsame Kombinationen` : partner.name
              }
              data-partner={partner.id}
            >
              {shared > 1 && <span className="badge">{shared}×</span>}
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2>
          Kombinationen <small>{list.length}</small>
        </h2>
        <CombinationGroups combinations={list} pickedId={id} />
      </section>
    </>
  )
}
