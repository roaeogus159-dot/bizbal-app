// 작업 파일(.bizbal.json) 내보내기/불러오기 — 카톡·메일·USB로 옮겨 다른 컴퓨터에서 열기
// 팔레트 인덱스는 기기마다 커스텀 색 구성이 다를 수 있어, 파일에는 색 코드표를 함께 담고
// 불러올 때 코드 기준으로 재매핑한다 (없는 커스텀 색은 자동 추가).
import type { BeadColor, CustomColor } from './palette'
import { BASE_PALETTE, EMPTY, fullPalette } from './palette'
import { dateStamp } from './export'

export interface ProjectFileV1 {
  app: 'bizbal'
  version: 1
  name: string
  savedAt: number
  W: number
  H: number
  dataUrl: string
  gridB64: string
  codes: string[] // 저장 시점 팔레트 인덱스 → 색 코드
  customDefs: CustomColor[] // 저장 시점 커스텀 색 정의 (코드 매칭용)
}

export function gridToB64(grid: Uint16Array): string {
  const bytes = new Uint8Array(grid.buffer.slice(0))
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

export function b64ToGrid(b64: string): Uint16Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Uint16Array(bytes.buffer)
}

export function buildProjectFile(
  name: string,
  W: number,
  H: number,
  dataUrl: string,
  grid: Uint16Array,
  customs: CustomColor[],
): string {
  const file: ProjectFileV1 = {
    app: 'bizbal',
    version: 1,
    name,
    savedAt: Date.now(),
    W,
    H,
    dataUrl,
    gridB64: gridToB64(grid),
    codes: fullPalette(customs).map((c) => c.code),
    customDefs: customs,
  }
  return JSON.stringify(file)
}

export interface ImportedProject {
  name: string
  W: number
  H: number
  dataUrl: string
  grid: Uint16Array
  /** 이 기기에 없어서 새로 추가해야 하는 커스텀 색 (재부여된 코드 포함) */
  newCustoms: CustomColor[]
}

function sameCustom(a: BeadColor, b: BeadColor): boolean {
  return a.name === b.name && a.hex.toLowerCase() === b.hex.toLowerCase() && a.finish === b.finish
}

export function parseProjectFile(json: string, existingCustoms: CustomColor[]): ImportedProject {
  const f = JSON.parse(json) as ProjectFileV1
  if (f?.app !== 'bizbal' || f.version !== 1 || !f.gridB64 || !f.W || !f.H || !f.dataUrl) {
    throw new Error('비즈발 작업 파일이 아니에요')
  }
  const grid = b64ToGrid(f.gridB64)
  if (grid.length !== f.W * f.H) throw new Error('파일이 손상된 것 같아요 (크기 불일치)')

  // 파일 인덱스 → 이 기기 인덱스 재매핑
  const newCustoms: CustomColor[] = []
  const mapping = new Map<number, number>()
  const resolve = (idx: number): number => {
    const hit = mapping.get(idx)
    if (hit !== undefined) return hit
    let target: number
    if (idx < BASE_PALETTE.length) {
      target = idx // 은센 기본 85색은 순서 고정
    } else {
      const code = f.codes[idx]
      const def = f.customDefs.find((d) => d.code === code) ?? f.customDefs[idx - BASE_PALETTE.length]
      if (!def) throw new Error('파일의 커스텀 색 정보를 찾을 수 없어요')
      let li = existingCustoms.findIndex((c) => sameCustom(c, def))
      if (li < 0) {
        li = existingCustoms.findIndex((c) => c.code === def.code && sameCustom(c, def))
      }
      if (li >= 0) {
        target = BASE_PALETTE.length + li
      } else {
        // 새 커스텀으로 추가 (코드 충돌 방지 위해 재부여)
        const n = existingCustoms.length + newCustoms.length + 1
        newCustoms.push({ ...def, code: `C${n}`, deleted: false })
        target = BASE_PALETTE.length + existingCustoms.length + newCustoms.length - 1
      }
    }
    mapping.set(idx, target)
    return target
  }
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === EMPTY) continue
    grid[i] = resolve(grid[i])
  }
  return { name: f.name || '가져온 작업', W: f.W, H: f.H, dataUrl: f.dataUrl, grid, newCustoms }
}

/** 작업 파일 다운로드 */
export function downloadProjectFile(json: string, name: string): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `비즈발_${name.replace(/[\\/:*?"<>|]/g, '_')}_${dateStamp()}.bizbal.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
