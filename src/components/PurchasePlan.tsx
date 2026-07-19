// 구매 계획 카드: 브랜드별(은센 A·비즈팔레트 B) 필요 묶음·예상 비용 + 엑셀(CSV) 추출
import { useMemo } from 'react'
import { useProject, useSettings } from '../state/store'
import type { Category } from '../lib/palette'
import { fullPalette, CATEGORY_LABELS, BRANDS } from '../lib/palette'
import { buildLegend } from '../lib/pattern'
import { buildPurchase, purchaseCsv, saveCsv } from '../lib/purchase'
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
  const diameterMm = useSettings((s) => s.diameterMm)

  const palette = useMemo(() => fullPalette(customColors), [customColors])
  const plan = useMemo(() => {
    if (!grid) return null
    return buildPurchase(buildLegend(grid), palette, { packSize, packPrices, diameterMm })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, gridVersion, palette, packSize, packPrices, diameterMm])

  if (!grid || !plan) return null

  // 은센(A) 그룹에서 쓰인 카테고리만 단가 입력 노출
  const aGroup = plan.groups.find((g) => g.key === 'A')
  const usedCatsA = [...new Set((aGroup?.rows ?? []).map((r) => r.category))] as Category[]

  const exportCsv = () => {
    void saveCsv(purchaseCsv(plan, W, H), `비즈발_구매목록_${dateStamp()}.csv`)
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
        총 예상 비용 <strong className="purchase-sum">{won(plan.grandTotal)}</strong>
        {plan.groups.length > 1 && <span className="muted"> ({plan.groups.length}개 매장)</span>}
      </p>
      <p className="muted hint">
        <strong>A</strong> = {BRANDS.A.name}({BRANDS.A.material}·{BRANDS.A.packUnit}) ·{' '}
        <strong>B</strong> = {BRANDS.B.name}({BRANDS.B.material}·{BRANDS.B.packUnit}). 매장이 다르면 배송비가 따로 들어요.
      </p>

      {/* 브랜드(매장)별 그룹 */}
      {plan.groups.map((g) => (
        <div key={g.key} className="purchase-group">
          <div className="purchase-group-head">
            <strong>{g.storeName}</strong>
            {g.url && (
              <a className="purchase-link" href={g.url} target="_blank" rel="noreferrer">구매하러 가기 ↗</a>
            )}
          </div>
          <p className="purchase-total">
            {g.totalPacks.toLocaleString()}
            {g.key === 'B' ? '줄' : '묶음'} · 비즈 <strong>{won(g.subtotal)}</strong>
            {g.shipping > 0 ? ` + 배송 ${won(g.shipping)} = ` : ' (무료배송) = '}
            <strong className="purchase-sum">{won(g.total)}</strong>
          </p>
          <details>
            <summary>색상별 내역 ({g.rows.length}색)</summary>
            <ul>
              {g.rows.map((r) => {
                const c = palette.find((p) => p.code === r.code)
                return (
                  <li key={r.code} className="color-row">
                    <span className="legend-no">{r.number}</span>
                    {c && <BeadSwatch color={c} size={28} />}
                    <span className="color-name">
                      {r.name} <span className="muted">{r.code}</span>
                    </span>
                    <span className="purchase-cell muted">{r.count.toLocaleString()}개</span>
                    <span className="purchase-cell"><strong>{r.packLabel}</strong></span>
                    <span className="purchase-cell purchase-cost">{won(r.cost)}</span>
                  </li>
                )
              })}
            </ul>
          </details>
        </div>
      ))}

      {aGroup && (
        <details>
          <summary>은센(A) 묶음 단위·단가 설정</summary>
          <label className="field-row">
            묶음 단위
            <input
              type="number" inputMode="numeric" min={1}
              value={packSize}
              onChange={(e) => setSetting('packSize', Math.max(1, Number(e.target.value) || 100))}
            />
            개입
          </label>
          {usedCatsA.map((cat) => (
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
            비즈팔레트(B)는 1줄 2,090원 고정입니다. 실제 판매가가 바뀌면 알려주세요.
          </p>
        </details>
      )}
    </section>
  )
}
