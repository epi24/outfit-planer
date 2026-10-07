import { type Oklab, oklabToHex } from '../wada/color'

// Background removal without a model: the colour along the photo's edge is
// taken as the background, and everything connected to the edge that looks
// like it is removed. Works when the garment lies on a plain surface that
// differs from it in colour. All functions work on plain arrays so that they
// can be tested without a browser.

export interface GarmentColor {
  hex: string
  /** share of the garment's area, 0..1 */
  share: number
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

const DEFAULT_TOLERANCE = 0.12

// Lightness counts less than hue and chroma, so that shadows and uneven
// lighting on the background are tolerated.
const L_WEIGHT = 0.6
const AB_WEIGHT = 2

const LINEAR = Float32Array.from({ length: 256 }, (_, value) => {
  const s = value / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
})

/** RGBA bytes -> OKLab, three floats per pixel. */
export function rgbaToOklab(rgba: Uint8ClampedArray | Uint8Array): Float32Array {
  const pixels = rgba.length / 4
  const lab = new Float32Array(pixels * 3)
  for (let i = 0; i < pixels; i++) {
    const r = LINEAR[rgba[i * 4]!]!
    const g = LINEAR[rgba[i * 4 + 1]!]!
    const b = LINEAR[rgba[i * 4 + 2]!]!
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    lab[i * 3] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
    lab[i * 3 + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
    lab[i * 3 + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  }
  return lab
}

function median(values: Float32Array): number {
  const sorted = values.slice().sort()
  return sorted[sorted.length >> 1] ?? 0
}

/** Pixel indices of a frame along the image edge, 2 % of the shorter side wide. */
function frameIndices(width: number, height: number): number[] {
  const frame = Math.max(1, Math.round(Math.min(width, height) * 0.02))
  const indices: number[] = []
  for (let y = 0; y < height; y++) {
    const inFrameRow = y < frame || y >= height - frame
    for (let x = 0; x < width; x++) {
      if (inFrameRow || x < frame || x >= width - frame) indices.push(y * width + x)
    }
  }
  return indices
}

/** Median colour of the frame along the image edge. */
export function estimateBackground(lab: Float32Array, width: number, height: number): Oklab {
  const indices = frameIndices(width, height)
  const channel = (offset: number) =>
    median(Float32Array.from(indices, (index) => lab[index * 3 + offset]!))
  return [channel(0), channel(1), channel(2)]
}

/**
 * A starting tolerance that fits the photo: low for an even background, so
 * that garment parts in a similar colour survive, higher for a background
 * with texture or shadows.
 */
export function suggestTolerance(lab: Float32Array, width: number, height: number): number {
  const [bgL, bgA, bgB] = estimateBackground(lab, width, height)
  const distances = Float32Array.from(frameIndices(width, height), (index) =>
    Math.hypot(
      L_WEIGHT * (lab[index * 3]! - bgL),
      AB_WEIGHT * (lab[index * 3 + 1]! - bgA),
      AB_WEIGHT * (lab[index * 3 + 2]! - bgB),
    ),
  ).sort()
  const spread = distances[Math.floor(distances.length * 0.9)] ?? 0
  const tolerance = Math.min(0.2, Math.max(0.05, spread * 1.6 + 0.02))
  return Math.round(tolerance * 100) / 100
}

/**
 * Marks the garment: 1 = garment, 0 = background.
 * `tolerance` is how far a pixel may be from the background colour and still
 * count as background.
 */
export function segment(
  lab: Float32Array,
  width: number,
  height: number,
  tolerance: number = DEFAULT_TOLERANCE,
): Uint8Array {
  const [bgL, bgA, bgB] = estimateBackground(lab, width, height)
  const total = width * height
  const background = new Uint8Array(total)
  const queue = new Int32Array(total)
  let head = 0
  let tail = 0

  const toBackground = (index: number) => {
    const dL = L_WEIGHT * (lab[index * 3]! - bgL)
    const dA = AB_WEIGHT * (lab[index * 3 + 1]! - bgA)
    const dB = AB_WEIGHT * (lab[index * 3 + 2]! - bgB)
    return dL * dL + dA * dA + dB * dB
  }
  const between = (p: number, q: number) => {
    const dL = L_WEIGHT * (lab[p * 3]! - lab[q * 3]!)
    const dA = AB_WEIGHT * (lab[p * 3 + 1]! - lab[q * 3 + 1]!)
    const dB = AB_WEIGHT * (lab[p * 3 + 2]! - lab[q * 3 + 2]!)
    return dL * dL + dA * dA + dB * dB
  }

  // A pixel joins the background if it is close to the background colour, or
  // if it is moderately close and nearly the same as the background pixel it
  // is reached from. The second rule follows shadows and soft gradients.
  const near = tolerance * tolerance
  const far = 4 * near
  const step = (tolerance * 0.25) ** 2

  const seed = (index: number) => {
    if (background[index] === 0 && toBackground(index) < far) {
      background[index] = 1
      queue[tail++] = index
    }
  }
  for (let x = 0; x < width; x++) {
    seed(x)
    seed((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    seed(y * width)
    seed(y * width + width - 1)
  }

  const visit = (index: number, from: number) => {
    if (background[index] === 1) return
    const distance = toBackground(index)
    if (distance < near || (distance < far && between(index, from) < step)) {
      background[index] = 1
      queue[tail++] = index
    }
  }
  while (head < tail) {
    const index = queue[head++]!
    const x = index % width
    if (x > 0) visit(index - 1, index)
    if (x < width - 1) visit(index + 1, index)
    if (index >= width) visit(index - width, index)
    if (index < total - width) visit(index + width, index)
  }

  const mask = new Uint8Array(total)
  for (let i = 0; i < total; i++) mask[i] = background[i] === 1 ? 0 : 1
  keepLargeParts(mask, width, height)
  return erode(mask, width, height, 1)
}

/** Removes specks: keeps the largest connected part and any at least a tenth its size. */
export function keepLargeParts(mask: Uint8Array, width: number, height: number) {
  const total = width * height
  const labels = new Int32Array(total)
  const queue = new Int32Array(total)
  const sizes: number[] = [0]

  for (let start = 0; start < total; start++) {
    if (mask[start] === 0 || labels[start] !== 0) continue
    const label = sizes.length
    let head = 0
    let tail = 0
    labels[start] = label
    queue[tail++] = start
    const join = (next: number) => {
      if (mask[next] === 1 && labels[next] === 0) {
        labels[next] = label
        queue[tail++] = next
      }
    }
    while (head < tail) {
      const index = queue[head++]!
      const x = index % width
      if (x > 0) join(index - 1)
      if (x < width - 1) join(index + 1)
      if (index >= width) join(index - width)
      if (index < total - width) join(index + width)
    }
    sizes.push(tail)
  }

  const threshold = Math.max(...sizes) / 10
  for (let i = 0; i < total; i++) {
    if (mask[i] === 1 && sizes[labels[i]!]! < threshold) mask[i] = 0
  }
}

/** Shrinks the mask by `radius` pixels; pixels at the image edge count as border. */
export function erode(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  let current = mask
  for (let pass = 0; pass < radius; pass++) {
    const next = new Uint8Array(current.length)
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const index = y * width + x
        if (
          current[index] === 1 &&
          current[index - 1] === 1 &&
          current[index + 1] === 1 &&
          current[index - width] === 1 &&
          current[index + width] === 1
        ) {
          next[index] = 1
        }
      }
    }
    current = next
  }
  return current
}

/** Share of the image covered by the mask, 0..1. */
export function coverage(mask: Uint8Array): number {
  let count = 0
  for (let i = 0; i < mask.length; i++) count += mask[i]!
  return mask.length === 0 ? 0 : count / mask.length
}

export function boundingBox(mask: Uint8Array, width: number, height: number): Box | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] === 0) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

interface Cluster {
  l: number
  a: number
  b: number
  count: number
}

const clusterDistance = (p: Cluster, q: Cluster) =>
  Math.hypot(L_WEIGHT * (p.l - q.l), AB_WEIGHT * (p.a - q.a), AB_WEIGHT * (p.b - q.b))

// Lit and shaded fabric of one colour. Less light scales L, a and b by the
// same factor, so the lighter colour, scaled down to the darker one's
// lightness, must land on it. Beyond a moderate difference in lightness the
// two count as separate colours (navy and light blue, grey and black).
function sameFabric(p: Cluster, q: Cluster): boolean {
  const [dark, light] = p.l <= q.l ? [p, q] : [q, p]
  if (light.l < 0.05) return true
  const ratio = dark.l / light.l
  if (ratio < 0.7) return false
  return AB_WEIGHT * Math.hypot(light.a * ratio - dark.a, light.b * ratio - dark.b) < 0.05
}

/**
 * The garment's colours, most frequent first: the main colour and up to
 * `max - 1` further colours that each cover a noticeable part of it.
 */
export function dominantColors(
  lab: Float32Array,
  mask: Uint8Array,
  width: number,
  height: number,
  max = 3,
): GarmentColor[] {
  // Stay away from the outline, where pixels are mixed with the background.
  const inner = erode(mask, width, height, 3)
  const source = coverage(inner) >= coverage(mask) * 0.3 ? inner : mask

  const indices: number[] = []
  for (let i = 0; i < source.length; i++) if (source[i] === 1) indices.push(i)
  if (indices.length === 0) return []
  const stride = Math.max(1, Math.floor(indices.length / 6000))
  const samples: Cluster[] = []
  for (let i = 0; i < indices.length; i += stride) {
    const index = indices[i]!
    samples.push({ l: lab[index * 3]!, a: lab[index * 3 + 1]!, b: lab[index * 3 + 2]!, count: 1 })
  }

  // k-means with a deterministic start: the mean, then repeatedly the sample
  // farthest from all centres chosen so far.
  const mean = (items: readonly Cluster[]): Cluster => {
    const sum = { l: 0, a: 0, b: 0, count: 0 }
    for (const item of items) {
      sum.l += item.l * item.count
      sum.a += item.a * item.count
      sum.b += item.b * item.count
      sum.count += item.count
    }
    return { l: sum.l / sum.count, a: sum.a / sum.count, b: sum.b / sum.count, count: sum.count }
  }
  let centres: Cluster[] = [mean(samples)]
  while (centres.length < 5) {
    let farthest = samples[0]!
    let farthestDistance = -1
    for (const sample of samples) {
      const distance = Math.min(...centres.map((centre) => clusterDistance(sample, centre)))
      if (distance > farthestDistance) {
        farthestDistance = distance
        farthest = sample
      }
    }
    if (farthestDistance < 0.02) break
    centres.push({ ...farthest })
  }
  for (let iteration = 0; iteration < 10; iteration++) {
    const groups: Cluster[][] = centres.map(() => [])
    for (const sample of samples) {
      let best = 0
      let bestDistance = Infinity
      centres.forEach((centre, index) => {
        const distance = clusterDistance(sample, centre)
        if (distance < bestDistance) {
          bestDistance = distance
          best = index
        }
      })
      groups[best]!.push(sample)
    }
    centres = groups.filter((group) => group.length > 0).map(mean)
  }

  // Merge what is the same fabric in different light.
  for (;;) {
    let pair: [number, number] | null = null
    let pairDistance = Infinity
    for (let i = 0; i < centres.length; i++) {
      for (let j = i + 1; j < centres.length; j++) {
        const distance = clusterDistance(centres[i]!, centres[j]!)
        if (sameFabric(centres[i]!, centres[j]!) && distance < pairDistance) {
          pair = [i, j]
          pairDistance = distance
        }
      }
    }
    if (!pair) break
    const [i, j] = pair
    centres[i] = mean([centres[i]!, centres[j]!])
    centres.splice(j, 1)
  }

  const colors = centres
    .map((centre) => ({
      hex: oklabToHex([centre.l, centre.a, centre.b]),
      share: centre.count / samples.length,
    }))
    .sort((p, q) => q.share - p.share)
  // The main colour always counts; further colours only above 12 %.
  return colors.filter((color, index) => index === 0 || color.share >= 0.12).slice(0, max)
}
