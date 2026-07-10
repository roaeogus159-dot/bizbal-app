// 구매 계획 카드: 비즈 종류별 필요 묶음·예상 비용 + 엑셀(CSV) 추출
import { useMemo } from 'react'
import { useProject, useSettings } from '../state/store'
import type { Category } from '../lib/palette'
import { fullPalette, CATEGORY_LABELS } from '../lib/palette'
import { buildLegend } from '../lib/pattern'
import { buildPurchase, purchaseCsv, saveCsv, FREE_SHIP_THRESHOLD } from '../lib/purchase'
import { dateStamp } from '../lib/export'
import BeadSwatch from './BeadSwatch'

const won = (n: number) => n.toLocaleString() + '원'

export default function PurchasePlan() {
  const grid = useProject((s) => s.grid)
  const gridVersion = useProject((s) => s.gridVersion)
  const W = useProject((s) => s.W)
  const H = useProject((s) => s.H)
  const customColors = useSettings((s) => s.customColors)
  const packSize = useSettings((s) => s.packSize)
  const packPrices = useSettings((s) => s.packPrices)
  const setPackPrice = useSettings((s) => s.setPackPrice)
  const setSetting = useSettings((s) => s.set)

  const palette = useMemo(() => fullPalette(customColors), [customColors])
  const plan = useMemo(() => {
    if (!grid) return null
    return buildPurchase(buildLegend(grid), palette, packSize, packPrices)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, gridVersion, palette, packSize, packPrices])

  if (!grid || !plan) return null

  // 사용 중인 카테고리만 단가 입력 노출
  const usedCats = [...new Set(plan.rows.map((r) => r.category))] as Category[]

  const exportCsv = () => {
    void saveCsv(purchaseCsv(plan, W, H, packSize), `비즈발_구매목록_${dateStamp()}.csv`)
  }

  return (
    <section className="card purchase" data-guide="purchase">
      <div className="purchase-head">
        <h3>🛒 구매 계획</h3>
        <button className="btn-sm btn-primary" onClick={exportCsv}>
          📥 엑셀(CSV) 추출
        </button>
      </div>
      <p className="purchase-total">
        총 <strong>{plan.totalPacks.toLocaleString()}묶음</strong> · 비즈{' '}
        <strong>{won(plan.subtotal)}</strong>
        {plan.shipping > 0
          ? ` + 배송비 ${won(plan.shipping)} = `
          : ' (무료배송) = '}
        <strong className="purchase-sum">{won(plan.total)}</strong>
      </p>
      <p className="muted hint">
        은센 기준 {packSize}개입 · {FREE_SHIP_THRESHOLD.toLocaleString()}원 이상 무료배송.
        남는 비즈는 묶음 단위 구매라 생기는 여유분입니다.
      </p>

      <details>
        <summary>묶음 단위·단가 설정</summary>
        <label className="field-row">
          묶음 단위
          <input
            type="number" inputMode="numeric" min={1}
            value={packSize}
            onChange={(e) => setSetting('packSize', Math.max(1, Number(e.target.value) || 100))}
          />
          개입
        </label>
        {usedCats.map((cat) => (
          <label key={cat} className="field-row">
            {CATEGORY_LABELS[cat]} 1묶음
            <input
              type="number" inputMode="numeric" min={0} step={100}
              value={packPrices[cat]}
              onChange={(e) => setPackPrice(cat, Number(e.target.value) || 0)}
            />
            원
          </label>
        ))}
        <p className="muted hint">
          투명·반투명·오로라는 별도 상품이라 가격이 다를 수 있어요. 실제 판매가로 수정하면 정확해집니다.
        </p>
      </details>

      <details>
        <summary>색상별 구매 내역 ({plan.rows.length}색)</summary>
        <ul>
          {plan.rows.map((r) => {
            const c = palette.find((p) => p.code === r.code)
            return (
              <li key={r.code} className="color-row">
                <span className="legend-no">{r.number}</span>
                {c && <BeadSwatch color={c} size={28} />}
                <span className="color-name">
                  {r.name} <span className="muted">{r.code}</span>
                </span>
                <span className="purchase-cell muted">{r.count.toLocaleString()}개</span>
                <span className="purchase-cell">
                  <strong>{r.packs}</strong>묶음
                </span>
                <span className="purchase-cell purchase-cost">{won(r.cost)}</span>
              </li>
            )
          })}
        </ul>
      </details>
    </section>
  )
}
