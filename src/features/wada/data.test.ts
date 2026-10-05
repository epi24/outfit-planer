import { describe, expect, test } from 'vitest'
import {
  collections,
  colorById,
  colors,
  colorsOf,
  combinationById,
  combinations,
  combinationsForColor,
  groupBySize,
  nearestColors,
  partnersOf,
  searchCombinations,
} from './data'

const idsOf = (list: readonly { id: number }[]) => list.map((item) => item.id)
const byName = (name: string) => {
  const color = colors.find((candidate) => candidate.name === name)
  if (!color) throw new Error(`no colour named ${name}`)
  return color
}

describe('colours', () => {
  test('159 colours in book order', () => {
    expect(colors).toHaveLength(159)
    expect(idsOf(colors)).toEqual(Array.from({ length: 159 }, (_, index) => index + 1))
    expect(colorById(1)?.name).toBe('Hermosa Pink')
    expect(colorById(39)?.name).toBe('Sulpher Yellow')
    expect(colorById(98)?.name).toBe('Chromium Green')
    expect(colorById(154)?.name).toBe('White')
    expect(colorById(159)?.name).toBe('Black')
    expect(colorById(0)).toBeUndefined()
    expect(colorById(160)).toBeUndefined()
  })

  test('keeps the original spellings', () => {
    for (const name of ['Sulpher Yellow', 'Calamine BLue', 'Eugenia Red | A', 'Citrine']) {
      expect(colors.some((color) => color.name === name)).toBe(true)
    }
  })

  test('website-style hex values', () => {
    expect(byName('Hermosa Pink').hex).toBe('#ffb3f0')
    expect(byName('Citrine').hex).toBe('#a3ad00')
    expect(byName('Chromium Green').hex).toBe('#66ab56')
    expect(byName('Dull Violet Black').hex).toBe('#06004f')
    expect(byName('White').hex).toBe('#ffffff')
    expect(byName('Black').hex).toBe('#000000')
    expect(new Set(colors.map((color) => color.hex)).size).toBe(159)
    for (const color of colors) expect(color.hex).toMatch(/^#[0-9a-f]{6}$/)
  })

  test('collections are contiguous id ranges', () => {
    expect(collections.map((group) => group.colors.length)).toEqual([38, 49, 23, 23, 20, 6])
    const ranges = collections.map((group) => [group.colors[0]?.id, group.colors.at(-1)?.id])
    expect(ranges).toEqual([
      [1, 38],
      [39, 87],
      [88, 110],
      [111, 133],
      [134, 153],
      [154, 159],
    ])
  })

  test('text colour follows the luminance', () => {
    expect(byName('White').textColor).toBe('#111111')
    expect(byName('Black').textColor).toBe('#ffffff')
    expect(colors.filter((color) => color.textColor === '#111111')).toHaveLength(98)
  })
})

describe('combinations', () => {
  test('348 combinations, sized by id band', () => {
    expect(combinations).toHaveLength(348)
    expect(idsOf(combinations)).toEqual(Array.from({ length: 348 }, (_, index) => index + 1))
    for (const combination of combinations) {
      const expected = combination.id <= 120 ? 2 : combination.id <= 240 ? 3 : 4
      expect(combination.size).toBe(expected)
      expect(combination.colorIds).toHaveLength(expected)
    }
  })

  test('members are valid and in book order', () => {
    for (const combination of combinations) {
      const sorted = [...combination.colorIds].sort((a, b) => a - b)
      expect(combination.colorIds).toEqual(sorted)
      expect(new Set(combination.colorIds).size).toBe(combination.colorIds.length)
      expect(colorsOf(combination)).toHaveLength(combination.size)
    }
  })

  test('known combinations', () => {
    const first = combinationById(1)
    expect(first && colorsOf(first).map((color) => [color.name, color.hex])).toEqual([
      ['English Red', '#de4500'],
      ['Cerulian Blue', '#29bdad'],
    ])
    const c187 = combinationById(187)
    expect(c187 && colorsOf(c187).map((color) => color.name)).toEqual([
      'Helvetia Blue',
      'Grayish Lavender - B',
      'Aconite Violet',
    ])
    expect(combinationById(0)).toBeUndefined()
    expect(combinationById(349)).toBeUndefined()
  })

  test('combinations of a colour', () => {
    expect(idsOf(combinationsForColor(1))).toEqual([176, 227, 273])
    expect(combinationsForColor(159)).toHaveLength(23)
    expect(combinationsForColor(154)).toHaveLength(1)
    expect(combinationsForColor(999)).toEqual([])
    for (const color of colors) expect(combinationsForColor(color.id).length).toBeGreaterThan(0)
  })

  test('groupBySize keeps only non-empty groups, smallest first', () => {
    const groups = groupBySize(combinationsForColor(1))
    expect(groups.map((group) => [group.size, group.items.length])).toEqual([
      [3, 2],
      [4, 1],
    ])
  })
})

describe('partnersOf', () => {
  test('Black has 40 partners, none of them itself', () => {
    const partners = partnersOf(159)
    expect(partners).toHaveLength(40)
    expect(partners.some((partner) => partner.color.id === 159)).toBe(false)
  })

  test('sorted by shared combinations, then book order', () => {
    for (const color of colors) {
      const partners = partnersOf(color.id)
      for (let index = 1; index < partners.length; index++) {
        const previous = partners[index - 1]
        const current = partners[index]
        if (!previous || !current) throw new Error('unreachable')
        const ordered =
          previous.shared > current.shared ||
          (previous.shared === current.shared && previous.color.id < current.color.id)
        expect(ordered).toBe(true)
      }
    }
  })
})

describe('searchCombinations', () => {
  test('empty query returns everything', () => {
    expect(searchCombinations('')).toHaveLength(348)
    expect(searchCombinations('   ')).toHaveLength(348)
    expect(searchCombinations('', 2)).toHaveLength(120)
    expect(searchCombinations('', 3)).toHaveLength(120)
    expect(searchCombinations('', 4)).toHaveLength(108)
  })

  test('by number', () => {
    expect(idsOf(searchCombinations('12'))).toEqual([12])
    expect(idsOf(searchCombinations('#12'))).toEqual([12])
    expect(idsOf(searchCombinations(' 12 '))).toEqual([12])
    expect(searchCombinations('12', 3)).toEqual([])
    expect(searchCombinations('0')).toEqual([])
    expect(searchCombinations('349')).toEqual([])
  })

  test('by colour name, forgiving about case, spaces and punctuation', () => {
    expect(idsOf(searchCombinations('hermosa'))).toEqual([176, 227, 273])
    expect(searchCombinations('olive')).toHaveLength(42)
    expect(searchCombinations('olive ')).toHaveLength(42)
    expect(searchCombinations('OLIVE')).toHaveLength(42)
    expect(searchCombinations("hay's")).toHaveLength(11)
    expect(searchCombinations('hay’s')).toHaveLength(11)
    expect(searchCombinations('hays')).toHaveLength(11)
    expect(searchCombinations('grayish lavender b')).toHaveLength(8)
    expect(idsOf(searchCombinations('eugenia red a'))).toEqual([284])
    expect(searchCombinations('zzz')).toEqual([])
  })

  test('size filter applies to name matches', () => {
    const all = searchCombinations('olive')
    for (const size of [2, 3, 4] as const) {
      expect(idsOf(searchCombinations('olive', size))).toEqual(
        idsOf(all.filter((combination) => combination.size === size)),
      )
    }
  })
})

describe('nearestColors', () => {
  test('every palette colour finds itself first', () => {
    for (const color of colors) {
      const [first] = nearestColors(color.hex)
      expect(first?.color.id).toBe(color.id)
      expect(first?.distance).toBe(0)
      expect(first?.closeness).toBe('identical')
    }
  })

  test('returns n matches, nearest first', () => {
    const matches = nearestColors('#6b6b3a', 5)
    expect(matches).toHaveLength(5)
    expect(matches[0]?.color.name).toBe('Light Brownish Olive')
    expect(matches[0]?.closeness).toBe('identical')
    const distances = matches.map((match) => match.distance)
    expect(distances).toEqual([...distances].sort((a, b) => a - b))
    expect(nearestColors('#6b6b3a')).toHaveLength(3)
  })

  test('mid grey has no close match', () => {
    expect(nearestColors('#808080')[0]?.closeness).toBe('far')
  })

  test('near-black neutrals lead with Black', () => {
    for (const hex of ['#050505', '#111111', '#1a1a1a', '#1c1c1e', '#222222', '#2a2a2a']) {
      const [first] = nearestColors(hex)
      expect(first?.color.name).toBe('Black')
      expect(first?.closeness).not.toBe('far')
    }
  })

  test('a leading Black is labelled by lightness, not by distance', () => {
    expect(nearestColors('#010101')[0]).toMatchObject({ closeness: 'identical' })
    expect(nearestColors('#0a0000')[0]).toMatchObject({ closeness: 'identical' })
    expect(nearestColors('#111111')[0]).toMatchObject({ closeness: 'veryClose' })
    expect(nearestColors('#222222')[0]).toMatchObject({ closeness: 'close' })
    for (const hex of ['#010101', '#0a0000']) {
      expect(nearestColors(hex)[0]?.color.name).toBe('Black')
    }
  })

  test('dark but coloured or lighter inputs are left alone', () => {
    expect(nearestColors('#0f261f')[0]?.color.name).toBe('Deep Slate Green')
    expect(nearestColors('#1f2a44')[0]?.color.name).toBe('Dark Tyrian Blue')
    expect(nearestColors('#444444')[0]?.color.name).toBe('Slate Color')
  })

  // Nearly neutral, but a palette colour is very close: no Black in front.
  test('a very close palette colour beats the near-black rule', () => {
    const [first, second] = nearestColors('#172420')
    expect(first?.color.name).toBe('Deep Slate Green')
    expect(first?.closeness).toBe('veryClose')
    expect(second?.color.name).not.toBe('Black')
  })
})
