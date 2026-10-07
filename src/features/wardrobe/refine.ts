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
  const refined = guidedFilter(lightness, coarse, width, height, radius, 1e-3)

  const mask = new Uint8Array(width * height)
  for (let i = 0; i < mask.length; i++) mask[i] = refined[i]! > 0.5 ? 1 : 0
  settleOutline(mask, lab, width, height, radius)
  keepLargeParts(mask, width, height)
  return erode(mask, width, height, 1)
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
  const size = mask.length
  const band = Math.max(1, Math.round(radius / 2))
  const sureGarment = erode(mask, width, height, band)
  const sureBackground = erode(
    mask.map((value) => 1 - value),
    width,
    height,
    band,
  )

  // Local mean colours: box means of "colour x membership" over box means of
  // membership; the window sizes cancel out.
  const means = (sure: Uint8Array) => {
    const weight = boxMean(Float32Array.from(sure), width, height, radius)
    const channels = [0, 1, 2].map((channel) => {
      const weighted = new Float32Array(size)
      for (let i = 0; i < size; i++) weighted[i] = sure[i]! * lab[i * 3 + channel]!
      return boxMean(weighted, width, height, radius)
    })
    return { weight, channels }
  }
  const garment = means(sureGarment)
  const background = means(sureBackground)

  for (let i = 0; i < size; i++) {
    if (sureGarment[i] === 1 || sureBackground[i] === 1) continue
    const garmentWeight = garment.weight[i]!
    const backgroundWeight = background.weight[i]!
    if (garmentWeight < 1e-4 || backgroundWeight < 1e-4) continue
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
    // Where garment and background look alike, colour cannot decide.
    if (contrast < 0.04 ** 2) continue
    mask[i] = toGarment < toBackground ? 1 : 0
  }
}
