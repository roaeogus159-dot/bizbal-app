// 색 선택 바텀시트: 에디터에서 교체할 색을 고른다 (카테고리 탭 + 실제사진 토글)
import { useMemo, useState } from 'react'
import { useSettings } from '../state/store'
import type { Category } from '../lib/palette'
import { fullPalette, CATEGORY_LABELS } from '../lib/palette'
import BeadSwatch from './BeadSwatch'

interface Props {
  title?: string
  onPick: (paletteIdx: number) => void
  onClose: () => void
  /** 추천 후보 (전문가 모드): [paletteIdx, ΔE] */
  suggestions?: [number, number][]
}

const CATS: Category[] = ['solid', 'transparent', 'semi', 'aurora', 'custom']

export default function PaletteSheet({ title, onPick, onClose, suggestions }: Props) {
  const customColors = useSettings((s) => s.customColors)
  const disabled = useSettings((s) => s.disabled)
  const photoView = useSettings((s) => s.photoView)
  const setSetting = useSettings((s) => s.set)
  const [cat, setCat] = useState<Category>('solid')

  const palette = useMemo(() => fullPalette(customColors), [customColors])
  const items = useMemo(
    () =>
      palette
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => c.category === cat && !('deleted' in c && c.deleted) && !disabled[c.code]),
    [palette, cat, disabled],
  )

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{title ?? '색 선택'}</strong>
          <label className="toggle-sm">
            <input
              type="checkbox"
              checked={photoView}
              onChange={(e) => setSetting('photoView', e.target.checked)}
            />
            실제 색상
          </label>
          <button className="btn-ghost" onClick={onClose}>닫기</button>
        </div>

        {suggestions && suggestions.length > 0 && (
          <div className="suggest-row">
            <span className="muted">추천 대체색:</span>
            {suggestions.map(([idx, de]) => {
              const c = palette[idx]
              return (
                <button key={idx} className="suggest-chip" onClick={() => onPick(idx)}>
                  <BeadSwatch color={c} size={26} />
                  <span>{c.code}</span>
                  <span className="muted">ΔE {de.toFixed(0)}</span>
                </button>
              )
            })}
          </div>
        )}

        <div className="cat-tabs">
          {CATS.map((c) => (
            <button
              key={c}
              className={`tab ${cat === c ? 'on' : ''}`}
              onClick={() => setCat(c)}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        <div className="palette-grid">
          {items.map(({ c, i }) => (
            <button key={c.code} className="palette-cell" onClick={() => onPick(i)} title={`${c.name} (${c.code})`}>
              <BeadSwatch color={c} size={40} />
              <span className="palette-code">{c.code}</span>
            </button>
          ))}
          {items.length === 0 && <p className="muted pad">이 카테고리에 사용 가능한 색이 없습니다.</p>}
        </div>
      </div>
    </div>
  )
}
