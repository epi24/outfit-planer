// Object URLs for the stored photos. Each photo gets one URL that is reused
// for as long as the garment exists, and released when the garment is deleted.
const urls = new WeakMap<Blob, string>()

export function photoUrl(blob: Blob): string {
  let url = urls.get(blob)
  if (!url) {
    url = URL.createObjectURL(blob)
    urls.set(blob, url)
  }
  return url
}

export function releasePhotoUrl(blob: Blob) {
  const url = urls.get(blob)
  if (!url) return
  URL.revokeObjectURL(url)
  urls.delete(blob)
}
