import paletteJson from '../data/euncen_palette.json'
import { hexToRgb, rgbToLab } from './color'

export type Category = 'solid' | 'transparent' | 'semi' | 'aurora' | 'custom'
export type Finish = 'opaque' | 'transparent' | 'semi' | 'aurora'

export interface BeadColor {
  code: string
  name: string
  hex: string
  category: Category
  finish: Finish
  sizeMm: number
  photo?: string // 실제 비즈 사진 (에셋 경로 또는 dataURL)
  custom?: boolean
}

/** 사용자 추가 색 (localStorage 저장용) */
export interface CustomColor extends BeadColor {
  custom: true
  deleted?: boolean // 삭제해도 자리(팔레트 인덱스)는 유지해 grid 참조가 깨지지 않게 함
}

export const CATEGORY_LABELS: Record<Category, string> = {
  solid: '단색',
  transparent: '투명',
  semi: '반투명',
  aurora: '오로라',
  custom: '직접추가',
}

interface JsonColor {
  code: string
  name: string
  hex: string
  category: string
  enabled: boolean
  finish: string
  sizeMm: number
}

/** 은센 기본 85색 (팔레트 인덱스 0..84 고정) */
export const BASE_PALETTE: BeadColor[] = (
  paletteJson.categories as { id: string; colors: JsonColor[] }[]
).flatMap((cat) =>
  cat.colors.map((c) => ({
    code: c.code,
    name: c.name,
    hex: c.hex,
    category: c.category as Category,
    finish: c.finish as Finish,
    sizeMm: c.sizeMm,
    photo: `/beads/${c.code}.jpg`,
  })),
)

/** 기본색 + 커스텀색 전체 (grid는 이 배열의 인덱스를 참조) */
export function fullPalette(customs: CustomColor[]): BeadColor[] {
  return [...BASE_PALETTE, ...customs]
}

/** 변환에 사용할 색만: [전체 팔레트 인덱스] 목록 */
export function enabledIndices(
  customs: CustomColor[],
  disabled: Record<string, boolean>,
): number[] {
  const all = fullPalette(customs)
  const out: number[] = []
  for (let i = 0; i < all.length; i++) {
    const c = all[i]
    if ((c as CustomColor).deleted) continue
    if (disabled[c.code]) continue
    out.push(i)
  }
  return out
}

/** 팔레트 각 색의 Lab/RGB 사전계산 (워커 전달용) */
export function paletteArrays(palette: BeadColor[], indices: number[]) {
  const n = indices.length
  const lab = new Float32Array(n * 3)
  const rgb = new Uint8Array(n * 3)
  const map = new Uint16Array(n) // 서브셋 → 전체 인덱스
  for (let i = 0; i < n; i++) {
    const c = palette[indices[i]]
    const [r, g, b] = hexToRgb(c.hex)
    rgb[i * 3] = r
    rgb[i * 3 + 1] = g
    rgb[i * 3 + 2] = b
    rgbToLab(r, g, b, lab, i * 3)
    map[i] = indices[i]
  }
  return { lab, rgb, map, n }
}
