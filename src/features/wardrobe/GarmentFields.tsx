import { useId } from 'react'
import { nearestColors } from '../wada/data'
import { CATEGORIES, type CategoryId, isCategoryId } from './categories'
import type { GarmentColor } from './cutout'

export interface GarmentDraft {
  category: CategoryId | ''
  name: string
  note: string
  /** main colour first */
  colors: GarmentColor[]
}

const MAX_COLORS = 3
const COLOR_LABELS = ['Hauptfarbe', 'Zweite Farbe', 'Dritte Farbe']

interface Props {
  draft: GarmentDraft
  onChange: (draft: GarmentDraft) => void
  /** show the "choose a type" error */
  categoryMissing: boolean
}

/** The editable details of a garment, shared by the add and the edit form. */
export function GarmentFields({ draft, onChange, categoryMissing }: Props) {
  const id = useId()
  const setColor = (index: number, hex: string) =>
    onChange({
      ...draft,
      colors: draft.colors.map((color, i) => (i === index ? { ...color, hex } : color)),
    })

  return (
    <div className="garment-fields">
      <div className="field">
        <label htmlFor={`${id}-category`}>Art</label>
        <select
          id={`${id}-category`}
          className="text-input"
          value={draft.category}
          onChange={(event) => {
            const value = event.target.value
            onChange({ ...draft, category: isCategoryId(value) ? value : '' })
          }}
          aria-invalid={categoryMissing || undefined}
          aria-describedby={categoryMissing ? `${id}-category-error` : undefined}
        >
          <option value="">Bitte wählen</option>
          {CATEGORIES.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
        {categoryMissing && (
          <p id={`${id}-category-error`} className="error" role="alert">
            Bitte wähle aus, was für ein Kleidungsstück das ist.
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor={`${id}-name`}>Name (optional)</label>
        <input
          id={`${id}-name`}
          className="text-input"
          type="text"
          placeholder="z. B. blaues Leinenhemd"
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          autoComplete="off"
        />
      </div>

      <fieldset className="field color-fields">
        <legend>Farben</legend>
        <ul>
          {draft.colors.map((color, index) => {
            const wada = nearestColors(color.hex, 1)[0]?.color
            return (
              <li key={index}>
                <label className="color-well">
                  <span className="visually-hidden">{COLOR_LABELS[index]} ändern</span>
                  <input
                    type="color"
                    value={color.hex}
                    onChange={(event) => setColor(index, event.target.value)}
                  />
                </label>
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
                {draft.colors.length > 1 && (
                  <button
                    type="button"
                    className="quiet-button"
                    onClick={() =>
                      onChange({ ...draft, colors: draft.colors.filter((_, i) => i !== index) })
                    }
                    aria-label={`${COLOR_LABELS[index]} entfernen`}
                  >
                    Entfernen
                  </button>
                )}
              </li>
            )
          })}
        </ul>
        {draft.colors.length < MAX_COLORS && (
          <button
            type="button"
            className="quiet-button"
            onClick={() =>
              onChange({ ...draft, colors: [...draft.colors, { hex: '#808080', share: 0 }] })
            }
          >
            Farbe hinzufügen
          </button>
        )}
        <p className="hint">Stimmt eine Farbe nicht? Tippe auf das Farbfeld, um sie zu ändern.</p>
      </fieldset>

      <div className="field">
        <label htmlFor={`${id}-note`}>Notiz (optional)</label>
        <textarea
          id={`${id}-note`}
          className="text-input"
          rows={3}
          value={draft.note}
          onChange={(event) => onChange({ ...draft, note: event.target.value })}
        />
      </div>
    </div>
  )
}
