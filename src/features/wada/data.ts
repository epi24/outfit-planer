import json from 'dictionary-of-colour-combinations/colors.json'
import {
  type Closeness,
  type Cmyk,
  type Oklab,
  chroma,
  closeness,
  cmykToHex,
  deltaEOK2,
  hexToOklab,
  textOn,
} from './color'

interface RawColor {
  name: string
  combinations: number[]
  swatch: number
  cmyk: number[]
}

export type ComboSize = 2 | 3 | 4
export type SizeFilter = 0 | ComboSize
export type Collection = 0 | 1 | 2 | 3 | 4 | 5

export interface WadaColor {
  /** 1..159, book order */
  id: number
  name: string
  collection: Collection
  cmyk: Cmyk
  /** website-style colour, see cmykToHex */
  hex: string
  oklab: Oklab
  textColor: string
  combinationIds: readonly number[]
}

export interface Combination {
  /** 1..348 */
  id: number
  size: ComboSize
  /** ascending, i.e. book order */
  colorIds: readonly number[]
}

export interface Partner {
  color: WadaColor
  /** number of combinations both colours appear in */
  shared: number
}

export interface Match {
  color: WadaColor
  distance: number
  closeness: Closeness
}

export const COLLECTION_LABELS = [
  'Rosa & Rot',
  'Gelb, Orange & Braun',
  'Grün',
  'Blau & Blaugrün',
  'Violett & Purpur',
  'Weiß, Grau & Schwarz',
] as const

const COLOR_COUNT = 159
const COMBINATION_COUNT = 348

function fail(message: string): never {
  throw new Error(`Wada-Daten: ${message}`)
}

const isCollection = (value: number): value is Collection =>
  Number.isInteger(value) && value >= 0 && value <= 5

function buildColors(raw: readonly RawColor[]): WadaColor[] {
  if (raw.length !== COLOR_COUNT) fail(`${raw.length} statt ${COLOR_COUNT} Farben`)
  const names = new Set<string>()
  return raw.map((entry, index) => {
    if (names.has(entry.name)) fail(`Farbname doppelt: ${entry.name}`)
    names.add(entry.name)
    const collection = entry.swatch
    if (!isCollection(collection)) fail(`ungültige Gruppe bei ${entry.name}`)
    if (entry.cmyk.length !== 4) fail(`ungültiges CMYK bei ${entry.name}`)
    const [c = 0, m = 0, y = 0, k = 0] = entry.cmyk
    const cmyk: Cmyk = [c, m, y, k]
    const hex = cmykToHex(cmyk)
    return {
      id: index + 1,
      name: entry.name,
      collection,
      cmyk,
      hex,
      oklab: hexToOklab(hex),
      textColor: textOn(hex),
      combinationIds: [...entry.combinations].sort((a, b) => a - b),
    }
  })
}

// The dataset lists combination ids per colour; invert that into combinations.
function buildCombinations(all: readonly WadaColor[]): Combination[] {
  const members = new Map<number, number[]>()
  for (const color of all) {
    for (const id of color.combinationIds) {
      const list = members.get(id)
      if (list) list.push(color.id)
      else members.set(id, [color.id])
    }
  }
  if (members.size !== COMBINATION_COUNT) {
    fail(`${members.size} statt ${COMBINATION_COUNT} Kombinationen`)
  }
  const result: Combination[] = []
  for (let id = 1; id <= COMBINATION_COUNT; id++) {
    const colorIds = members.get(id)
    if (!colorIds) fail(`Kombination ${id} fehlt`)
    const size = colorIds.length
    if (size !== 2 && size !== 3 && size !== 4) fail(`Kombination ${id} hat ${size} Farben`)
    result.push({ id, size, colorIds })
  }
  return result
}

export const colors: readonly WadaColor[] = buildColors(json)
export const combinations: readonly Combination[] = buildCombinations(colors)

export const collections: readonly { label: string; colors: readonly WadaColor[] }[] =
  COLLECTION_LABELS.map((label, index) => ({
    label,
    colors: colors.filter((color) => color.collection === index),
  }))

export const colorById = (id: number): WadaColor | undefined => colors[id - 1]

export const combinationById = (id: number): Combination | undefined => combinations[id - 1]

export const colorsOf = (combination: Combination): WadaColor[] =>
  combination.colorIds.flatMap((id) => colorById(id) ?? [])

export const combinationsForColor = (id: number): Combination[] =>
  (colorById(id)?.combinationIds ?? []).flatMap((cid) => combinationById(cid) ?? [])

/** Colours that share at least one combination with the given colour. */
export function partnersOf(id: number): Partner[] {
  const counts = new Map<number, number>()
  for (const combination of combinationsForColor(id)) {
    for (const other of combination.colorIds) {
      if (other !== id) counts.set(other, (counts.get(other) ?? 0) + 1)
    }
  }
  return [...counts]
    .flatMap(([otherId, shared]) => {
      const color = colorById(otherId)
      return color ? [{ color, shared }] : []
    })
    .sort((a, b) => b.shared - a.shared || a.color.id - b.color.id)
}

export function groupBySize(
  list: readonly Combination[],
): { size: ComboSize; items: Combination[] }[] {
  const sizes: readonly ComboSize[] = [2, 3, 4]
  return sizes
    .map((size) => ({ size, items: list.filter((combination) => combination.size === size) }))
    .filter((group) => group.items.length > 0)
}

/** One normalisation for query and names: case, apostrophes, punctuation, spaces. */
export const normalize = (text: string): string =>
  text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const searchNames = colors.map((color) => normalize(color.name))

/** "12" or "#12" finds that combination; anything else matches colour names. */
export function searchCombinations(query: string, size: SizeFilter = 0): Combination[] {
  const bySize = (list: readonly Combination[]) =>
    size === 0 ? [...list] : list.filter((combination) => combination.size === size)

  const idMatch = /^#?(\d+)$/.exec(query.trim())
  if (idMatch) {
    const hit = combinationById(Number(idMatch[1]))
    return bySize(hit ? [hit] : [])
  }
  const needle = normalize(query)
  if (!needle) return bySize(combinations)
  return bySize(
    combinations.filter((combination) =>
      combination.colorIds.some((id) => searchNames[id - 1]?.includes(needle)),
    ),
  )
}

const black = colors.find((color) => color.name === 'Black') ?? fail('Black fehlt')

/** The n palette colours most similar to an arbitrary colour, nearest first. */
export function nearestColors(hex: string, n = 3): Match[] {
  const target = hexToOklab(hex)
  const ranked: Match[] = colors
    .map((color) => {
      const distance = deltaEOK2(target, color.oklab)
      return { color, distance, closeness: closeness(distance) }
    })
    .sort((a, b) => a.distance - b.distance || a.color.id - b.color.id)

  // OKLab lightness rises steeply near zero, so a neutral dark grey such as
  // #1a1a1a ranks dark greens and browns ahead of the palette's pure Black.
  // Put Black first for those, unless a palette colour really is very close.
  const nearest = ranked[0]
  if (
    chroma(target) < 0.02 &&
    target[0] < 0.3 &&
    nearest !== undefined &&
    nearest.closeness !== 'identical' &&
    nearest.closeness !== 'veryClose'
  ) {
    const index = ranked.findIndex((match) => match.color === black)
    ranked.unshift(...ranked.splice(index, 1))
  }

  // For the same reason the distance overstates how different a near-black
  // looks from Black, so label a leading Black by the input's lightness.
  const first = ranked[0]
  if (first?.color === black) {
    const lightness = target[0]
    ranked[0] = {
      ...first,
      closeness: lightness < 0.12 ? 'identical' : lightness < 0.2 ? 'veryClose' : 'close',
    }
  }
  return ranked.slice(0, n)
}
