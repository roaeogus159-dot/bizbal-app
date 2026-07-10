// 도안 파생 데이터: 색상 개수표(범례 순번), 세로 줄(스트랜드) 런렝스·길이
import type { BeadColor } from './palette'

export interface LegendEntry {
  paletteIdx: number
  number: number // 프로젝트 순번 1,2,3… (개수 많은 순)
  count: number
}

/** 색상별 개수 집계 → 개수 내림차순으로 순번 부여 */
export function buildLegend(grid: Uint16Array): LegendEntry[] {
  const counts = new Map<number, number>()
  for (let i = 0; i < grid.length; i++) {
    counts.set(grid[i], (counts.get(grid[i]) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([paletteIdx, count], i) => ({ paletteIdx, count, number: i + 1 }))
}

/** 팔레트 인덱스 → 순번 빠른 조회 */
export function legendNumberMap(legend: LegendEntry[]): Map<number, number> {
  return new Map(legend.map((e) => [e.paletteIdx, e.number]))
}

export interface StrandRun {
  paletteIdx: number
  len: number
}

/** 열(줄) 단위 런렝스: strand[x] = 위→아래 (색×연속개수) 목록 */
export function strandRuns(grid: Uint16Array, W: number, H: number): StrandRun[][] {
  const out: StrandRun[][] = []
  for (let x = 0; x < W; x++) {
    const runs: StrandRun[] = []
    let cur = -1
    let len = 0
    for (let y = 0; y < H; y++) {
      const v = grid[y * W + x]
      if (v === cur) len++
      else {
        if (len > 0) runs.push({ paletteIdx: cur, len })
        cur = v
        len = 1
      }
    }
    if (len > 0) runs.push({ paletteIdx: cur, len })
    out.push(runs)
  }
  return out
}

export interface StrandLengths {
  mm: number[] // 줄별 예상 길이(mm) = Σ 실제 지름(sizeMm)
  minMm: number
  maxMm: number
  devMm: number // 최대 편차 (max-min)
}

/** 줄별 예상 길이: 볼 종류별 실제 지름(sizeMm) 합 */
export function strandLengths(
  grid: Uint16Array, W: number, H: number, palette: BeadColor[],
): StrandLengths {
  const size = palette.map((c) => c.sizeMm)
  const mm: number[] = []
  for (let x = 0; x < W; x++) {
    let sum = 0
    for (let y = 0; y < H; y++) sum += size[grid[y * W + x]] ?? 8
    mm.push(sum)
  }
  const minMm = Math.min(...mm)
  const maxMm = Math.max(...mm)
  return { mm, minMm, maxMm, devMm: maxMm - minMm }
}

/** 완성 예상 크기 (명목 지름 기준) */
export function finishedSizeCm(W: number, H: number, diameterMm: number) {
  return { wCm: (W * diameterMm) / 10, hCm: (H * diameterMm) / 10 }
}
