// 구매 계획: 색상별 필요 개수 → 브랜드별 묶음 수·예상 비용 계산 + 엑셀(CSV) 추출
// - 은센(A): 100개입 1,000원(카테고리별 단가 수정 가능), 배송 3,000원/3만원↑무료
// - 비즈팔레트(B): 1줄 단위(반투명 6mm 120·8mm 90 / 그 외 6mm 65·8mm 45), 2,090원/줄, 배송 2,900원/3만원↑무료
import type { BeadColor, Category, Brand } from './palette'
import { CATEGORY_LABELS, BRANDS } from './palette'
import type { LegendEntry } from './pattern'
import { dateStamp, shouldUseShare } from './export'

export const SHIPPING_FEE = 3000 // 은센 배송비
export const FREE_SHIP_THRESHOLD = 30000

// 비즈팔레트(B) 판매 조건
const B_PRICE_PER_STRAND = 2090
const B_SHIPPING = 2900
const B_FREE = 30000
const B_COUNTS: Record<Category, { 6: number; 8: number }> = {
  semi: { 6: 120, 8: 90 },
  transparent: { 6: 65, 8: 45 },
  aurora: { 6: 65, 8: 45 },
  solid: { 6: 65, 8: 45 },
  custom: { 6: 65, 8: 45 },
}
function bStrandCount(cat: Category, diameterMm: number): number {
  const t = B_COUNTS[cat] ?? B_COUNTS.transparent
  return diameterMm <= 6 ? t[6] : t[8]
}

export type GroupKey = Brand | 'custom'

export interface PurchaseRow {
  number: number
  code: string
  name: string
  category: Category
  count: number // 필요 개수
  packs: number // 구매 묶음/줄 수
  packLabel: string // '2줄' | '3묶음'
  cost: number // 예상 비용(원)
}

export interface BrandGroup {
  key: GroupKey
  storeName: string
  url?: string
  packUnit: string
  rows: PurchaseRow[]
  totalCount: number
  totalPacks: number
  subtotal: number
  shipping: number
  total: number
  freeThreshold: number
}

export interface PurchasePlan {
  groups: BrandGroup[]
  grandTotal: number
  totalCount: number
}

interface Opts {
  packSize: number // 은센 묶음 단위(기본 100)
  packPrices: Record<Category, number> // 은센 카테고리별 단가
  diameterMm: number
}

export function buildPurchase(
  legend: LegendEntry[], palette: BeadColor[], opts: Opts,
): PurchasePlan {
  const { packSize, packPrices, diameterMm } = opts
  const buckets = new Map<GroupKey, PurchaseRow[]>()

  for (const e of legend) {
    const c = palette[e.paletteIdx]
    if (!c) continue
    const key: GroupKey = c.brand ?? 'custom'
    let packs: number, cost: number, packLabel: string
    if (key === 'B') {
      const per = bStrandCount(c.category, diameterMm)
      packs = Math.ceil(e.count / per)
      cost = packs * B_PRICE_PER_STRAND
      packLabel = `${packs}줄`
    } else {
      packs = Math.ceil(e.count / Math.max(1, packSize))
      cost = packs * (packPrices[c.category] ?? 1000)
      packLabel = `${packs}묶음`
    }
    const row: PurchaseRow = {
      number: e.number, code: c.code, name: c.name, category: c.category,
      count: e.count, packs, packLabel, cost,
    }
    const arr = buckets.get(key)
    if (arr) arr.push(row)
    else buckets.set(key, [row])
  }

  const order: GroupKey[] = ['A', 'B', 'custom']
  const groups: BrandGroup[] = []
  for (const key of order) {
    const rows = buckets.get(key)
    if (!rows || rows.length === 0) continue
    const subtotal = rows.reduce((s, r) => s + r.cost, 0)
    const totalCount = rows.reduce((s, r) => s + r.count, 0)
    const totalPacks = rows.reduce((s, r) => s + r.packs, 0)
    const freeThreshold = key === 'B' ? B_FREE : FREE_SHIP_THRESHOLD
    const shipFee = key === 'B' ? B_SHIPPING : SHIPPING_FEE
    const shipping = subtotal >= freeThreshold || subtotal === 0 ? 0 : shipFee
    groups.push({
      key,
      storeName: key === 'custom' ? '직접추가 / 기타' : BRANDS[key].store,
      url: key === 'custom' ? undefined : BRANDS[key].url,
      packUnit: key === 'B' ? '1줄' : key === 'A' ? '100개입' : '묶음',
      rows, totalCount, totalPacks, subtotal, shipping,
      total: subtotal + shipping, freeThreshold,
    })
  }

  return {
    groups,
    grandTotal: groups.reduce((s, g) => s + g.total, 0),
    totalCount: groups.reduce((s, g) => s + g.totalCount, 0),
  }
}

/** 엑셀에서 바로 열리는 CSV (UTF-8 BOM + CRLF) — 브랜드별 구분 */
export function purchaseCsv(plan: PurchasePlan, W: number, H: number): string {
  const esc = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines: string[] = []
  lines.push(`비즈발 구매 목록 (${W}×${H}칸 · 총 ${W * H}개 · ${dateStamp()})`)
  lines.push('')
  for (const g of plan.groups) {
    lines.push(`[${g.storeName}]${g.url ? ' ' + g.url : ''}`)
    lines.push('순번,색이름,코드,카테고리,필요 개수,구매 수량,예상 비용(원)')
    for (const r of g.rows) {
      lines.push(
        [r.number, esc(r.name), r.code, CATEGORY_LABELS[r.category], r.count, r.packLabel, r.cost].join(','),
      )
    }
    lines.push(`소계,,,,${g.totalCount},${g.totalPacks},${g.subtotal}`)
    lines.push(`배송비(${g.freeThreshold.toLocaleString()}원↑무료),,,,,,${g.shipping}`)
    lines.push(`${g.storeName} 합계,,,,,,${g.total}`)
    lines.push('')
  }
  lines.push(`총 예상 비용,,,,,,${plan.grandTotal}`)
  return '﻿' + lines.join('\r\n') // BOM: 엑셀 한글 인식용
}

/** CSV 저장: 모바일은 공유시트 우선, 미지원 시 다운로드 */
export async function saveCsv(text: string, name: string): Promise<void> {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const file = new File([blob], name, { type: 'text/csv' })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (shouldUseShare() && nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
