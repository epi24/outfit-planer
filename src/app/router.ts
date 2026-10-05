import { useSyncExternalStore } from 'react'
import { isTabRoot, paths } from './routes'

// Hash URLs driven by the History API. Every history entry carries an index in
// history.state so that push and back/forward can be told apart, the in-app
// back button knows whether there is anything to go back to, and the scroll
// position of each entry can be restored.

export interface Nav {
  readonly path: string
  /** position of the current entry in this app's history */
  readonly index: number
  /** changes whenever the scroll position has to be restored */
  readonly scrollSeq: number
}

interface NavigateOptions {
  replace?: boolean
}

const listeners = new Set<() => void>()
const scrollByEntry = new Map<number, { path: string; y: number }>()
const scrollByRoot = new Map<string, number>()

// Canonical path, so that "#/" and "#colors" count as the tab roots they show.
function readPath(): string {
  const raw = window.location.hash.slice(1)
  if (raw === '' || raw === '/') return paths.combinations
  return raw.startsWith('/') ? raw : '/' + raw
}

function stateIndex(): number | undefined {
  const state: unknown = window.history.state
  if (typeof state === 'object' && state !== null && 'i' in state && typeof state.i === 'number') {
    return state.i
  }
  return undefined
}

window.history.scrollRestoration = 'manual'
if (stateIndex() === undefined) window.history.replaceState({ i: 0 }, '')

let current: Nav = { path: readPath(), index: stateIndex() ?? 0, scrollSeq: 0 }

function leave() {
  scrollByEntry.set(current.index, { path: current.path, y: window.scrollY })
  if (isTabRoot(current.path)) scrollByRoot.set(current.path, window.scrollY)
}

/**
 * Drop the remembered scroll positions of a page whose content has changed
 * (new search or filter), so that older history entries do not restore an
 * offset that belonged to a different list.
 */
export function forgetScroll(path: string) {
  scrollByRoot.delete(path)
  for (const [index, entry] of scrollByEntry) {
    if (entry.path === path) scrollByEntry.delete(index)
  }
}

function commit(index: number, restoreScroll: boolean) {
  current = {
    path: readPath(),
    index,
    scrollSeq: restoreScroll ? current.scrollSeq + 1 : current.scrollSeq,
  }
  listeners.forEach((listener) => listener())
}

export function navigate(path: string, { replace = false }: NavigateOptions = {}) {
  if (replace) {
    window.history.replaceState({ i: current.index }, '', '#' + path)
    commit(current.index, false)
    return
  }
  if (path === current.path) return
  leave()
  const index = current.index + 1
  scrollByEntry.delete(index)
  window.history.pushState({ i: index }, '', '#' + path)
  commit(index, true)
}

// Back/forward, or a hash that was typed or followed without going through
// navigate(). The latter arrives without state and is treated as a push.
function onTraverse() {
  const index = stateIndex()
  if (index === current.index && readPath() === current.path) return
  leave()
  if (index !== undefined) {
    commit(index, true)
    return
  }
  const next = current.index + 1
  scrollByEntry.delete(next)
  window.history.replaceState({ i: next }, '')
  commit(next, true)
}

window.addEventListener('popstate', onTraverse)
window.addEventListener('hashchange', onTraverse)

/** Go back; on a deep-linked page with nothing behind it, go to `fallback`. */
export function back(fallback: string) {
  if (current.index > 0) {
    window.history.back()
    return
  }
  scrollByEntry.delete(current.index)
  window.history.replaceState({ i: current.index }, '', '#' + fallback)
  commit(current.index, true)
}

export const scrollTarget = (nav: Nav): number =>
  scrollByEntry.get(nav.index)?.y ?? (isTabRoot(nav.path) ? (scrollByRoot.get(nav.path) ?? 0) : 0)

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useNav = (): Nav => useSyncExternalStore(subscribe, () => current)
