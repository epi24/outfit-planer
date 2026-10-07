export const CATEGORIES = [
  { id: 'tshirt', label: 'T-Shirt / Top' },
  { id: 'shirt', label: 'Hemd / Bluse' },
  { id: 'sweater', label: 'Pullover / Strick' },
  { id: 'jacket', label: 'Jacke / Mantel' },
  { id: 'trousers', label: 'Hose' },
  { id: 'shorts', label: 'Kurze Hose' },
  { id: 'skirt', label: 'Rock' },
  { id: 'dress', label: 'Kleid' },
  { id: 'shoes', label: 'Schuhe' },
  { id: 'accessory', label: 'Accessoire' },
  { id: 'other', label: 'Sonstiges' },
] as const

export type CategoryId = (typeof CATEGORIES)[number]['id']

export const isCategoryId = (value: string): value is CategoryId =>
  CATEGORIES.some((category) => category.id === value)

export const categoryLabel = (id: CategoryId): string =>
  CATEGORIES.find((category) => category.id === id)?.label ?? id
