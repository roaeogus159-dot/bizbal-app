// 도안 파생 데이터: 색상 개수표(범례 순번), 세로 줄(스트랜드) 런렝스·길이
import type { BeadColor, Finish } from './palette'
import { EMPTY } from './palette'

/** 종류·지름별 실측 지름(mm) — 줄 길이 계산용.
 *  8mm: 불투명·반투명 7.6 / 투명·오로라 8.0
 *  6mm: 불투명·반투명 5.6 / 투명·오로라 5.8
 *  4mm 등: 표기값 그대로 */
export function actualBeadMm(diameterMm: number, finish: Finish): number {
  const glassy = finish === 'transparent' || finish === 'aurora'
  if (diameterMm === 8) return glassy ? 8.0 : 7.6
  if (diameterMm === 6) return glassy ? 5.8 : 5.6
  return diameterMm
}

export interface LegendEntry {
  paletteIdx: number
  number: number // 프로젝트 순번 1,2,3… (개수 많은 순)
  count: number
}

/** 색상별 개수 집계 → 개수 내림차순으로 순번 부여 (빈 칸 제외) */
export function buildLegend(grid: Uint16Array): LegendEntry[] {
  const counts = new Map<number, number>()
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === EMPTY) continue
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

/** 줄별 예상 길이: 종류·지름별 실측 지름 합 (커스텀 색은 입력한 실제 지름, 빈 칸은 0) */
export function strandLengths(
  grid: Uint16Array, W: number, H: number, palette: BeadColor[], diameterMm: number,
): StrandLengths {
  const lenOf = (idx: number): number => {
    if (idx === EMPTY) return 0
    const c = palette[idx]
    if (!c) return actualBeadMm(diameterMm, 'opaque')
    if (c.custom) return c.sizeMm // 커스텀 색: 사용자가 입력한 실제 지름
    return actualBeadMm(diameterMm, c.finish)
  }
  const mm: number[] = []
  for (let x = 0; x < W; x++) {
    let sum = 0
    for (let y = 0; y < H; y++) sum += lenOf(grid[y * W + x])
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
