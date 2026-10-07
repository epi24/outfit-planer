import { erode, keepLargeParts } from './cutout'

// Turning the model's coarse answer into a mask for the photo. The model
// sees the photo at 320 x 320 and says, per pixel, how likely it belongs to
// the garment. That decides *what* the garment is; the photo itself decides
// *where exactly* its outline runs. Plain arrays only, testable without a
// browser.

export const MODEL_SIZE = 320

const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

/** RGBA pixels of the photo scaled to 320 x 320 -> the model's input (CHW). */
export function toModelInput(rgba: Uint8ClampedArray | Uint8Array): Float32Array {
  const pixels = MODEL_SIZE * MODEL_SIZE
  let max = 1
  for (let i = 0; i < pixels; i++) {
    max = Math.max(max, rgba[i * 4]!, rgba[i * 4 + 1]!, rgba[i * 4 + 2]!)
  }
  const input = new Float32Array(3 * pixels)
  for (let i = 0; i < pixels; i++) {
    for (let channel = 0; channel < 3; channel++) {
      input[channel * pixels + i] = (rgba[i * 4 + channel]! / max - MEAN[channel]!) / STD[channel]!
    }
  }
  return input
}

/** Stretches the model's output to 0..1. */
export function normalizeOutput(output: ArrayLike<number>): Float32Array {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < output.length; i++) {
    const value = output[i]!
    if (value < min) min = value
    if (value > max) max = value
  }
  const range = max - min || 1
  return Float32Array.from(output, (value) => (value - min) / range)
}

/** Bilinear scaling of a single-channel image. */
export function resize(
  source: Float32Array,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
): Float32Array {
  const result = new Float32Array(width * height)
  const scaleX = sourceWidth / width
  const scaleY = sourceHeight / height
  for (let y = 0; y < height; y++) {
    const sy = Math.min(sourceHeight - 1, Math.max(0, (y + 0.5) * scaleY - 0.5))
    const y0 = Math.floor(sy)
    const y1 = Math.min(sourceHeight - 1, y0 + 1)
    const fy = sy - y0
    for (let x = 0; x < width; x++) {
      const sx = Math.min(sourceWidth - 1, Math.max(0, (x + 0.5) * scaleX - 0.5))
      const x0 = Math.floor(sx)
      const x1 = Math.min(sourceWidth - 1, x0 + 1)
      const fx = sx - x0
      const top = source[y0 * sourceWidth + x0]! * (1 - fx) + source[y0 * sourceWidth + x1]! * fx
      const bottom = source[y1 * sourceWidth + x0]! * (1 - fx) + source[y1 * sourceWidth + x1]! * fx
      result[y * width + x] = top * (1 - fy) + bottom * fy
    }
  }
  return result
}

/** Mean over a (2r+1) x (2r+1) window, shrinking the window at the image edge. */
function boxMean(source: Float32Array, width: number, height: number, radius: number): Float32Array {
  const horizontal = new Float32Array(source.length)
  for (let y = 0; y < height; y++) {
    const row = y * width
    let sum = 0
    for (let x = 0; x <= Math.min(radius, width - 1); x++) sum += source[row + x]!
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - radius)
      const right = Math.min(width - 1, x + radius)
      horizontal[row + x] = sum / (right - left + 1)
      if (x + radius + 1 < width) sum += source[row + x + radius + 1]!
      if (x - radius >= 0) sum -= source[row + x - radius]!
    }
  }
  const result = new Float32Array(source.length)
  for (let x = 0; x < width; x++) {
    let sum = 0
    for (let y = 0; y <= Math.min(radius, height - 1); y++) sum += horizontal[y * width + x]!
    for (let y = 0; y < height; y++) {
      const top = Math.max(0, y - radius)
      const bottom = Math.min(height - 1, y + radius)
      result[y * width + x] = sum / (bottom - top + 1)
      if (y + radius + 1 < height) sum += horizontal[(y + radius + 1) * width + x]!
      if (y - radius >= 0) sum -= horizontal[(y - radius) * width + x]!
    }
  }
  return result
}

/**
 * Guided filter (He, Sun, Tang): smooths `input` but lets its edges follow
 * the edges of `guide`. Here it snaps the blurry outline from the model to
 * the real outline in the photo.
 */
export function guidedFilter(
  guide: Float32Array,
  input: Float32Array,
  width: number,
  height: number,
  radius: number,
  epsilon: number,
): Float32Array {
  const size = guide.length
  const meanGuide = boxMean(guide, width, height, radius)
  const meanInput = boxMean(input, width, height, radius)
  const product = new Float32Array(size)
  const square = new Float32Array(size)
  for (let i = 0; i < size; i++) {
    product[i] = guide[i]! * input[i]!
    square[i] = guide[i]! * guide[i]!
  }
  const meanProduct = boxMean(product, width, height, radius)
  const meanSquare = boxMean(square, width, height, radius)

  const a = new Float32Array(size)
  const b = new Float32Array(size)
  for (let i = 0; i < size; i++) {
    const variance = meanSquare[i]! - meanGuide[i]! * meanGuide[i]!
    const covariance = meanProduct[i]! - meanGuide[i]! * meanInput[i]!
    a[i] = covariance / (variance + epsilon)
    b[i] = meanInput[i]! - a[i]! * meanGuide[i]!
  }
  const meanA = boxMean(a, width, height, radius)
  const meanB = boxMean(b, width, height, radius)
  const result = new Float32Array(size)
  for (let i = 0; i < size; i++) result[i] = meanA[i]! * guide[i]! + meanB[i]!
  return result
}

// How sure the model is that a pixel is garment, after refinement:
const STRONG = 0.5 // garment
const WEAK = 0.15 // possibly garment; colour and connection decide

/**
 * The garment mask (1 = garment) for a photo, from the model's 320 x 320
 * answer and the photo's OKLab pixels.
 */
export function maskFromSaliency(
  saliency: Float32Array,
  lab: Float32Array,
  width: number,
  height: number,
): Uint8Array {
  const coarse = resize(saliency, MODEL_SIZE, MODEL_SIZE, width, height)
  const lightness = new Float32Array(width * height)
  for (let i = 0; i < lightness.length; i++) lightness[i] = lab[i * 3]!
  // The model's outline can be off by a few of its own pixels; the window
  // has to span that distance in photo pixels.
  const radius = Math.max(2, Math.round((Math.max(width, height) / MODEL_SIZE) * 4))
  const likelihood = guidedFilter(lightness, coarse, width, height, radius, 1e-3)

  const mask = new Uint8Array(width * height)
  for (let i = 0; i < mask.length; i++) mask[i] = likelihood[i]! > STRONG ? 1 : 0
  recoverWeakParts(mask, likelihood, lab, width)
  settleOutline(mask, lab, width, height, radius)
  fillHoles(mask, lab, width, height)
  keepLargeParts(mask, width, height, 0.03)
  return erode(mask, width, height, 1)
}

interface LocalColours {
  weight: Float32Array
  channels: Float32Array[]
}

/**
 * Mean colour of the `sure` pixels around every pixel: box means of
 * "colour x membership" over box means of membership (the window sizes
 * cancel out).
 */
function localColours(
  sure: Uint8Array,
  lab: Float32Array,
  width: number,
  height: number,
  radius: number,
): LocalColours {
  const size = sure.length
  const weight = boxMean(Float32Array.from(sure), width, height, radius)
  const channels = [0, 1, 2].map((channel) => {
    const weighted = new Float32Array(size)
    for (let i = 0; i < size; i++) weighted[i] = sure[i]! * lab[i * 3 + channel]!
    return boxMean(weighted, width, height, radius)
  })
  return { weight, channels }
}

/**
 * Which side pixel `i` resembles: 1 = the garment's local colour, 0 = the
 * background's, -1 = colour cannot tell (one side has no sure pixels nearby,
 * or both look alike).
 */
function resembles(
  i: number,
  lab: Float32Array,
  garment: LocalColours,
  background: LocalColours,
): 1 | 0 | -1 {
  const garmentWeight = garment.weight[i]!
  const backgroundWeight = background.weight[i]!
  if (garmentWeight < 1e-4 || backgroundWeight < 1e-4) return -1
  let toGarment = 0
  let toBackground = 0
  let contrast = 0
  for (let channel = 0; channel < 3; channel++) {
    // lightness counts less, so that a shadow next to the garment stays background
    const scale = channel === 0 ? 0.6 : 2
    const g = garment.channels[channel]![i]! / garmentWeight
    const b = background.channels[channel]![i]! / backgroundWeight
    const value = lab[i * 3 + channel]!
    toGarment += (scale * (value - g)) ** 2
    toBackground += (scale * (value - b)) ** 2
    contrast += (scale * (g - b)) ** 2
  }
  if (contrast < 0.04 ** 2) return -1
  return toGarment < toBackground ? 1 : 0
}

/** Colour distance in which lightness counts less, so that shading matters little. */
const colourDistance = (lab: Float32Array, i: number, centre: readonly number[]) =>
  Math.hypot(
    0.6 * (lab[i * 3]! - centre[0]!),
    2 * (lab[i * 3 + 1]! - centre[1]!),
    2 * (lab[i * 3 + 2]! - centre[2]!),
  )

/**
 * Up to `count` typical colours of the given pixels (k-means with a
 * deterministic start: the first sample, then repeatedly the sample farthest
 * from all centres chosen so far).
 */
function typicalColours(lab: Float32Array, pixels: readonly number[], count: number): number[][] {
  const stride = Math.max(1, Math.floor(pixels.length / 3000))
  const samples: number[] = []
  for (let i = 0; i < pixels.length; i += stride) samples.push(pixels[i]!)
  if (samples.length === 0) return []

  const colourOf = (i: number) => [lab[i * 3]!, lab[i * 3 + 1]!, lab[i * 3 + 2]!]
  let centres = [colourOf(samples[0]!)]
  const nearest = (i: number) => Math.min(...centres.map((centre) => colourDistance(lab, i, centre)))
  while (centres.length < count) {
    let farthest = samples[0]!
    let farthestDistance = -1
    for (const sample of samples) {
      const distance = nearest(sample)
      if (distance > farthestDistance) {
        farthestDistance = distance
        farthest = sample
      }
    }
    if (farthestDistance < 0.03) break
    centres.push(colourOf(farthest))
  }
  for (let iteration = 0; iteration < 6; iteration++) {
    const sums = centres.map(() => [0, 0, 0, 0])
    for (const sample of samples) {
      let best = 0
      let bestDistance = Infinity
      centres.forEach((centre, index) => {
        const distance = colourDistance(lab, sample, centre)
        if (distance < bestDistance) {
          bestDistance = distance
          best = index
        }
      })
      const sum = sums[best]!
      sum[0]! += lab[sample * 3]!
      sum[1]! += lab[sample * 3 + 1]!
      sum[2]! += lab[sample * 3 + 2]!
      sum[3]! += 1
    }
    centres = sums
      .filter((sum) => sum[3]! > 0)
      .map((sum) => [sum[0]! / sum[3]!, sum[1]! / sum[3]!, sum[2]! / sum[3]!])
  }
  return centres
}

/**
 * Adds parts the model was unsure about - a sleeve, a strap, the middle of a
 * plain top - when they have one of the garment's colours rather than one of
 * the background's, and hang together with what the model was sure about.
 */
function recoverWeakParts(
  mask: Uint8Array,
  likelihood: Float32Array,
  lab: Float32Array,
  width: number,
) {
  const size = mask.length
  const sureGarment: number[] = []
  const sureBackground: number[] = []
  for (let i = 0; i < size; i++) {
    if (likelihood[i]! > 0.7) sureGarment.push(i)
    else if (likelihood[i]! < 0.05) sureBackground.push(i)
  }
  // The colours are taken from the whole photo: the unsure part, a sleeve
  // say, can be far from anything the model was sure about.
  const garmentColours = typicalColours(lab, sureGarment, 5)
  const backgroundColours = typicalColours(lab, sureBackground, 6)
  if (garmentColours.length === 0 || backgroundColours.length === 0) return

  const closest = (i: number, colours: number[][]) =>
    Math.min(...colours.map((colour) => colourDistance(lab, i, colour)))
  const candidate = new Uint8Array(size)
  const queue = new Int32Array(size)
  let tail = 0
  for (let i = 0; i < size; i++) {
    if (mask[i] === 1) {
      queue[tail++] = i
    } else if (likelihood[i]! > WEAK) {
      const toGarment = closest(i, garmentColours)
      if (toGarment < 0.12 && toGarment < closest(i, backgroundColours)) candidate[i] = 1
    }
  }
  const join = (next: number) => {
    if (candidate[next] === 1 && mask[next] === 0) {
      mask[next] = 1
      queue[tail++] = next
    }
  }
  for (let head = 0; head < tail; head++) {
    const index = queue[head]!
    const x = index % width
    if (x > 0) join(index - 1)
    if (x < width - 1) join(index + 1)
    if (index >= width) join(index - width)
    if (index < size - width) join(index + width)
  }
}

/**
 * Decides the pixels along the outline by colour. Pixels well inside the
 * mask give the garment's local colour, pixels well outside the background's;
 * each pixel in the band between them goes to the side it resembles more.
 * This removes the rim of background that the model tends to leave.
 */
function settleOutline(
  mask: Uint8Array,
  lab: Float32Array,
  width: number,
  height: number,
  radius: number,
) {
  const band = Math.max(1, Math.round(radius / 2))
  const sureGarment = erode(mask, width, height, band)
  const sureBackground = erode(
    mask.map((value) => 1 - value),
    width,
    height,
    band,
  )
  const garment = localColours(sureGarment, lab, width, height, radius)
  const background = localColours(sureBackground, lab, width, height, radius)

  for (let i = 0; i < mask.length; i++) {
    if (sureGarment[i] === 1 || sureBackground[i] === 1) continue
    const side = resembles(i, lab, garment, background)
    if (side !== -1) mask[i] = side
  }
}

/**
 * Closes holes inside the garment, e.g. a print the model took for
 * background. A hole stays open when it shows the background's colour and is
 * more than a speck: then the background really is visible through it.
 */
function fillHoles(mask: Uint8Array, lab: Float32Array, width: number, height: number) {
  const size = mask.length
  const state = new Uint8Array(size) // 0 = not visited, 1 = visited
  const queue = new Int32Array(size)
  let tail = 0
  const visit = (index: number) => {
    if (mask[index] === 0 && state[index] === 0) {
      state[index] = 1
      queue[tail++] = index
    }
  }
  /** Spreads from the queued pixels over connected background; returns its colour sum. */
  const spread = () => {
    const sum = [0, 0, 0]
    for (let head = 0; head < tail; head++) {
      const index = queue[head]!
      sum[0]! += lab[index * 3]!
      sum[1]! += lab[index * 3 + 1]!
      sum[2]! += lab[index * 3 + 2]!
      const x = index % width
      if (x > 0) visit(index - 1)
      if (x < width - 1) visit(index + 1)
      if (index >= width) visit(index - width)
      if (index < size - width) visit(index + width)
    }
    return sum.map((value) => value / Math.max(1, tail))
  }

  let garmentArea = 0
  for (let i = 0; i < size; i++) garmentArea += mask[i]!
  if (garmentArea === 0) return

  // The background that is reachable from the image edge.
  for (let x = 0; x < width; x++) {
    visit(x)
    visit(size - width + x)
  }
  for (let y = 0; y < height; y++) {
    visit(y * width)
    visit(y * width + width - 1)
  }
  const outside = spread()
  const hasOutside = tail > 0

  // What is left of the background is enclosed by the garment.
  for (let start = 0; start < size; start++) {
    if (mask[start] === 1 || state[start] === 1) continue
    tail = 0
    visit(start)
    const colour = spread()
    const area = tail
    const likeOutside =
      hasOutside &&
      Math.hypot(
        0.6 * (colour[0]! - outside[0]!),
        2 * (colour[1]! - outside[1]!),
        2 * (colour[2]! - outside[2]!),
      ) < 0.08
    const speck = area < garmentArea * 0.003
    if (speck || (!likeOutside && area < garmentArea * 0.25)) {
      for (let i = 0; i < area; i++) mask[queue[i]!] = 1
    }
  }
}
