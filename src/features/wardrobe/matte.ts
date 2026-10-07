import * as ort from 'onnxruntime-web/wasm'
// Imported by file path: the package does not export its .wasm files.
import plainWasmUrl from '../../../node_modules/onnxruntime-web/dist/ort-wasm.wasm?url'
import simdWasmUrl from '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd.wasm?url'
import type { Photo } from './image'
import { MODEL_SIZE, maskFromSaliency, normalizeOutput, toModelInput } from './refine'

// Background removal with U2-Net-p, a 4.6 MB salient-object model, run on the
// device through ONNX Runtime's WebAssembly backend. This module is loaded on
// demand, so that the runtime stays out of the app's start-up bundle.
//
// onnxruntime-web is pinned to 1.18.0 on purpose. From 1.19 on it only ships
// a threaded build, whose shared memory reserves its 4 GB maximum up front;
// Safari on iOS refuses that with "RangeError: Out of memory", so no session
// can be created on an iPhone. 1.18.0 is the last version with a
// single-threaded build, whose memory grows as needed.

ort.env.wasm.numThreads = 1 // selects the single-threaded build
ort.env.wasm.proxy = false
ort.env.wasm.wasmPaths = {
  'ort-wasm-simd.wasm': simdWasmUrl,
  'ort-wasm.wasm': plainWasmUrl, // for browsers without WebAssembly SIMD
}

const MODEL_URL = `${import.meta.env.BASE_URL}models/u2netp.onnx`

let session: Promise<ort.InferenceSession> | null = null

/** Downloads (once) and prepares the model. Safe to call ahead of time. */
export function loadModel(): Promise<ort.InferenceSession> {
  session ??= ort.InferenceSession.create(MODEL_URL, {
    executionProviders: ['wasm'],
    // Both keep the runtime from growing its memory ahead of need, which
    // matters on phones.
    enableCpuMemArena: false,
    enableMemPattern: false,
  }).catch((error: unknown) => {
    session = null // allow another attempt, e.g. once the device is online
    throw error
  })
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
  const pixels = ctx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data
  // iOS keeps canvas memory until garbage collection; hand it back now.
  full.width = full.height = small.width = small.height = 0
  return pixels
}

/** The model's answer for a photo: garment likelihood, 0..1, at 320 x 320. */
export async function saliencyOf(photo: Photo): Promise<Float32Array> {
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
  return normalizeOutput(output.data as Float32Array)
}

/** The garment mask (1 = garment) for a photo. */
export async function cutOut(photo: Photo, lab: Float32Array): Promise<Uint8Array> {
  return maskFromSaliency(await saliencyOf(photo), lab, photo.width, photo.height)
}
