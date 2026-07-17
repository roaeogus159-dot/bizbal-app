// 색상 개수표(재료표): 스와치·이름·코드·개수, 개수순 정렬, 실제사진 토글
import { useMemo } from 'react'
import { useProject, useSettings } from '../state/store'
import { fullPalette } from '../lib/palette'
import { buildLegend } from '../lib/pattern'
import BeadSwatch from './BeadSwatch'

export default function ColorList() {
  const grid = useProject((s) => s.grid)
  const gridVersion = useProject((s) => s.gridVersion)
  const W = useProject((s) => s.W)
  const H = useProject((s) => s.H)
  const customColors = useSettings((s) => s.customColors)
  const photoView = useSettings((s) => s.photoView)
  const setSetting = useSettings((s) => s.set)

  const palette = useMemo(() => fullPalette(customColors), [customColors])
  const legend = useMemo(
    () => (grid ? buildLegend(grid) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grid, gridVersion],
  )

  if (!grid) return null

  const placed = legend.reduce((sum, e) => sum + e.count, 0)

  return (
    <section className="color-list card" data-guide="colors">
      <div className="color-list-head">
        <h3>색상 개수표</h3>
        <span className="muted">
          {placed < W * H
            ? `총 ${(W * H).toLocaleString()}칸 · 채움 ${placed.toLocaleString()}개 · ${legend.length}색`
            : `총 ${(W * H).toLocaleString()}개 · ${legend.length}색`}
        </span>
        <label className="toggle-sm">
          <input
            type="checkbox"
            checked={photoView}
            onChange={(e) => setSetting('photoView', e.target.checked)}
          />
          실제 색상 보기
        </label>
      </div>
      <ul>
        {legend.map((e) => {
          const c = palette[e.paletteIdx]
          if (!c) return null
          return (
            <li key={e.paletteIdx} className="color-row">
              <span className="legend-no">{e.number}</span>
              <BeadSwatch color={c} />
              <span className="color-name">
                {c.name} <span className="muted">{c.code}</span>
              </span>
              <span className="color-count">{e.count.toLocaleString()}개</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
