import { parseHex } from '../features/wada/color'
import { colorById, combinationById } from '../features/wada/data'

export type Route =
  | { name: 'combinations' }
  | { name: 'combination'; id: number }
  | { name: 'colors' }
  | { name: 'color'; id: number }
  | { name: 'custom'; hex: string }
  | { name: 'notFound' }

export type Tab = 'combinations' | 'colors'

/** Paths live in the URL hash, e.g. "#/colors/42". */
export const paths = {
  combinations: '/combinations',
  combination: (id: number) => `/combinations/${id}`,
  colors: '/colors',
  color: (id: number) => `/colors/${id}`,
  custom: (hex: string) => `/colors/custom/${hex.slice(1)}`,
} as const

export const isTabRoot = (path: string): boolean =>
  path === paths.combinations || path === paths.colors

const ID = /^[1-9]\d{0,2}$/
const NOT_FOUND: Route = { name: 'notFound' }

export function parseRoute(path: string): Route {
  if (path === '' || path === '/') return { name: 'combinations' }
  const [first, second, third, ...rest] = path.replace(/^\//, '').split('/')
  if (rest.length > 0) return NOT_FOUND

  if (first === 'combinations') {
    if (second === undefined) return { name: 'combinations' }
    if (third === undefined && ID.test(second) && combinationById(Number(second))) {
      return { name: 'combination', id: Number(second) }
    }
    return NOT_FOUND
  }

  if (first === 'colors') {
    if (second === undefined) return { name: 'colors' }
    if (second === 'custom') {
      const hex = third === undefined ? null : parseHex(third)
      return hex ? { name: 'custom', hex } : NOT_FOUND
    }
    if (third === undefined && ID.test(second) && colorById(Number(second))) {
      return { name: 'color', id: Number(second) }
    }
  }
  return NOT_FOUND
}

export function tabOf(route: Route): Tab | null {
  switch (route.name) {
    case 'combinations':
    case 'combination':
      return 'combinations'
    case 'colors':
    case 'color':
    case 'custom':
      return 'colors'
    case 'notFound':
      return null
  }
}
