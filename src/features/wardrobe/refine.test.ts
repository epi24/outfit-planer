import { describe, expect, test } from 'vitest'
import { boundingBox, rgbaToOklab } from './cutout'
import {
  MODEL_SIZE,
  guidedFilter,
  maskFromSaliency,
  normalizeOutput,
  resize,
  toModelInput,
} from './refine'

describe('toModelInput', () => {
  test('channels first, scaled by the brightest value and normalised', () => {
    const pixels = MODEL_SIZE * MODEL_SIZE
    const rgba = new Uint8ClampedArray(pixels * 4)
    for (let i = 0; i < pixels; i++) rgba.set([100, 50, 0, 255], i * 4)
    rgba.set([200, 200, 200, 255], 0) // brightest pixel: 200
    const input = toModelInput(rgba)
    expect(input).toHaveLength(3 * pixels)
    expect(input[0]).toBeCloseTo((1 - 0.485) / 0.229, 5)
    expect(input[1]).toBeCloseTo((0.5 - 0.485) / 0.229, 5)
    expect(input[pixels + 1]).toBeCloseTo((0.25 - 0.456) / 0.224, 5)
    expect(input[2 * pixels + 1]).toBeCloseTo((0 - 0.406) / 0.225, 5)
  })
})

describe('normalizeOutput', () => {
  test('stretches to 0..1', () => {
    expect([...normalizeOutput([2, 4, 6])]).toEqual([0, 0.5, 1])
  })

  test('a constant output does not divide by zero', () => {
    expect([...normalizeOutput([3, 3])]).toEqual([0, 0])
  })
})

describe('resize', () => {
  test('keeps a constant image constant', () => {
    const result = resize(new Float32Array(16).fill(0.25), 4, 4, 9, 7)
    expect(result).toHaveLength(63)
    expect(Math.min(...result)).toBeCloseTo(0.25, 6)
    expect(Math.max(...result)).toBeCloseTo(0.25, 6)
  })

  test('interpolates between neighbours', () => {
    const result = resize(Float32Array.from([0, 1]), 2, 1, 4, 1)
    expect(result[0]).toBeCloseTo(0, 6)
    expect(result[3]).toBeCloseTo(1, 6)
    expect(result[1]!).toBeLessThan(result[2]!)
  })
})

describe('guidedFilter', () => {
  test('a blurry step snaps to the sharp step of the guide', () => {
    const width = 60
    const height = 8
    const guide = new Float32Array(width * height)
    const blurry = new Float32Array(width * height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        guide[y * width + x] = x < 30 ? 0.2 : 0.9
        blurry[y * width + x] = Math.min(1, Math.max(0, (x - 20) / 20)) // ramp from 20 to 40
      }
    }
    const result = guidedFilter(guide, blurry, width, height, 8, 1e-3)
    const row = 4 * width
    expect(result[row + 28]!).toBeLessThan(0.4)
    expect(result[row + 31]!).toBeGreaterThan(0.6)
    expect(result[row + 31]! - result[row + 28]!).toBeGreaterThan(blurry[row + 31]! - blurry[row + 28]! + 0.2)
  })
})

describe('maskFromSaliency', () => {
  const width = 640
  const height = 512
  const garment = { x0: 200, y0: 140, x1: 440, y1: 380 }

  function blueOnCream() {
    const rgba = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const inside = x >= garment.x0 && x < garment.x1 && y >= garment.y0 && y < garment.y1
        rgba.set(inside ? [30, 60, 170, 255] : [235, 232, 225, 255], (y * width + x) * 4)
      }
    }
    return rgbaToOklab(rgba)
  }

  /** A soft model answer whose 0.5 line runs `offset` photo pixels outside the garment. */
  function coarseAnswer(offset: number) {
    const saliency = new Float32Array(MODEL_SIZE * MODEL_SIZE)
    for (let y = 0; y < MODEL_SIZE; y++) {
      for (let x = 0; x < MODEL_SIZE; x++) {
        const px = ((x + 0.5) * width) / MODEL_SIZE
        const py = ((y + 0.5) * height) / MODEL_SIZE
        const outside = Math.max(garment.x0 - px, px - garment.x1, garment.y0 - py, py - garment.y1)
        saliency[y * MODEL_SIZE + x] = Math.min(1, Math.max(0, 0.5 - (outside - offset) / 8))
      }
    }
    return saliency
  }

  // The model is only roughly right: its outline is soft and several pixels
  // off. The photo's own colours put the mask back on the garment.
  test.each([
    ['too wide', 5],
    ['slightly too wide', 2],
    ['too tight', -5],
  ])('a coarse answer that is %s becomes a mask on the real outline', (_label, offset) => {
    const mask = maskFromSaliency(coarseAnswer(offset), blueOnCream(), width, height)
    // the true outline, shrunk by the final one-pixel erosion
    expect(boundingBox(mask, width, height)).toEqual({ x: 201, y: 141, width: 238, height: 238 })
    expect(mask[260 * width + 320]).toBe(1)
    expect(mask[60 * width + 320]).toBe(0)
  })

  test('nothing salient gives an empty mask', () => {
    const lab = rgbaToOklab(new Uint8ClampedArray(80 * 60 * 4).fill(200))
    const mask = maskFromSaliency(new Float32Array(MODEL_SIZE * MODEL_SIZE), lab, 80, 60)
    expect(boundingBox(mask, 80, 60)).toBeNull()
  })
})
