import paletteJson from '../data/euncen_palette.json'
import beadpalJson from '../data/beadpalette_palette.json'
import { hexToRgb, rgbToLab } from './color'

export type Category = 'solid' | 'transparent' | 'semi' | 'aurora' | 'custom'
export type Finish = 'opaque' | 'transparent' | 'semi' | 'aurora'

/** 판매 브랜드: A=은센(아크릴), B=비즈팔레트(유리) */
export type Brand = 'A' | 'B'

export interface BrandInfo {
  id: Brand
  name: string
  store: string
  url: string
  sizesMm: number[]
  packUnit: string
  material: string
}

export const BRANDS: Record<Brand, BrandInfo> = {
  A: {
    id: 'A', name: '은센', store: '은센(eun_cen)',
    url: 'https://smartstore.naver.com/eun_cen',
    sizesMm: [4, 6, 8], packUnit: '100개입', material: '아크릴',
  },
  B: {
    id: 'B', name: '비즈팔레트', store: 'Bead Palette',
    url: 'https://smartstore.naver.com/beads_palette',
    sizesMm: [6, 8], packUnit: '1줄', material: '유리',
  },
}

/** 빈 칸(비즈 미배치) 센티널 — 직접 채우기 모드·지우개용 */
export const EMPTY = 0xffff

export interface BeadColor {
  code: string
  name: string
  hex: string
  category: Category
  finish: Finish
  sizeMm: number
  brand?: Brand // 은센 A / 비즈팔레트 B (커스텀은 없음)
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
  enabled?: boolean
  finish: string
  sizeMm: number
}

/** 은센(A) 기본 85색 — 이름 앞에 "A " 브랜드 표기. 팔레트 인덱스 0..84 고정 */
export const BASE_PALETTE: BeadColor[] = (
  paletteJson.categories as { id: string; colors: JsonColor[] }[]
).flatMap((cat) =>
  cat.colors.map((c) => ({
    code: c.code,
    name: `A ${c.name}`,
    hex: c.hex,
    category: c.category as Category,
    finish: c.finish as Finish,
    sizeMm: c.sizeMm,
    brand: 'A' as Brand,
    photo: `${import.meta.env.BASE_URL}beads/${c.code}.jpg`, // 서브경로 배포 대응
  })),
)

/** 비즈팔레트(B) 38색 — 이름 앞에 "B " 브랜드 표기. 은센 다음 인덱스 85..122 고정
 *  (커스텀은 이 뒤에 붙어 기존 은센 도안 인덱스가 유지됨) */
export const BEADPAL_PALETTE: BeadColor[] = (
  beadpalJson.categories as { id: string; colors: JsonColor[] }[]
).flatMap((cat) =>
  cat.colors.map((c) => ({
    code: c.code,
    name: `B ${c.name}`,
    hex: c.hex,
    category: c.category as Category,
    finish: c.finish as Finish,
    sizeMm: c.sizeMm,
    brand: 'B' as Brand,
    // 비즈팔레트는 크롭 사진 에셋이 없어 스와치(색)로 표시 (BeadSwatch가 자동 폴백)
  })),
)

/** 기본색(은센+비즈팔레트) + 커스텀색 전체 (grid는 이 배열의 인덱스를 참조)
 *  순서 고정: [은센 0-84][비즈팔레트 85-122][커스텀 123+] */
export function fullPalette(customs: CustomColor[]): BeadColor[] {
  return [...BASE_PALETTE, ...BEADPAL_PALETTE, ...customs]
}

/** 변환에 사용할 색만: [전체 팔레트 인덱스] 목록.
 *  diameterMm=4면 비즈팔레트(B, 6/8mm만 판매)는 제외한다. */
export function enabledIndices(
  customs: CustomColor[],
  disabled: Record<string, boolean>,
  diameterMm?: number,
): number[] {
  const all = fullPalette(customs)
  const out: number[] = []
  for (let i = 0; i < all.length; i++) {
    const c = all[i]
    if ((c as CustomColor).deleted) continue
    if (disabled[c.code]) continue
    if (diameterMm === 4 && c.brand === 'B') continue // 비즈팔레트는 4mm 없음
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
