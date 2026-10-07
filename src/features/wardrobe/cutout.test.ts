import { describe, expect, test } from 'vitest'
import { deltaEOK2, hexToOklab } from '../wada/color'
import {
  boundingBox,
  coverage,
  dominantColors,
  erode,
  rgbaToOklab,
  segment,
  suggestTolerance,
} from './cutout'

type Rgb = [number, number, number]

/** A synthetic photo: every pixel gets the colour `paint` returns for it. */
function photo(width: number, height: number, paint: (x: number, y: number) => Rgb) {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y)
      rgba.set([r, g, b, 255], (y * width + x) * 4)
    }
  }
  return { width, height, lab: rgbaToOklab(rgba) }
}

const inside = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) =>
  x >= x0 && x < x1 && y >= y0 && y < y1

const WHITE: Rgb = [245, 245, 240]
const RED: Rgb = [200, 30, 40]
const BLUE: Rgb = [30, 60, 170]

const near = (hex: string, [r, g, b]: Rgb) => {
  const target = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
  return deltaEOK2(hexToOklab(hex), hexToOklab(target))
}

describe('rgbaToOklab', () => {
  test('matches the single-colour conversion', () => {
    const lab = rgbaToOklab(new Uint8ClampedArray([255, 0, 0, 255, 255, 255, 255, 255]))
    const red = hexToOklab('#ff0000')
    expect(lab[0]).toBeCloseTo(red[0], 5)
    expect(lab[1]).toBeCloseTo(red[1], 5)
    expect(lab[2]).toBeCloseTo(red[2], 5)
    expect(lab[3]).toBeCloseTo(1, 3)
  })
})

describe('segment', () => {
  test('separates a red garment from a plain background', () => {
    const { width, height, lab } = photo(100, 80, (x, y) =>
      inside(x, y, 30, 20, 70, 60) ? RED : WHITE,
    )
    const mask = segment(lab, width, height)
    // 40 x 40 square, shrunk by the one-pixel erosion
    expect(boundingBox(mask, width, height)).toEqual({ x: 31, y: 21, width: 38, height: 38 })
    expect(coverage(mask)).toBeCloseTo((38 * 38) / (100 * 80), 5)
  })

  test('follows a background that gets darker towards one side', () => {
    const { width, height, lab } = photo(120, 80, (x, y) => {
      if (inside(x, y, 40, 20, 80, 60)) return BLUE
      const shade = 235 - Math.round((x / 120) * 70)
      return [shade, shade, shade - 5]
    })
    const mask = segment(lab, width, height)
    expect(boundingBox(mask, width, height)).toEqual({ x: 41, y: 21, width: 38, height: 38 })
  })

  test('drops specks but keeps a second large part', () => {
    const { width, height, lab } = photo(140, 80, (x, y) => {
      if (inside(x, y, 20, 20, 60, 60)) return RED // one shoe
      if (inside(x, y, 80, 20, 120, 60)) return RED // the other shoe
      if (inside(x, y, 66, 5, 70, 9)) return BLUE // crumb on the floor
      return WHITE
    })
    const mask = segment(lab, width, height)
    expect(boundingBox(mask, width, height)).toEqual({ x: 21, y: 21, width: 98, height: 38 })
    expect(mask[7 * width + 68]).toBe(0)
  })

  test('a lower tolerance keeps a garment that is close to the background', () => {
    const cream: Rgb = [228, 222, 200]
    const { width, height, lab } = photo(100, 80, (x, y) =>
      inside(x, y, 30, 20, 70, 60) ? cream : WHITE,
    )
    expect(coverage(segment(lab, width, height, 0.25))).toBe(0)
    expect(coverage(segment(lab, width, height, 0.03))).toBeGreaterThan(0.15)
  })

  test('a photo without a garment yields an empty mask', () => {
    const { width, height, lab } = photo(60, 40, () => WHITE)
    const mask = segment(lab, width, height)
    expect(coverage(mask)).toBe(0)
    expect(boundingBox(mask, width, height)).toBeNull()
  })
})

describe('suggestTolerance', () => {
  test('lowest for an even background', () => {
    const { width, height, lab } = photo(100, 80, (x, y) =>
      inside(x, y, 30, 20, 70, 60) ? RED : WHITE,
    )
    expect(suggestTolerance(lab, width, height)).toBe(0.05)
  })

  test('higher for a background with shading, within the slider range', () => {
    const { width, height, lab } = photo(120, 80, (x) => {
      const shade = 240 - Math.round((x / 120) * 120)
      return [shade, shade, shade]
    })
    const tolerance = suggestTolerance(lab, width, height)
    expect(tolerance).toBeGreaterThan(0.08)
    expect(tolerance).toBeLessThanOrEqual(0.2)
  })

  // A cream stripe across a blue shirt on a beige floor: with the suggested
  // tolerance the stripe is kept and reported as the second colour.
  test('keeps a garment part that is close to the background colour', () => {
    const floor: Rgb = [217, 207, 189]
    const cream: Rgb = [242, 240, 234]
    const { width, height, lab } = photo(120, 100, (x, y) => {
      if (!inside(x, y, 30, 20, 90, 80)) return floor
      return inside(x, y, 30, 40, 90, 60) ? cream : BLUE
    })
    const tolerance = suggestTolerance(lab, width, height)
    const mask = segment(lab, width, height, tolerance)
    expect(boundingBox(mask, width, height)).toEqual({ x: 31, y: 21, width: 58, height: 58 })
    expect(mask[50 * width + 60]).toBe(1)
    const colors = dominantColors(lab, mask, width, height)
    expect(colors).toHaveLength(2)
    expect(near(colors[0]!.hex, BLUE)).toBeLessThan(0.01)
    expect(near(colors[1]!.hex, cream)).toBeLessThan(0.01)
    // ...while the fixed default would have eaten the stripe
    expect(segment(lab, width, height, 0.12)[50 * width + 60]).toBe(0)
  })
})

describe('erode', () => {
  test('shrinks by the radius on every side', () => {
    const width = 10
    const height = 10
    const mask = new Uint8Array(width * height)
    for (let y = 2; y < 8; y++) for (let x = 2; x < 8; x++) mask[y * width + x] = 1
    expect(boundingBox(erode(mask, width, height, 1), width, height)).toEqual({
      x: 3,
      y: 3,
      width: 4,
      height: 4,
    })
    expect(coverage(erode(mask, width, height, 3))).toBe(0)
  })
})

describe('dominantColors', () => {
  test('one colour for a plain garment', () => {
    const { width, height, lab } = photo(100, 80, (x, y) =>
      inside(x, y, 30, 20, 70, 60) ? RED : WHITE,
    )
    const colors = dominantColors(lab, segment(lab, width, height), width, height)
    expect(colors).toHaveLength(1)
    expect(near(colors[0]!.hex, RED)).toBeLessThan(0.01)
    expect(colors[0]!.share).toBeCloseTo(1, 5)
  })

  test('lit and shaded fabric count as one colour', () => {
    const shaded: Rgb = [150, 20, 30]
    const { width, height, lab } = photo(100, 80, (x, y) => {
      if (!inside(x, y, 30, 20, 70, 60)) return WHITE
      return x < 50 ? RED : shaded
    })
    const colors = dominantColors(lab, segment(lab, width, height), width, height)
    expect(colors).toHaveLength(1)
  })

  test('main and second colour of a two-coloured garment, largest first', () => {
    const { width, height, lab } = photo(100, 80, (x, y) => {
      if (!inside(x, y, 20, 20, 80, 60)) return WHITE
      return x < 60 ? BLUE : RED
    })
    const colors = dominantColors(lab, segment(lab, width, height), width, height)
    expect(colors).toHaveLength(2)
    expect(near(colors[0]!.hex, BLUE)).toBeLessThan(0.01)
    expect(near(colors[1]!.hex, RED)).toBeLessThan(0.01)
    expect(colors[0]!.share).toBeGreaterThan(colors[1]!.share)
    expect(colors[0]!.share + colors[1]!.share).toBeCloseTo(1, 5)
  })

  test('a small detail is not reported as a colour', () => {
    const { width, height, lab } = photo(100, 80, (x, y) => {
      if (inside(x, y, 45, 35, 50, 40)) return BLUE // logo
      return inside(x, y, 20, 20, 80, 60) ? RED : WHITE
    })
    const colors = dominantColors(lab, segment(lab, width, height), width, height)
    expect(colors).toHaveLength(1)
    expect(near(colors[0]!.hex, RED)).toBeLessThan(0.02)
  })

  test('no colours without a garment', () => {
    const { width, height, lab } = photo(60, 40, () => WHITE)
    expect(dominantColors(lab, segment(lab, width, height), width, height)).toEqual([])
  })
})
