import * as ort from 'onnxruntime-web/wasm'
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import type { Photo } from './image'
import { MODEL_SIZE, maskFromSaliency, normalizeOutput, toModelInput } from './refine'

// Background removal with U2-Net-p, a 4.6 MB salient-object model, run on the
// device through ONNX Runtime's WebAssembly backend. This module is loaded on
// demand, so that the runtime stays out of the app's start-up bundle.

ort.env.wasm.wasmPaths = { wasm: wasmUrl }
// More threads would need SharedArrayBuffer, which a static host such as
// GitHub Pages cannot enable (no cross-origin isolation headers).
ort.env.wasm.numThreads = 1

const MODEL_URL = `${import.meta.env.BASE_URL}models/u2netp.onnx`

let session: Promise<ort.InferenceSession> | null = null

/** Downloads (once) and prepares the model. Safe to call ahead of time. */
export function loadModel(): Promise<ort.InferenceSession> {
  session ??= ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'] }).catch(
    (error: unknown) => {
      session = null // allow another attempt, e.g. once the device is online
      throw error
    },
  )
  return session
}

function scaledPixels(photo: Photo): Uint8ClampedArray {
  const full = document.createElement('canvas')
  full.width = photo.width
  full.height = photo.height
  full.getContext('2d')!.putImageData(photo.pixels, 0, 0)
  const small = document.createElement('canvas')
  small.width = MODEL_SIZE
  small.height = MODEL_SIZE
  const ctx = small.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  // Stretched to a square, as in the model's training; undone when the
  // answer is scaled back to the photo.
  ctx.drawImage(full, 0, 0, MODEL_SIZE, MODEL_SIZE)
  return ctx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data
}

/** The garment mask (1 = garment) for a photo. */
export async function cutOut(photo: Photo, lab: Float32Array): Promise<Uint8Array> {
  const model = await loadModel()
  const input = new ort.Tensor('float32', toModelInput(scaledPixels(photo)), [
    1,
    3,
    MODEL_SIZE,
    MODEL_SIZE,
  ])
  const inputName = model.inputNames[0]
  const outputName = model.outputNames[0]
  if (!inputName || !outputName) throw new Error('Unerwartetes Modellformat')
  const result = await model.run({ [inputName]: input })
  const output = result[outputName]
  if (!output) throw new Error('Das Modell hat kein Ergebnis geliefert')
  const saliency = normalizeOutput(output.data as Float32Array)
  return maskFromSaliency(saliency, lab, photo.width, photo.height)
}
