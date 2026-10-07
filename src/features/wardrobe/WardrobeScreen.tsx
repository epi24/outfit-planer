import { Link } from '../../app/Link'
import { paths } from '../../app/routes'
import { ScreenHeader } from '../wada/parts'
import { CATEGORIES, type CategoryId } from './categories'
import { type Garment, garmentTitle, useWardrobe } from './store'
import { photoUrl } from './photoUrl'

export type WardrobeFilter = CategoryId | 'all'

function Tile({ garment }: { garment: Garment }) {
  return (
    <Link className="garment-tile" to={paths.garment(garment.id)} data-garment={garment.id}>
      <span className="garment-thumb">
        <img src={photoUrl(garment.thumb)} alt="" />
      </span>
      <span className="garment-caption">{garmentTitle(garment)}</span>
      <span className="garment-dots" aria-hidden="true">
        {garment.colors.map((color, index) => (
          <span key={index} style={{ background: color.hex }} />
        ))}
      </span>
    </Link>
  )
}

interface Props {
  filter: WardrobeFilter
  onFilterChange: (filter: WardrobeFilter) => void
}

export function WardrobeScreen({ filter, onFilterChange }: Props) {
  const { status, garments } = useWardrobe()
  const used = CATEGORIES.filter((category) =>
    garments.some((garment) => garment.category === category.id),
  )
  // A filter whose last garment was deleted falls back to "all".
  const active = filter !== 'all' && used.some((category) => category.id === filter) ? filter : 'all'
  const visible = active === 'all' ? garments : garments.filter((g) => g.category === active)

  return (
    <>
      <ScreenHeader title="Kleiderschrank" />

      <Link className="button add-garment" to={paths.garmentNew}>
        Kleidungsstück hinzufügen
      </Link>

      {status === 'loading' && <p role="status">Kleiderschrank wird geladen …</p>}
      {status === 'error' && (
        <p className="error" role="alert">
          Der Speicher dieses Geräts ist nicht verfügbar. Im privaten Modus von Safari kann der
          Kleiderschrank nicht gespeichert werden.
        </p>
      )}

      {status === 'ready' && garments.length === 0 && (
        <p className="empty-wardrobe">
          Noch keine Kleidungsstücke. Fotografiere dein erstes Teil, die App stellt es frei und
          erkennt die Farben.
        </p>
      )}

      {used.length > 1 && (
        <div className="chips" role="radiogroup" aria-label="Art">
          {[{ id: 'all' as const, label: 'Alle' }, ...used].map((option) => (
            <label key={option.id}>
              <input
                className="visually-hidden"
                type="radio"
                name="wardrobe-filter"
                checked={active === option.id}
                onChange={() => onFilterChange(option.id)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      )}

      {garments.length > 0 && (
        <>
          <p className="status" aria-live="polite">
            {visible.length === 1 ? '1 Kleidungsstück' : `${visible.length} Kleidungsstücke`}
          </p>
          <ul className="garment-grid">
            {visible.map((garment) => (
              <li key={garment.id}>
                <Tile garment={garment} />
              </li>
            ))}
          </ul>
          <p className="app-footer">
            Die Fotos liegen nur auf diesem Gerät. Wenn du die App vom Home-Bildschirm löschst,
            sind sie weg.
          </p>
        </>
      )}
    </>
  )
}
