import { describe, expect, test } from 'vitest'
import {
  closeness,
  cmykToHex,
  deltaEOK2,
  hexToOklab,
  parseHex,
  relativeLuminance,
  textOn,
} from './color'

describe('cmykToHex', () => {
  test('reproduces the colours of sanzo-wada.dmbk.io', () => {
    expect(cmykToHex([0, 30, 6, 0])).toBe('#ffb3f0') // Hermosa Pink
    expect(cmykToHex([36, 32, 100, 0])).toBe('#a3ad00') // Citrine
    expect(cmykToHex([50, 16, 58, 20])).toBe('#66ab56') // Chromium Green
    expect(cmykToHex([29, 18, 20, 0])).toBe('#b5d1cc') // Neutral Gray
    expect(cmykToHex([0, 0, 0, 0])).toBe('#ffffff')
    expect(cmykToHex([20, 10, 15, 100])).toBe('#000000') // Black
  })

  test('clamps the out-of-range magenta of Dull Violet Black', () => {
    expect(cmykToHex([95, 106, 38, 50])).toBe('#06004f')
  })

  // The integer form of the formula yields 1a instead of 19 here.
  test('uses the floating-point form', () => {
    expect(cmykToHex([9, 90, 100, 0])).toBe('#e81900') // Red Orange
    expect(cmykToHex([0, 80, 90, 0])).toBe('#ff3319') // Peach Red
    expect(cmykToHex([85, 90, 18, 0])).toBe('#2619d1') // Violet
  })
})

describe('parseHex', () => {
  test.each([
    ['ABC', '#aabbcc'],
    ['#ABC', '#aabbcc'],
    ['#A1B2C3', '#a1b2c3'],
    ['A1B2C3', '#a1b2c3'],
    [' a1b2c3 ', '#a1b2c3'],
  ])('accepts %j', (input, expected) => {
    expect(parseHex(input)).toBe(expected)
  })

  test.each(['', '#', '#12', '#abcd', '#12345', '#1234567', 'a1b2c3ff', 'ggg', '# abc'])(
    'rejects %j',
    (input) => {
      expect(parseHex(input)).toBeNull()
    },
  )
})

describe('hexToOklab', () => {
  test('white, black and red', () => {
    const white = hexToOklab('#ffffff')
    expect(white[0]).toBeCloseTo(1, 3)
    expect(white[1]).toBeCloseTo(0, 3)
    expect(white[2]).toBeCloseTo(0, 3)

    expect(hexToOklab('#000000')).toEqual([0, 0, 0])

    const red = hexToOklab('#ff0000')
    expect(red[0]).toBeCloseTo(0.628, 3)
    expect(red[1]).toBeCloseTo(0.225, 3)
    expect(red[2]).toBeCloseTo(0.126, 3)
  })
})

describe('deltaEOK2', () => {
  test('is zero for equal colours and symmetric', () => {
    const p = hexToOklab('#336699')
    const q = hexToOklab('#996633')
    expect(deltaEOK2(p, p)).toBe(0)
    expect(deltaEOK2(p, q)).toBeCloseTo(deltaEOK2(q, p), 12)
  })

  test('weights a and b twice', () => {
    expect(deltaEOK2([0.5, 0, 0], [0.6, 0, 0])).toBeCloseTo(0.1, 12)
    expect(deltaEOK2([0.5, 0, 0], [0.5, 0.1, 0])).toBeCloseTo(0.2, 12)
    expect(deltaEOK2([0.5, 0, 0], [0.5, 0, 0.1])).toBeCloseTo(0.2, 12)
  })
})

describe('closeness', () => {
  test('boundaries', () => {
    expect(closeness(0)).toBe('identical')
    expect(closeness(0.0199)).toBe('identical')
    expect(closeness(0.02)).toBe('veryClose')
    expect(closeness(0.0499)).toBe('veryClose')
    expect(closeness(0.05)).toBe('close')
    expect(closeness(0.0899)).toBe('close')
    expect(closeness(0.09)).toBe('far')
  })
})

describe('textOn', () => {
  test('dark text on light colours, white text on dark ones', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 6)
    expect(relativeLuminance('#000000')).toBe(0)
    expect(textOn('#ffffff')).toBe('#111111')
    expect(textOn('#ffff00')).toBe('#111111')
    expect(textOn('#000000')).toBe('#ffffff')
    expect(textOn('#06004f')).toBe('#ffffff')
  })
})
