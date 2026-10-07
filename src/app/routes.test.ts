import { describe, expect, test } from 'vitest'
import { isTabRoot, parseRoute, paths, tabOf } from './routes'

describe('parseRoute', () => {
  test('the start page is the combination list', () => {
    expect(parseRoute('')).toEqual({ name: 'combinations' })
    expect(parseRoute('/')).toEqual({ name: 'combinations' })
    expect(parseRoute('/combinations')).toEqual({ name: 'combinations' })
  })

  test('valid ids', () => {
    expect(parseRoute('/combinations/1')).toEqual({ name: 'combination', id: 1 })
    expect(parseRoute('/combinations/348')).toEqual({ name: 'combination', id: 348 })
    expect(parseRoute('/colors')).toEqual({ name: 'colors' })
    expect(parseRoute('/colors/1')).toEqual({ name: 'color', id: 1 })
    expect(parseRoute('/colors/159')).toEqual({ name: 'color', id: 159 })
  })

  test.each([
    '/combinations/0',
    '/combinations/349',
    '/combinations/007',
    '/combinations/1e2',
    '/combinations/abc',
    '/combinations/1/2',
    '/combinations/',
    '/colors/0',
    '/colors/160',
    '/colors/abc',
    '/colors/1/2',
    '/colors/custom',
    '/colors/custom/xyz',
    '/colors/custom/abcd',
    '/colors/custom/a1b2c3/x',
    '/wardrobe/',
    '/wardrobe/abc',
    '/wardrobe/new/x',
    '/wardrobe/NOT-AN-ID-123',
    '/nowhere',
  ])('%s is not found', (path) => {
    expect(parseRoute(path)).toEqual({ name: 'notFound' })
  })

  test('wardrobe', () => {
    expect(parseRoute('/wardrobe')).toEqual({ name: 'wardrobe' })
    expect(parseRoute('/wardrobe/new')).toEqual({ name: 'garmentNew' })
    const id = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b'
    expect(parseRoute(paths.garment(id))).toEqual({ name: 'garment', id })
    expect(parseRoute('/wardrobe/mg1k2abc-x9y8z7w6')).toEqual({
      name: 'garment',
      id: 'mg1k2abc-x9y8z7w6',
    })
  })

  test('custom colours are normalised', () => {
    expect(parseRoute('/colors/custom/A1B2C3')).toEqual({ name: 'custom', hex: '#a1b2c3' })
    expect(parseRoute('/colors/custom/abc')).toEqual({ name: 'custom', hex: '#aabbcc' })
  })
})

describe('paths', () => {
  test('round trip', () => {
    expect(parseRoute(paths.combinations)).toEqual({ name: 'combinations' })
    expect(parseRoute(paths.combination(187))).toEqual({ name: 'combination', id: 187 })
    expect(parseRoute(paths.colors)).toEqual({ name: 'colors' })
    expect(parseRoute(paths.color(98))).toEqual({ name: 'color', id: 98 })
    expect(paths.custom('#a1b2c3')).toBe('/colors/custom/a1b2c3')
    expect(parseRoute(paths.custom('#a1b2c3'))).toEqual({ name: 'custom', hex: '#a1b2c3' })
  })

  test('tab roots', () => {
    expect(isTabRoot('/combinations')).toBe(true)
    expect(isTabRoot('/colors')).toBe(true)
    expect(isTabRoot('/wardrobe')).toBe(true)
    expect(isTabRoot('/wardrobe/new')).toBe(false)
    expect(isTabRoot('/colors/1')).toBe(false)
    expect(isTabRoot('/colors/custom/a1b2c3')).toBe(false)
  })
})

describe('tabOf', () => {
  test('maps every route to its tab', () => {
    expect(tabOf({ name: 'combinations' })).toBe('combinations')
    expect(tabOf({ name: 'combination', id: 1 })).toBe('combinations')
    expect(tabOf({ name: 'colors' })).toBe('colors')
    expect(tabOf({ name: 'color', id: 1 })).toBe('colors')
    expect(tabOf({ name: 'custom', hex: '#a1b2c3' })).toBe('colors')
    expect(tabOf({ name: 'wardrobe' })).toBe('wardrobe')
    expect(tabOf({ name: 'garmentNew' })).toBe('wardrobe')
    expect(tabOf({ name: 'garment', id: 'abcdefgh' })).toBe('wardrobe')
    expect(tabOf({ name: 'notFound' })).toBeNull()
  })
})
