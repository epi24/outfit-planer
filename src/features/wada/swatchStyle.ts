import type { CSSProperties } from 'react'

/** Inline style that hands a colour to CSS as the custom property --c. */
export const swatchStyle = (hex: string, extra?: CSSProperties): CSSProperties =>
  ({ '--c': hex, ...extra }) as CSSProperties
