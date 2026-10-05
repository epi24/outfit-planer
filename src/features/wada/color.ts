export type Cmyk = readonly [number, number, number, number]
export type Oklab = readonly [number, number, number]
export type Closeness = 'identical' | 'veryClose' | 'close' | 'far'

/** Colour as shown on sanzo-wada.dmbk.io: the naive CMYK -> RGB conversion. */
export function cmykToHex([c, m, y, k]: Cmyk): string {
  // Keep this exact floating-point form. The integer form
  // 255 * (100 - v) * (100 - k) / 10000 rounds seven colours differently.
  const channel = (v: number) =>
    Math.min(255, Math.max(0, Math.round(255 * (1 - v / 100) * (1 - k / 100))))
  return '#' + [c, m, y].map((v) => channel(v).toString(16).padStart(2, '0')).join('')
}

/** Accepts "abc", "#ABC", " a1b2c3 "; returns "#rrggbb" in lower case or null. */
export function parseHex(input: string): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim())
  if (!match) return null
  const digits = (match[1] ?? '').toLowerCase()
  return '#' + (digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits)
}

function linearChannels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  const linear = (value: number) => {
    const s = value / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return [linear(n >> 16), linear((n >> 8) & 255), linear(n & 255)]
}

/** sRGB hex -> OKLab, coefficients from Björn Ottosson. */
export function hexToOklab(hex: string): Oklab {
  const [r, g, b] = linearChannels(hex)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

export const chroma = (lab: Oklab): number => Math.hypot(lab[1], lab[2])

/** OKLab distance with a and b weighted twice; plain OKLab underweights chroma. */
export const deltaEOK2 = (p: Oklab, q: Oklab): number =>
  Math.hypot(p[0] - q[0], 2 * (p[1] - q[1]), 2 * (p[2] - q[2]))

/** WCAG relative luminance. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = linearChannels(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Text colour with the better contrast on the given background. */
export const textOn = (hex: string): string =>
  relativeLuminance(hex) > 0.179 ? '#111111' : '#ffffff'

export const closeness = (distance: number): Closeness =>
  distance < 0.02 ? 'identical' : distance < 0.05 ? 'veryClose' : distance < 0.09 ? 'close' : 'far'
