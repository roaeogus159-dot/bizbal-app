// 변환 워커: 박스 다운샘플 → ΔE2000 팔레트 매칭 → 최대 색 수 제한 → (옵션) Floyd–Steinberg 디더링
// TypedArray만 사용해 수만~수십만 칸도 UI 프리징 없이 처리한다.
import { rgbToLab, deltaE2000 } from '../lib/color'

export interface ConvertRequest {
  id: number
  src: ArrayBuffer // RGBA
  srcW: number
  srcH: number
  W: number
  H: number
  palLab: Float32Array // 사용 색 n*3
  palRgb: Uint8Array // 사용 색 n*3
  palMap: Uint16Array // 서브셋 → 전체 팔레트 인덱스
  maxColors: number
  dithering: boolean
}

export interface ConvertResponse {
  id: number
  grid: Uint16Array // W*H, 전체 팔레트 인덱스
  deltaE: Float32Array // W*H, 원본색↔선택색 ΔE2000 (전문가 모드 강조용)
  cellRgb: Uint8ClampedArray // W*H*3, 다운샘플된 원본 대표색
  ms: number
}

/** 박스(면적 평균) 다운샘플 */
function downsample(
  src: Uint8ClampedArray, srcW: number, srcH: number, W: number, H: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(W * H * 3)
  for (let y = 0; y < H; y++) {
    const sy0 = Math.floor((y * srcH) / H)
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * srcH) / H))
    for (let x = 0; x < W; x++) {
      const sx0 = Math.floor((x * srcW) / W)
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * srcW) / W))
      let r = 0, g = 0, b = 0, n = 0
      for (let sy = sy0; sy < sy1; sy++) {
        let p = (sy * srcW + sx0) * 4
        for (let sx = sx0; sx < sx1; sx++) {
          const a = src[p + 3] / 255
          // 투명 픽셀은 흰 배경 합성
          r += src[p] * a + 255 * (1 - a)
          g += src[p + 1] * a + 255 * (1 - a)
          b += src[p + 2] * a + 255 * (1 - a)
          n++
          p += 4
        }
      }
      const o = (y * W + x) * 3
      out[o] = r / n
      out[o + 1] = g / n
      out[o + 2] = b / n
    }
  }
  return out
}

/** allowed 서브셋 내에서 가장 가까운 색 찾기 (lab 기준) */
function nearest(
  L: number, A: number, B: number,
  palLab: Float32Array, allowed: number[] | null, n: number,
): { idx: number; de: number } {
  let best = -1
  let bestDe = Infinity
  if (allowed) {
    for (let k = 0; k < allowed.length; k++) {
      const i = allowed[k]
      const de = deltaE2000(L, A, B, palLab[i * 3], palLab[i * 3 + 1], palLab[i * 3 + 2])
      if (de < bestDe) { bestDe = de; best = i }
    }
  } else {
    for (let i = 0; i < n; i++) {
      const de = deltaE2000(L, A, B, palLab[i * 3], palLab[i * 3 + 1], palLab[i * 3 + 2])
      if (de < bestDe) { bestDe = de; best = i }
    }
  }
  return { idx: best, de: bestDe }
}

/** 디더링 없는 매칭 패스 (같은 RGB는 캐시로 재사용) */
function matchPass(
  cellRgb: Uint8ClampedArray, count: number,
  palLab: Float32Array, n: number, allowed: number[] | null,
  outIdx: Uint16Array, outDe: Float32Array,
) {
  const cache = new Map<number, number>() // rgb키 → (idx<<12 없이) 캐시는 idx와 de 둘 다 필요 → 두 맵
  const cacheDe = new Map<number, number>()
  const lab: number[] = [0, 0, 0]
  for (let c = 0; c < count; c++) {
    const r = cellRgb[c * 3], g = cellRgb[c * 3 + 1], b = cellRgb[c * 3 + 2]
    const key = (r << 16) | (g << 8) | b
    const hit = cache.get(key)
    if (hit !== undefined) {
      outIdx[c] = hit
      outDe[c] = cacheDe.get(key)!
      continue
    }
    rgbToLab(r, g, b, lab)
    const { idx, de } = nearest(lab[0], lab[1], lab[2], palLab, allowed, n)
    outIdx[c] = idx
    outDe[c] = de
    cache.set(key, idx)
    cacheDe.set(key, de)
  }
}

/** Floyd–Steinberg 디더링 (serpentine) */
function ditherPass(
  cellRgb: Uint8ClampedArray, W: number, H: number,
  palLab: Float32Array, palRgb: Uint8Array, n: number, allowed: number[] | null,
  outIdx: Uint16Array, outDe: Float32Array,
) {
  const buf = new Float32Array(W * H * 3)
  for (let i = 0; i < buf.length; i++) buf[i] = cellRgb[i]
  const lab: number[] = [0, 0, 0]
  for (let y = 0; y < H; y++) {
    const ltr = y % 2 === 0
    for (let i = 0; i < W; i++) {
      const x = ltr ? i : W - 1 - i
      const c = y * W + x
      const r = Math.max(0, Math.min(255, buf[c * 3]))
      const g = Math.max(0, Math.min(255, buf[c * 3 + 1]))
      const b = Math.max(0, Math.min(255, buf[c * 3 + 2]))
      rgbToLab(r, g, b, lab)
      const { idx } = nearest(lab[0], lab[1], lab[2], palLab, allowed, n)
      outIdx[c] = idx
      // 전문가 모드 ΔE는 "원본 대표색" 기준으로 계산 (디더 오차 누적분 제외)
      rgbToLab(cellRgb[c * 3], cellRgb[c * 3 + 1], cellRgb[c * 3 + 2], lab)
      outDe[c] = deltaE2000(
        lab[0], lab[1], lab[2],
        palLab[idx * 3], palLab[idx * 3 + 1], palLab[idx * 3 + 2],
      )
      const er = r - palRgb[idx * 3]
      const eg = g - palRgb[idx * 3 + 1]
      const eb = b - palRgb[idx * 3 + 2]
      const dx = ltr ? 1 : -1
      const spread = (xx: number, yy: number, f: number) => {
        if (xx < 0 || xx >= W || yy >= H) return
        const p = (yy * W + xx) * 3
        buf[p] += er * f
        buf[p + 1] += eg * f
        buf[p + 2] += eb * f
      }
      spread(x + dx, y, 7 / 16)
      spread(x - dx, y + 1, 3 / 16)
      spread(x, y + 1, 5 / 16)
      spread(x + dx, y + 1, 1 / 16)
    }
  }
}

self.onmessage = (e: MessageEvent<ConvertRequest>) => {
  const t0 = performance.now()
  const { id, src, srcW, srcH, W, H, palLab, palRgb, palMap, maxColors, dithering } = e.data
  const count = W * H
  const cellRgb = downsample(new Uint8ClampedArray(src), srcW, srcH, W, H)

  const subIdx = new Uint16Array(count) // 서브셋 인덱스
  const deltaE = new Float32Array(count)
  const n = palMap.length

  // 1차: 전체 사용색으로 매칭
  matchPass(cellRgb, count, palLab, n, null, subIdx, deltaE)

  // 최대 색 수 제한: 사용 빈도 상위 maxColors만 남기고 재매칭
  let allowed: number[] | null = null
  {
    const used = new Map<number, number>()
    for (let c = 0; c < count; c++) used.set(subIdx[c], (used.get(subIdx[c]) ?? 0) + 1)
    if (used.size > maxColors) {
      allowed = [...used.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxColors)
        .map(([i]) => i)
    }
  }

  if (dithering) {
    ditherPass(cellRgb, W, H, palLab, palRgb, n, allowed, subIdx, deltaE)
  } else if (allowed) {
    matchPass(cellRgb, count, palLab, n, allowed, subIdx, deltaE)
  }

  // 서브셋 인덱스 → 전체 팔레트 인덱스
  const grid = new Uint16Array(count)
  for (let c = 0; c < count; c++) grid[c] = palMap[subIdx[c]]

  const res: ConvertResponse = { id, grid, deltaE, cellRgb, ms: performance.now() - t0 }
  ;(self as unknown as Worker).postMessage(res, [grid.buffer, deltaE.buffer, cellRgb.buffer])
}
