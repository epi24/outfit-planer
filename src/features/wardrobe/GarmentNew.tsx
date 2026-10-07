import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import { paths } from '../../app/routes'
import { navigate } from '../../app/router'
import { ScreenHeader } from '../wada/parts'
import {
  type GarmentColor,
  MAX_TOLERANCE,
  MIN_TOLERANCE,
  coverage,
  dominantColors,
  rgbaToOklab,
  segment,
  suggestTolerance,
} from './cutout'
import { type GarmentDraft, GarmentFields } from './GarmentFields'
import { type Photo, exportCutout, loadPhoto, paintCutout } from './image'
import { newGarmentId, saveGarment } from './store'

interface Work {
  photo: Photo
  lab: Float32Array
  /** 1 = garment */
  mask: Uint8Array
  tolerance: number
}

const EMPTY_DRAFT: GarmentDraft = { category: '', name: '', note: '', colors: [] }

function detectColors(work: Work, keepBackground: boolean): GarmentColor[] {
  const { photo, lab } = work
  const mask = keepBackground ? new Uint8Array(work.mask.length).fill(1) : work.mask
  const colors = dominantColors(lab, mask, photo.width, photo.height)
  return colors.length > 0 ? colors : [{ hex: '#808080', share: 0 }]
}

export function GarmentNew() {
  const [phase, setPhase] = useState<'pick' | 'working' | 'review'>('pick')
  const [work, setWork] = useState<Work | null>(null)
  const [keepBackground, setKeepBackground] = useState(false)
  const [draft, setDraft] = useState<GarmentDraft>(EMPTY_DRAFT)
  // Once the user has corrected a colour, moving the slider leaves colours alone.
  const [colorsEdited, setColorsEdited] = useState(false)
  const [categoryMissing, setCategoryMissing] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (phase === 'review' && work && canvas.current) {
      paintCutout(canvas.current, work.photo, keepBackground ? null : work.mask)
    }
  }, [phase, work, keepBackground])

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // so that the same photo can be chosen again
    if (!file) return
    setPhase('working')
    setProblem(null)
    try {
      const photo = await loadPhoto(file)
      const lab = rgbaToOklab(photo.pixels.data)
      const tolerance = suggestTolerance(lab, photo.width, photo.height)
      const mask = segment(lab, photo.width, photo.height, tolerance)
      const next: Work = { photo, lab, mask, tolerance }
      setWork(next)
      setKeepBackground(false)
      setColorsEdited(false)
      setDraft((current) => ({ ...current, colors: detectColors(next, false) }))
      setPhase('review')
    } catch {
      setProblem('Das Foto konnte nicht geladen werden. Bitte versuche es mit einem anderen.')
      setPhase('pick')
    }
  }

  function update(next: Work, nextKeepBackground: boolean) {
    setWork(next)
    setKeepBackground(nextKeepBackground)
    if (!colorsEdited) {
      setDraft((current) => ({ ...current, colors: detectColors(next, nextKeepBackground) }))
    }
  }

  function changeTolerance(tolerance: number) {
    if (!work) return
    const { photo, lab } = work
    update({ ...work, tolerance, mask: segment(lab, photo.width, photo.height, tolerance) }, false)
  }

  function changeDraft(next: GarmentDraft) {
    if (next.colors !== draft.colors) setColorsEdited(true)
    if (next.category !== '') setCategoryMissing(false)
    setDraft(next)
  }

  async function save() {
    if (!work || !canvas.current || saving) return
    if (draft.category === '') {
      setCategoryMissing(true)
      return
    }
    setSaving(true)
    setProblem(null)
    try {
      const { image, thumb } = await exportCutout(canvas.current)
      const id = newGarmentId()
      await saveGarment({
        id,
        createdAt: Date.now(),
        category: draft.category,
        name: draft.name.trim(),
        note: draft.note.trim(),
        colors: draft.colors,
        image,
        thumb,
      })
      // replace: "back" from the new garment leads to the wardrobe, not here
      navigate(paths.garment(id), { replace: true })
    } catch {
      setProblem('Speichern hat nicht geklappt. Möglicherweise ist der Speicher voll.')
      setSaving(false)
    }
  }

  const share = work ? coverage(work.mask) : 0
  const warning =
    !work || keepBackground
      ? null
      : share < 0.01
        ? 'Es wurde kein Kleidungsstück erkannt. Schiebe den Regler nach links oder speichere das Foto mit Hintergrund.'
        : share > 0.85
          ? 'Der Hintergrund wurde kaum entfernt. Schiebe den Regler nach rechts oder fotografiere vor einer einfarbigen Fläche.'
          : null

  return (
    <>
      <ScreenHeader title="Neues Kleidungsstück" backTo={paths.wardrobe} />

      {phase !== 'review' && (
        <section className="panel photo-pick">
          <p>
            Lege das Kleidungsstück auf eine einfarbige Fläche, die sich farblich deutlich abhebt,
            und fotografiere so, dass ringsum Hintergrund zu sehen ist.
          </p>
          <label className="button">
            Foto aufnehmen
            <input
              className="visually-hidden"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={choose}
              disabled={phase === 'working'}
            />
          </label>
          <label className="button secondary">
            Aus Fotos wählen
            <input
              className="visually-hidden"
              type="file"
              accept="image/*"
              onChange={choose}
              disabled={phase === 'working'}
            />
          </label>
          {phase === 'working' && <p role="status">Foto wird verarbeitet …</p>}
        </section>
      )}

      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}

      {phase === 'review' && work && (
        <form
          className="garment-form"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
          noValidate
        >
          <div className="cutout-preview">
            <canvas ref={canvas} aria-label="Vorschau des freigestellten Kleidungsstücks" />
          </div>

          <div className="field">
            <label htmlFor="cutout-tolerance">Hintergrund entfernen</label>
            <input
              id="cutout-tolerance"
              type="range"
              min={MIN_TOLERANCE}
              max={MAX_TOLERANCE}
              step={0.01}
              value={work.tolerance}
              disabled={keepBackground}
              onChange={(event) => changeTolerance(Number(event.target.value))}
            />
            <p className="range-ends" aria-hidden="true">
              <span>weniger</span>
              <span>mehr</span>
            </p>
            <p className="hint">
              Fehlen Teile des Kleidungsstücks, schiebe nach links. Bleibt Hintergrund stehen,
              schiebe nach rechts.
            </p>
          </div>

          {warning && (
            <p className="notice" role="status">
              {warning}
            </p>
          )}

          <label className="check">
            <input
              type="checkbox"
              checked={keepBackground}
              onChange={(event) => update(work, event.target.checked)}
            />
            Hintergrund nicht entfernen
          </label>

          <GarmentFields draft={draft} onChange={changeDraft} categoryMissing={categoryMissing} />

          <button type="submit" className="button" disabled={saving}>
            {saving ? 'Wird gespeichert …' : 'Speichern'}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => setPhase('pick')}
            disabled={saving}
          >
            Anderes Foto
          </button>
        </form>
      )}
    </>
  )
}
