// 메인 스레드 쪽 변환 래퍼: 이미지 디코드, 워커 관리(최신 요청만 반영), 디바운스
import type { ConvertRequest, ConvertResponse } from '../workers/convert.worker'

export interface SourceImage {
  rgba: Uint8ClampedArray
  w: number
  h: number
  aspect: number // w/h
  dataUrl: string // 자동저장·재로드용 축소본
}

const MAX_DECODE = 1600 // 다운샘플 원본 상한 (면적 평균에 충분)
const THUMB = 900 // 자동저장용 축소본 상한

/** 파일/Blob → 픽셀 데이터 + 축소 dataURL */
export async function decodeImage(file: Blob): Promise<SourceImage> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DECODE / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * scale))
  const h = Math.max(1, Math.round(bmp.height * scale))
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const ctx = cv.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0, w, h)
  const rgba = ctx.getImageData(0, 0, w, h).data

  const tScale = Math.min(1, THUMB / Math.max(w, h))
  let dataUrl: string
  if (tScale < 1) {
    const tv = document.createElement('canvas')
    tv.width = Math.round(w * tScale)
    tv.height = Math.round(h * tScale)
    tv.getContext('2d')!.drawImage(cv, 0, 0, tv.width, tv.height)
    dataUrl = tv.toDataURL('image/jpeg', 0.82)
  } else {
    dataUrl = cv.toDataURL('image/jpeg', 0.82)
  }
  bmp.close()
  return { rgba, w, h, aspect: w / h, dataUrl }
}

/** 초기 크기 자동 산출 */
export function autoSize(
  aspect: number,
  mode: 'count' | 'widthCm',
  budget: number,
  widthCm: number,
  diameterMm: number,
): { W: number; H: number } {
  if (mode === 'count') {
    const W = Math.max(1, Math.round(Math.sqrt(budget * aspect)))
    const H = Math.max(1, Math.round(budget / W))
    return { W, H }
  }
  const W = Math.max(1, Math.round((widthCm * 10) / diameterMm))
  const H = Math.max(1, Math.round(W / aspect))
  return { W, H }
}

type ConvertResult = Omit<ConvertResponse, 'id'>

let worker: Worker | null = null
let jobId = 0
let pending: { resolve: (r: ConvertResult | null) => void; id: number } | null = null

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/convert.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (e: MessageEvent<ConvertResponse>) => {
      if (pending && e.data.id === pending.id) {
        const { resolve } = pending
        pending = null
        resolve(e.data)
      }
    }
  }
  return worker
}

/** 변환 실행. 더 새로운 요청이 오면 이전 요청 결과는 null로 resolve */
export function convertInWorker(
  img: SourceImage,
  W: number,
  H: number,
  palLab: Float32Array,
  palRgb: Uint8Array,
  palMap: Uint16Array,
  maxColors: number,
  dithering: boolean,
): Promise<ConvertResult | null> {
  const id = ++jobId
  if (pending) pending.resolve(null) // 이전 요청은 무효
  return new Promise((resolve) => {
    pending = { resolve, id }
    const src = img.rgba.buffer.slice(0) as ArrayBuffer // 워커로 복사본 전달(원본 유지)
    const req: ConvertRequest = {
      id, src, srcW: img.w, srcH: img.h, W, H,
      palLab, palRgb, palMap, maxColors, dithering,
    }
    getWorker().postMessage(req, [src])
  })
}
