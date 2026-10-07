import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import { paths } from '../../app/routes'
import { navigate } from '../../app/router'
import { ScreenHeader } from '../wada/parts'
import {
  type GarmentColor,
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
  /** the model could not be used and the colour-based method stepped in */
  simple: boolean
}

const EMPTY_DRAFT: GarmentDraft = { category: '', name: '', note: '', colors: [] }

function detectColors(work: Work, keepBackground: boolean): GarmentColor[] {
  const { photo, lab } = work
  const mask = keepBackground ? new Uint8Array(work.mask.length).fill(1) : work.mask
  const colors = dominantColors(lab, mask, photo.width, photo.height)
  return colors.length > 0 ? colors : [{ hex: '#808080', share: 0 }]
}

/** Lets the browser paint (the "working" message) before a long computation. */
const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 50))

async function findGarment(photo: Photo, lab: Float32Array): Promise<Pick<Work, 'mask' | 'simple'>> {
  try {
    const { cutOut } = await import('./matte')
    return { mask: await cutOut(photo, lab), simple: false }
  } catch {
    // No model, e.g. offline before it was ever downloaded: fall back to
    // removing whatever matches the colour along the photo's edge.
    const tolerance = suggestTolerance(lab, photo.width, photo.height)
    return { mask: segment(lab, photo.width, photo.height, tolerance), simple: true }
  }
}

export function GarmentNew() {
  const [phase, setPhase] = useState<'pick' | 'working' | 'review'>('pick')
  const [work, setWork] = useState<Work | null>(null)
  const [keepBackground, setKeepBackground] = useState(false)
  const [draft, setDraft] = useState<GarmentDraft>(EMPTY_DRAFT)
  // Once the user has corrected a colour, the app leaves the colours alone.
  const [colorsEdited, setColorsEdited] = useState(false)
  const [categoryMissing, setCategoryMissing] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)

  // Start fetching the model while the user is still taking the photo.
  useEffect(() => {
    import('./matte').then((matte) => matte.loadModel()).catch(() => {})
  }, [])

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
      await nextFrame()
      const lab = rgbaToOklab(photo.pixels.data)
      const next: Work = { photo, lab, ...(await findGarment(photo, lab)) }
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

  function changeKeepBackground(keep: boolean) {
    if (!work) return
    setKeepBackground(keep)
    if (!colorsEdited) {
      setDraft((current) => ({ ...current, colors: detectColors(work, keep) }))
    }
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
  const notices: string[] = []
  if (work && !keepBackground) {
    if (work.simple) {
      notices.push(
        'Das Freistellen-Modell konnte nicht geladen werden (beim ersten Mal ist eine Internetverbindung nötig). Für dieses Foto wurde ein einfacheres Verfahren verwendet.',
      )
    }
    if (share < 0.01) {
      notices.push(
        'Es wurde kein Kleidungsstück erkannt. Nimm ein anderes Foto auf oder speichere dieses mit Hintergrund.',
      )
    } else if (share > 0.9) {
      notices.push(
        'Der Hintergrund wurde kaum entfernt. Fotografiere mit etwas Abstand, sodass ringsum Hintergrund zu sehen ist.',
      )
    }
  }

  return (
    <>
      <ScreenHeader title="Neues Kleidungsstück" backTo={paths.wardrobe} />

      {phase !== 'review' && (
        <section className="panel photo-pick">
          <p>
            Lege das Kleidungsstück flach hin und fotografiere so, dass es ganz im Bild ist und
            ringsum etwas Hintergrund zu sehen ist.
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
          {phase === 'working' && (
            <p role="status">
              Foto wird verarbeitet … Beim ersten Mal lädt die App dafür einmalig rund 18 MB nach.
            </p>
          )}
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

          {notices.map((notice) => (
            <p key={notice} className="notice" role="status">
              {notice}
            </p>
          ))}

          <label className="check">
            <input
              type="checkbox"
              checked={keepBackground}
              onChange={(event) => changeKeepBackground(event.target.checked)}
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
