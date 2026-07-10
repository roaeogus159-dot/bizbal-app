// 구매 계획: 색상별 필요 개수 → 묶음(100개입) 수·예상 비용 계산 + 엑셀(CSV) 추출
// 기준: 은센 아크릴 비즈 8mm 100개입 1,000원 (2026-07 상품 페이지), 배송비 3,000원(3만원 이상 무료)
import type { BeadColor, Category } from './palette'
import { CATEGORY_LABELS } from './palette'
import type { LegendEntry } from './pattern'
import { dateStamp, shouldUseShare } from './export'

export const SHIPPING_FEE = 3000
export const FREE_SHIP_THRESHOLD = 30000

export interface PurchaseRow {
  number: number
  code: string
  name: string
  category: Category
  count: number // 필요 개수
  packs: number // 구매 묶음 수
  cost: number // 예상 비용(원)
}

export interface PurchasePlan {
  rows: PurchaseRow[]
  totalCount: number
  totalPacks: number
  subtotal: number // 비즈 비용 합계
  shipping: number // 예상 배송비 (3만원 이상 0)
  total: number
}

export function buildPurchase(
  legend: LegendEntry[],
  palette: BeadColor[],
  packSize: number,
  packPrices: Record<Category, number>,
): PurchasePlan {
  const rows: PurchaseRow[] = []
  for (const e of legend) {
    const c = palette[e.paletteIdx]
    if (!c) continue
    const packs = Math.ceil(e.count / Math.max(1, packSize))
    const cost = packs * (packPrices[c.category] ?? 1000)
    rows.push({
      number: e.number,
      code: c.code,
      name: c.name,
      category: c.category,
      count: e.count,
      packs,
      cost,
    })
  }
  const totalCount = rows.reduce((s, r) => s + r.count, 0)
  const totalPacks = rows.reduce((s, r) => s + r.packs, 0)
  const subtotal = rows.reduce((s, r) => s + r.cost, 0)
  const shipping = subtotal >= FREE_SHIP_THRESHOLD || subtotal === 0 ? 0 : SHIPPING_FEE
  return { rows, totalCount, totalPacks, subtotal, shipping, total: subtotal + shipping }
}

/** 엑셀에서 바로 열리는 CSV (UTF-8 BOM + CRLF) */
export function purchaseCsv(
  plan: PurchasePlan, W: number, H: number, packSize: number,
): string {
  const esc = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines: string[] = []
  lines.push(`비즈발 구매 목록 (${W}×${H}칸 · 총 ${W * H}개 · ${dateStamp()})`)
  lines.push(`묶음 단위,${packSize}개입`)
  lines.push('')
  lines.push('순번,색이름,코드,카테고리,필요 개수,구매 묶음 수,예상 비용(원)')
  for (const r of plan.rows) {
    lines.push(
      [r.number, esc(r.name), r.code, CATEGORY_LABELS[r.category], r.count, r.packs, r.cost].join(','),
    )
  }
  lines.push('')
  lines.push(`합계,,,,${plan.totalCount},${plan.totalPacks},${plan.subtotal}`)
  lines.push(`예상 배송비(3만원 이상 무료),,,,,,${plan.shipping}`)
  lines.push(`총 예상 비용,,,,,,${plan.total}`)
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
