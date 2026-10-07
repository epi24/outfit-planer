import { type Box, boundingBox } from './cutout'

// Browser side of the cut-out: decoding the photo and painting the result.

export interface Photo {
  width: number
  height: number
  pixels: ImageData
}

const WORK_EDGE = 1024
const THUMB_EDGE = 320

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas wird nicht unterstützt')
  return ctx
}

/** Decodes a photo and scales it down; 1024 px is plenty and easy on memory. */
export async function loadPhoto(file: Blob): Promise<Photo> {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    // An <img> applies the EXIF rotation of phone photos; drawImage keeps it.
    await image.decode()
    const scale = Math.min(1, WORK_EDGE / Math.max(image.naturalWidth, image.naturalHeight))
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = context(canvas)
    ctx.drawImage(image, 0, 0, width, height)
    return { width, height, pixels: ctx.getImageData(0, 0, width, height) }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function padded(box: Box, width: number, height: number): Box {
  const margin = Math.round(Math.max(box.width, box.height) * 0.06)
  const x = Math.max(0, box.x - margin)
  const y = Math.max(0, box.y - margin)
  return {
    x,
    y,
    width: Math.min(width, box.x + box.width + margin) - x,
    height: Math.min(height, box.y + box.height + margin) - y,
  }
}

/**
 * Paints the garment on white into `canvas`, cropped to the garment.
 * Without a mask (or with an empty one) the whole photo is painted.
 */
export function paintCutout(canvas: HTMLCanvasElement, photo: Photo, mask: Uint8Array | null) {
  const { width, height, pixels } = photo
  const box = mask && boundingBox(mask, width, height)
  if (!mask || !box) {
    canvas.width = width
    canvas.height = height
    context(canvas).putImageData(pixels, 0, 0)
    return
  }

  const crop = padded(box, width, height)
  const out = new ImageData(crop.width, crop.height)
  const source = pixels.data
  for (let y = 0; y < crop.height; y++) {
    for (let x = 0; x < crop.width; x++) {
      const sx = crop.x + x
      const sy = crop.y + y
      // Soft edge: the share of garment pixels in the 3 x 3 neighbourhood.
      let inside = 0
      for (let dy = -1; dy <= 1; dy++) {
        const ny = sy + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = sx + dx
          if (nx >= 0 && nx < width) inside += mask[ny * width + nx]!
        }
      }
      const alpha = inside / 9
      const from = (sy * width + sx) * 4
      const to = (y * crop.width + x) * 4
      out.data[to] = source[from]! * alpha + 255 * (1 - alpha)
      out.data[to + 1] = source[from + 1]! * alpha + 255 * (1 - alpha)
      out.data[to + 2] = source[from + 2]! * alpha + 255 * (1 - alpha)
      out.data[to + 3] = 255
    }
  }
  canvas.width = crop.width
  canvas.height = crop.height
  context(canvas).putImageData(out, 0, 0)
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Bild konnte nicht erzeugt werden'))),
      'image/jpeg',
      quality,
    )
  })
}

/** The painted cut-out as the stored photo plus a small version for the grid. */
export async function exportCutout(canvas: HTMLCanvasElement): Promise<{ image: Blob; thumb: Blob }> {
  const scale = Math.min(1, THUMB_EDGE / Math.max(canvas.width, canvas.height))
  const small = document.createElement('canvas')
  small.width = Math.max(1, Math.round(canvas.width * scale))
  small.height = Math.max(1, Math.round(canvas.height * scale))
  const ctx = context(small)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, small.width, small.height)
  ctx.drawImage(canvas, 0, 0, small.width, small.height)
  return { image: await toJpeg(canvas, 0.88), thumb: await toJpeg(small, 0.82) }
}
