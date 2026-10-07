import { useSyncExternalStore } from 'react'
import { type CategoryId, categoryLabel } from './categories'
import type { GarmentColor } from './cutout'
import { releasePhotoUrl } from './photoUrl'

// The wardrobe lives in IndexedDB on the device; there is no server.

export interface Garment {
  id: string
  createdAt: number
  category: CategoryId
  name: string
  note: string
  /** main colour first */
  colors: GarmentColor[]
  /** cut-out photo on white, JPEG */
  image: Blob
  thumb: Blob
}

/** What to call a garment in lists and headings. */
export const garmentTitle = (garment: Garment): string =>
  garment.name || categoryLabel(garment.category)

export interface WardrobeState {
  status: 'loading' | 'ready' | 'error'
  /** newest first */
  garments: readonly Garment[]
}

const DB_NAME = 'outfit-planner'
const STORE = 'garments'

let state: WardrobeState = { status: 'loading', garments: [] }
let started = false
const listeners = new Set<() => void>()

function setState(next: WardrobeState) {
  state = next
  listeners.forEach((listener) => listener())
}

const newestFirst = (list: readonly Garment[]) =>
  [...list].sort((p, q) => q.createdAt - p.createdAt)

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode)
      const request = action(transaction.objectStore(STORE))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    db.close()
  }
}

function load() {
  started = true
  run<Garment[]>('readonly', (store) => store.getAll()).then(
    (garments) => setState({ status: 'ready', garments: newestFirst(garments) }),
    () => setState({ status: 'error', garments: [] }),
  )
}

export async function saveGarment(garment: Garment): Promise<void> {
  await run('readwrite', (store) => store.put(garment))
  const others = state.garments.filter((item) => item.id !== garment.id)
  setState({ status: 'ready', garments: newestFirst([...others, garment]) })
  // Ask the browser not to evict the photos when storage runs low.
  void navigator.storage?.persist?.().catch(() => false)
}

export async function deleteGarment(id: string): Promise<void> {
  await run('readwrite', (store) => store.delete(id))
  const deleted = state.garments.find((item) => item.id === id)
  if (deleted) {
    releasePhotoUrl(deleted.image)
    releasePhotoUrl(deleted.thumb)
  }
  setState({ status: 'ready', garments: state.garments.filter((item) => item.id !== id) })
}

export function newGarmentId(): string {
  // randomUUID is missing on pages that are not served securely.
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  )
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!started) load()
  return () => {
    listeners.delete(listener)
  }
}

export const useWardrobe = (): WardrobeState => useSyncExternalStore(subscribe, () => state)
