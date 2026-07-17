// ② 세부 수정: 점/칠하기/같은색 선택, 다중선택, 색교체, undo/redo, 초기화, 돋보기, 전문가 강조
import { useMemo, useState } from 'react'
import { useProject, useSettings } from '../state/store'
import type { Tool } from '../state/store'
import { fullPalette, enabledIndices } from '../lib/palette'
import { rgbToLab, deltaE2000 } from '../lib/color'
import { buildLegend } from '../lib/pattern'
import PreviewCanvas from '../components/PreviewCanvas'
import PaletteSheet from '../components/PaletteSheet'
import BeadSwatch from '../components/BeadSwatch'
import OverlayControl from '../components/OverlayControl'

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: 'pan', label: '이동', icon: '✋' },
  { id: 'point', label: '점 선택', icon: '👆' },
  { id: 'brush', label: '칠하기', icon: '🖌️' },
  { id: 'magic', label: '같은 색', icon: '🪄' },
  { id: 'eyedrop', label: '스포이드', icon: '💧' },
]

export default function Editor() {
  const p = useProject()
  const s = useSettings()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [currentColor, setCurrentColor] = useState<number | null>(null)
  const [toast, setToast] = useState('')

  const palette = useMemo(() => fullPalette(s.customColors), [s.customColors])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  // 현재 도안에 사용 중인 색 (개수 많은 순) — 하단 빠른 색상 바
  const usedColors = useMemo(
    () => (p.grid ? buildLegend(p.grid).map((e) => e.paletteIdx) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.grid, p.gridVersion],
  )

  const expertCount = useMemo(() => {
    if (s.paintMode !== 'expert' || !p.deltaE) return 0
    let n = 0
    for (let i = 0; i < p.deltaE.length; i++) if (p.deltaE[i] > s.expertThreshold) n++
    return n
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.deltaE, s.expertThreshold, s.paintMode, p.gridVersion])

  // 전문가 모드: 선택한 1칸의 대체 색 후보 (원본 대표색과 가까운 순)
  const suggestions = useMemo<[number, number][] | undefined>(() => {
    if (p.selection.size !== 1 || !p.cellRgb) return undefined
    const cell = [...p.selection][0]
    const r = p.cellRgb[cell * 3], g = p.cellRgb[cell * 3 + 1], b = p.cellRgb[cell * 3 + 2]
    const lab: number[] = [0, 0, 0]
    rgbToLab(r, g, b, lab)
    const idxs = enabledIndices(s.customColors, s.disabled)
    const scored: [number, number][] = idxs.map((i) => {
      const pl: number[] = [0, 0, 0]
      const [pr, pg, pb] = [
        parseInt(palette[i].hex.slice(1, 3), 16),
        parseInt(palette[i].hex.slice(3, 5), 16),
        parseInt(palette[i].hex.slice(5, 7), 16),
      ]
      rgbToLab(pr, pg, pb, pl)
      return [i, deltaE2000(lab[0], lab[1], lab[2], pl[0], pl[1], pl[2])]
    })
    return scored.sort((a, b2) => a[1] - b2[1]).slice(0, 5)
  }, [p.selection, p.cellRgb, palette, s.customColors, s.disabled])

  if (!p.grid) return <p className="pad">먼저 사진을 변환해 주세요.</p>
  const grid = p.grid

  const onCellTap = (idx: number) => {
    if (p.tool === 'eyedrop') {
      setCurrentColor(grid[idx])
      return
    }
    if (p.tool === 'magic') {
      const target = grid[idx]
      const sel = new Set(p.selection)
      for (let i = 0; i < grid.length; i++) if (grid[i] === target) sel.add(i)
      p.setSelection(sel)
      return
    }
    // 점 선택: 탭 토글 (다중선택)
    const sel = new Set(p.selection)
    if (sel.has(idx)) sel.delete(idx)
    else sel.add(idx)
    p.setSelection(sel)
  }

  // 칠하기: 드래그 중 즉시 반영, 손을 떼면 하나의 행동으로 확정 (되돌리기 한 번에 전체 취소)
  const onBrushCells = (cells: number[]) => {
    if (currentColor === null) {
      showToast('아래 색상 바에서 칠할 색을 먼저 선택해 주세요')
      return
    }
    p.strokePaint(cells, currentColor)
  }

  const onBrushEnd = () => {
    p.strokeCommit()
  }

  const applyColor = (colorIdx: number) => {
    setCurrentColor(colorIdx) // 고른 색은 칠하기용 현재 색으로도 지정
    if (p.selection.size === 0) return
    p.applyColor([...p.selection], colorIdx)
    setSheetOpen(false)
    p.setSelection(new Set())
  }

  // 하단 색상 바 탭: 선택 칸이 있으면 즉시 교체, 없으면 현재 색 지정
  const onStripTap = (colorIdx: number) => {
    if (p.selection.size > 0) {
      applyColor(colorIdx)
      showToast(`${palette[colorIdx]?.name}(으)로 교체했어요`)
    } else {
      setCurrentColor(colorIdx)
      if (p.tool !== 'brush') p.setTool('brush')
    }
  }

  const saveNow = () => {
    if (p.saveNow()) {
      showToast('중간 저장 완료! 홈 → [최근 작업 이어하기]로 언제든 복구돼요')
    } else {
      showToast('도안이 너무 커서 저장할 수 없어요 (20만 칸 이하만 지원)')
    }
  }

  const selectAll = () => {
    const sel = new Set<number>()
    for (let i = 0; i < grid.length; i++) sel.add(i)
    p.setSelection(sel)
  }

  return (
    <div className="split">
      <div className="preview-area">
        <PreviewCanvas editable onCellTap={onCellTap} onBrushCells={onBrushCells} onBrushEnd={onBrushEnd} />
        {s.paintMode === 'expert' && (
          <div className="expert-badge">변경 권장 {expertCount.toLocaleString()}칸</div>
        )}
        <OverlayControl />
      </div>

      <div className="controls">
        <div className="card">
          <div className="tool-row" data-guide="tools">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                className={`tool-btn ${p.tool === t.id ? 'on' : ''}`}
                onClick={() => p.setTool(t.id)}
              >
                <span>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
          <p className="muted hint">
            {p.tool === 'pan' && '한 손가락으로 이동, 두 손가락으로 확대/축소합니다.'}
            {p.tool === 'point' && '탭으로 칸 선택/해제 (여러 칸 가능). 길게 누르면 돋보기가 떠요.'}
            {p.tool === 'brush' && '드래그하면 현재 색으로 바로 칠해져요. 손을 떼면 확정되고, 되돌리기 한 번으로 전체 취소됩니다. (색은 아래 색상 바에서 선택)'}
            {p.tool === 'magic' && '탭한 칸과 같은 색 전체가 선택됩니다.'}
            {p.tool === 'eyedrop' && '탭한 칸의 색을 현재 색으로 가져옵니다.'}
          </p>

          <div className="edit-actions" data-guide="edit-actions">
            <button className="btn-sm btn-secondary" onClick={selectAll}>전체 선택</button>
            <button className="btn-sm btn-secondary" onClick={() => p.setSelection(new Set())}>
              전체 해제
            </button>
            <button className="btn-sm btn-secondary" disabled={p.undoStack.length === 0} onClick={p.undo}>
              ↩️ 되돌리기
            </button>
            <button className="btn-sm btn-secondary" disabled={p.redoStack.length === 0} onClick={p.redo}>
              ↪️ 다시실행
            </button>
            <button
              className="btn-sm btn-warn"
              onClick={() => {
                if (window.confirm('수동 수정을 모두 취소하고 자동 변환 상태로 되돌릴까요? (되돌리기로 취소할 수 있어요)')) p.resetEdits()
              }}
            >
              ⟲ 초기화
            </button>
            <button className="btn-sm btn-secondary" onClick={saveNow}>
              💾 중간 저장
            </button>
          </div>
        </div>

        <div className="card">
          <div className="replace-row" data-guide="replace">
            <span>
              선택 <strong>{p.selection.size.toLocaleString()}</strong>칸
            </span>
            <button
              className="btn-primary btn-sm"
              disabled={p.selection.size === 0}
              onClick={() => setSheetOpen(true)}
            >
              🎨 색 교체
            </button>
          </div>

          {/* 사용 중인 색상 바: 탭 → 선택 칸 교체 / 선택 없으면 칠하기 색 지정 */}
          {usedColors.length > 0 && (
            <div className="used-strip" data-guide="used-colors">
              {usedColors.map((idx) => {
                const c = palette[idx]
                if (!c) return null
                return (
                  <button
                    key={idx}
                    className={`used-swatch ${currentColor === idx ? 'on' : ''}`}
                    onClick={() => onStripTap(idx)}
                    title={`${c.name} (${c.code})`}
                  >
                    <BeadSwatch color={c} size={30} />
                  </button>
                )
              })}
            </div>
          )}

          {s.paintMode === 'expert' && (
            <label className="field-col">
              강조 임계값 ΔE: <strong>{s.expertThreshold}</strong>
              <input
                type="range" min={5} max={40} value={s.expertThreshold}
                onChange={(e) => s.set('expertThreshold', Number(e.target.value))}
              />
            </label>
          )}
        </div>
      </div>

      <div className="bottom-bar" data-guide="actions">
        <button className="btn-secondary" onClick={() => p.go('convert')}>← 변환 설정</button>
        <button className="btn-primary" onClick={() => p.go('result')}>💾 도안 저장</button>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {sheetOpen && (
        <PaletteSheet
          title={`선택한 ${p.selection.size.toLocaleString()}칸의 색 교체`}
          suggestions={suggestions}
          onPick={applyColor}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  )
}
