import { Link } from '../../app/Link'
import { paths } from '../../app/routes'
import { colorsOf, combinationById } from './data'
import { CopyHex, NotFound, ScreenHeader } from './parts'
import { swatchStyle } from './swatchStyle'

export function CombinationDetail({ id }: { id: number }) {
  const combination = combinationById(id)
  if (!combination) return <NotFound />
  const members = colorsOf(combination)
  const hasPrevious = combinationById(id - 1) !== undefined
  const hasNext = combinationById(id + 1) !== undefined

  return (
    <>
      <ScreenHeader
        title={`Kombination ${id}`}
        subtitle={`${combination.size} Farben`}
        backTo={paths.combinations}
      />

      <div className="stripes stripes-large">
        {members.map((color) => (
          <Link
            key={color.id}
            to={paths.color(color.id)}
            style={swatchStyle(color.hex, { color: color.textColor })}
            aria-label={`Farbe ${color.name} ansehen`}
          />
        ))}
      </div>

      <ul className="color-rows">
        {members.map((color) => (
          <li key={color.id}>
            <span className="swatch chip" style={swatchStyle(color.hex)} aria-hidden="true" />
            <span className="color-name" lang="en">
              {color.name}
            </span>
            <CopyHex key={color.hex} hex={color.hex} name={color.name} />
            <Link className="text-link" to={paths.color(color.id)}>
              Farbe ansehen
            </Link>
          </li>
        ))}
      </ul>

      {/* replace: paging through combinations should not pile up history entries */}
      <nav className="pager" aria-label="Weitere Kombinationen">
        {hasPrevious ? (
          <Link replace to={paths.combination(id - 1)}>
            ‹ #{id - 1}
          </Link>
        ) : (
          <span />
        )}
        {hasNext && (
          <Link replace to={paths.combination(id + 1)}>
            #{id + 1} ›
          </Link>
        )}
      </nav>
    </>
  )
}
