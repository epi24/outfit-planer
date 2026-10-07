import { useState } from 'react'
import { Link } from '../../app/Link'
import { paths } from '../../app/routes'
import { back } from '../../app/router'
import { nearestColors } from '../wada/data'
import { NotFound, ScreenHeader } from '../wada/parts'
import { swatchStyle } from '../wada/swatchStyle'
import { categoryLabel } from './categories'
import { type GarmentDraft, GarmentFields } from './GarmentFields'
import { type Garment, deleteGarment, garmentTitle, saveGarment, useWardrobe } from './store'
import { photoUrl } from './photoUrl'

const COLOR_LABELS = ['Hauptfarbe', 'Zweite Farbe', 'Dritte Farbe']

const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' })

export function GarmentDetail({ id }: { id: string }) {
  const { status, garments } = useWardrobe()
  const garment = garments.find((item) => item.id === id)

  if (status === 'loading') {
    return (
      <>
        <ScreenHeader title="Kleidungsstück" backTo={paths.wardrobe} />
        <p role="status">Wird geladen …</p>
      </>
    )
  }
  if (!garment) return <NotFound />
  return <Loaded key={garment.id} garment={garment} />
}

function Loaded({ garment }: { garment: Garment }) {
  const [draft, setDraft] = useState<GarmentDraft | null>(null)
  const [categoryMissing, setCategoryMissing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function saveEdit() {
    if (!draft) return
    if (draft.category === '') {
      setCategoryMissing(true)
      return
    }
    try {
      await saveGarment({
        ...garment,
        category: draft.category,
        name: draft.name.trim(),
        note: draft.note.trim(),
        colors: draft.colors,
      })
      setDraft(null)
      setProblem(null)
    } catch {
      setProblem('Speichern hat nicht geklappt.')
    }
  }

  async function remove() {
    try {
      await deleteGarment(garment.id)
      back(paths.wardrobe)
    } catch {
      setProblem('Löschen hat nicht geklappt.')
    }
  }

  return (
    <>
      <ScreenHeader
        title={garmentTitle(garment)}
        subtitle={garment.name ? categoryLabel(garment.category) : undefined}
        backTo={paths.wardrobe}
      />

      <div className="garment-photo">
        <img src={photoUrl(garment.image)} alt={`Foto: ${garmentTitle(garment)}`} />
      </div>

      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}

      {draft ? (
        <form
          className="garment-form"
          onSubmit={(event) => {
            event.preventDefault()
            void saveEdit()
          }}
          noValidate
        >
          <GarmentFields
            draft={draft}
            onChange={(next) => {
              if (next.category !== '') setCategoryMissing(false)
              setDraft(next)
            }}
            categoryMissing={categoryMissing}
          />
          <button type="submit" className="button">
            Speichern
          </button>
          <button type="button" className="button secondary" onClick={() => setDraft(null)}>
            Abbrechen
          </button>
        </form>
      ) : (
        <>
          <section>
            <h2>Farben</h2>
            <ul className="garment-colors">
              {garment.colors.map((color, index) => {
                const wada = nearestColors(color.hex, 1)[0]?.color
                return (
                  <li key={index}>
                    <span className="swatch chip" style={swatchStyle(color.hex)} aria-hidden="true" />
                    <span className="color-field-text">
                      <strong>{COLOR_LABELS[index]}</strong>
                      <span>
                        {color.hex}
                        {wada && (
                          <>
                            {' · ähnlich: '}
                            <span lang="en">{wada.name}</span>
                          </>
                        )}
                      </span>
                    </span>
                    <Link className="text-link" to={paths.custom(color.hex)}>
                      Passende Kombinationen
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>

          {garment.note && (
            <section>
              <h2>Notiz</h2>
              <p className="garment-note">{garment.note}</p>
            </section>
          )}

          <p className="hint garment-added">
            Hinzugefügt am {dateFormat.format(garment.createdAt)}
          </p>

          <div className="garment-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                setDraft({
                  category: garment.category,
                  name: garment.name,
                  note: garment.note,
                  colors: garment.colors,
                })
              }
            >
              Bearbeiten
            </button>
            {confirmDelete ? (
              <div className="confirm" role="group" aria-label="Löschen bestätigen">
                <p>Dieses Kleidungsstück wirklich löschen?</p>
                <button type="button" className="button danger" onClick={() => void remove()}>
                  Ja, löschen
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setConfirmDelete(false)}
                >
                  Abbrechen
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="button secondary"
                onClick={() => setConfirmDelete(true)}
              >
                Löschen
              </button>
            )}
          </div>
        </>
      )}
    </>
  )
}
