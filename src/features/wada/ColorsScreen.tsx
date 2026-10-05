import { Link } from '../../app/Link'
import { paths } from '../../app/routes'
import { navigate } from '../../app/router'
import { collections } from './data'
import { FreeColorControl } from './FreeColorControl'
import { ScreenHeader } from './parts'
import { swatchStyle } from './swatchStyle'

export function ColorsScreen() {
  return (
    <>
      <ScreenHeader title="Farbe wählen" />

      <section className="panel" aria-labelledby="free-color-title">
        <h2 id="free-color-title">Eigene Farbe</h2>
        <p className="hint">
          Farbe wählen oder Hex-Wert eingeben – die App sucht die ähnlichsten Wada-Farben.
        </p>
        <FreeColorControl
          submitLabel="Passende Farben finden"
          onSubmit={(hex) => navigate(paths.custom(hex))}
        />
      </section>

      {collections.map((group) => (
        <section key={group.label}>
          <h2>
            {group.label} <small>{group.colors.length}</small>
          </h2>
          <div className="swatch-grid">
            {group.colors.map((color) => (
              <Link
                key={color.id}
                className="swatch"
                to={paths.color(color.id)}
                style={swatchStyle(color.hex)}
                aria-label={color.name}
                title={color.name}
                lang="en"
                data-color={color.id}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  )
}
