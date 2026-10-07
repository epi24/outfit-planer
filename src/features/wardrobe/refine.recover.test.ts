import { describe, expect, test } from 'vitest'
import { keepLargeParts, rgbaToOklab } from './cutout'
import { MODEL_SIZE, maskFromSaliency } from './refine'

// Parts of a garment that the model is unsure about or takes for background,
// and what the refinement makes of them.

type Rgb = [number, number, number]
interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

const WIDTH = 640
const HEIGHT = 512
const CREAM: Rgb = [235, 232, 225]
const BLUE: Rgb = [30, 60, 170]
const YELLOW: Rgb = [240, 200, 40]
const BODY: Rect = { x0: 200, y0: 140, x1: 440, y1: 380 }

const within = (x: number, y: number, r: Rect) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1

function photo(paint: (x: number, y: number) => Rgb): Float32Array {
  const rgba = new Uint8ClampedArray(WIDTH * HEIGHT * 4)
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const [r, g, b] = paint(x, y)
      rgba.set([r, g, b, 255], (y * WIDTH + x) * 4)
    }
  }
  return rgbaToOklab(rgba)
}

/** The model's answer on its 320 x 320 grid, given per photo position. */
function answer(likelihood: (x: number, y: number) => number): Float32Array {
  const saliency = new Float32Array(MODEL_SIZE * MODEL_SIZE)
  for (let y = 0; y < MODEL_SIZE; y++) {
    for (let x = 0; x < MODEL_SIZE; x++) {
      saliency[y * MODEL_SIZE + x] = likelihood(
        ((x + 0.5) * WIDTH) / MODEL_SIZE,
        ((y + 0.5) * HEIGHT) / MODEL_SIZE,
      )
    }
  }
  return saliency
}

const at = (mask: Uint8Array, x: number, y: number) => mask[y * WIDTH + x]

describe('parts the model is unsure about', () => {
  const sleeve: Rect = { x0: 440, y0: 200, x1: 540, y1: 260 }

  test('a sleeve in the garment colour is kept', () => {
    const lab = photo((x, y) => (within(x, y, BODY) || within(x, y, sleeve) ? BLUE : CREAM))
    const saliency = answer((x, y) => (within(x, y, BODY) ? 1 : within(x, y, sleeve) ? 0.3 : 0))
    const mask = maskFromSaliency(saliency, lab, WIDTH, HEIGHT)
    expect(at(mask, 490, 230)).toBe(1)
    expect(at(mask, 530, 230)).toBe(1)
    expect(at(mask, 560, 230)).toBe(0)
  })

  test('background the model is unsure about stays background', () => {
    const lab = photo((x, y) => (within(x, y, BODY) ? BLUE : CREAM))
    const saliency = answer((x, y) => (within(x, y, BODY) ? 1 : within(x, y, sleeve) ? 0.3 : 0))
    const mask = maskFromSaliency(saliency, lab, WIDTH, HEIGHT)
    expect(at(mask, 490, 230)).toBe(0)
    expect(at(mask, 320, 260)).toBe(1)
  })

  test('something else in the garment colour, not attached to it, is left out', () => {
    const other: Rect = { x0: 40, y0: 40, x1: 110, y1: 110 }
    const lab = photo((x, y) => (within(x, y, BODY) || within(x, y, other) ? BLUE : CREAM))
    const saliency = answer((x, y) => (within(x, y, BODY) ? 1 : within(x, y, other) ? 0.3 : 0))
    const mask = maskFromSaliency(saliency, lab, WIDTH, HEIGHT)
    expect(at(mask, 75, 75)).toBe(0)
  })
})

describe('holes', () => {
  const inner: Rect = { x0: 280, y0: 220, x1: 360, y1: 300 }
  const withoutInner = answer((x, y) => (within(x, y, BODY) && !within(x, y, inner) ? 1 : 0))

  test('a print the model took for background is closed', () => {
    const lab = photo((x, y) => (within(x, y, inner) ? YELLOW : within(x, y, BODY) ? BLUE : CREAM))
    const mask = maskFromSaliency(withoutInner, lab, WIDTH, HEIGHT)
    expect(at(mask, 320, 260)).toBe(1)
    expect(at(mask, 285, 225)).toBe(1)
  })

  test('an opening that shows the background stays open', () => {
    const lab = photo((x, y) => (within(x, y, BODY) && !within(x, y, inner) ? BLUE : CREAM))
    const mask = maskFromSaliency(withoutInner, lab, WIDTH, HEIGHT)
    expect(at(mask, 320, 260)).toBe(0)
    expect(at(mask, 240, 180)).toBe(1)
  })

  test('a speck is closed whatever its colour', () => {
    const speck: Rect = { x0: 316, y0: 256, x1: 324, y1: 264 }
    const lab = photo((x, y) => (within(x, y, BODY) && !within(x, y, speck) ? BLUE : CREAM))
    const saliency = answer((x, y) => (within(x, y, BODY) && !within(x, y, speck) ? 1 : 0))
    const mask = maskFromSaliency(saliency, lab, WIDTH, HEIGHT)
    expect(at(mask, 320, 260)).toBe(1)
  })
})

describe('keepLargeParts', () => {
  function twoParts() {
    const mask = new Uint8Array(100 * 100)
    for (let y = 10; y < 50; y++) for (let x = 10; x < 60; x++) mask[y * 100 + x] = 1 // 2000 px
    for (let y = 70; y < 80; y++) for (let x = 70; x < 80; x++) mask[y * 100 + x] = 1 // 100 px, 5 %
    return mask
  }

  test('drops a part below a tenth of the largest by default', () => {
    const mask = twoParts()
    keepLargeParts(mask, 100, 100)
    expect(mask[75 * 100 + 75]).toBe(0)
    expect(mask[30 * 100 + 30]).toBe(1)
  })

  test('keeps it when a smaller share is asked for', () => {
    const mask = twoParts()
    keepLargeParts(mask, 100, 100, 0.03)
    expect(mask[75 * 100 + 75]).toBe(1)
  })
})
