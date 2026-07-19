// ② 세부 수정: 점/칠하기/같은색 선택, 다중선택, 색교체, undo/redo, 초기화, 돋보기, 전문가 강조
import { useMemo, useState } from 'react'
import { useProject, useSettings } from '../state/store'
import type { Tool } from '../state/store'
import { fullPalette, enabledIndices, EMPTY } from '../lib/palette'
import { rgbToLab, deltaE2000 } from '../lib/color'
import { buildLegend } from '../lib/pattern'
import { floodFillRegion } from '../lib/geom'
import PreviewCanvas from '../components/PreviewCanvas'
import PaletteSheet from '../components/PaletteSheet'
import BeadSwatch from '../components/BeadSwatch'
import OverlayControl from '../components/OverlayControl'

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: 'pan', label: '이동', icon: '✋' },
  { id: 'point', label: '점 선택', icon: '👆' },
  { id: 'brush', label: '칠하기', icon: '🖌️' },
  { id: 'bucket', label: '채우기', icon: '🪣' },
  { id: 'magic', label: '같은 색', icon: '🪄' },
  { id: 'eyedrop', label: '스포이드', icon: '💧' },
  { id: 'rowcol', label: '행/열 이동', icon: '⇄' },
  { id: 'paste', label: '복사/붙이기', icon: '📋' },
]

/** 복사한 패턴 (선택 칸의 bounding box 좌상단 기준 상대좌표) */
interface Clipboard {
  w: number
  h: number
  cells: { dx: number; dy: number; v: number }[]
}

export default function Editor() {
  const p = useProject()
  const s = useSettings()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [currentColor, setCurrentColor] = useState<number | null>(null)
  const [toast, setToast] = useState('')
  const [rowcolTarget, setRowcolTarget] = useState<{ x: number; y: number } | null>(null)
  const [clipboard, setClipboard] = useState<Clipboard | null>(null)

  const palette = useMemo(() => fullPalette(s.customColors), [s.customColors])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  // 하단 색상 바: "내가 고른 색"(최근 순) / "자동 변환 색"(개수 많은 순) 구분
  const stripColors = useMemo(() => {
    const legend = p.grid ? buildLegend(p.grid).map((e) => e.paletteIdx) : []
    const picked = p.recentColors.filter((i) => palette[i])
    const auto = legend.filter((i) => !picked.includes(i))
    return { picked, auto }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.grid, p.gridVersion, p.recentColors, palette])

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
      p.pushRecentColor(grid[idx])
      return
    }
    // 채우기(그림판 페인트통): 탭한 칸과 이어진 같은 색 영역을 현재 색으로
    if (p.tool === 'bucket') {
      if (currentColor === null) {
        showToast('먼저 아래 색상 바에서 채울 색을 골라 주세요')
        return
      }
      if (grid[idx] === currentColor) return
      const cells = floodFillRegion(grid, p.W, p.H, idx)
      p.applyColor(cells, currentColor)
      showToast(
        currentColor === EMPTY
          ? `이어진 ${cells.length.toLocaleString()}칸을 빈칸으로 지웠어요`
          : `이어진 ${cells.length.toLocaleString()}칸을 ${colorName(currentColor)}(으)로 채웠어요`,
      )
      return
    }
    if (p.tool === 'magic') {
      const target = grid[idx]
      const sel = new Set(p.selection)
      for (let i = 0; i < grid.length; i++) if (grid[i] === target) sel.add(i)
      p.setSelection(sel)
      return
    }
    // 행/열 이동: 탭으로 대상 행·열 지정 → 아래 화살표 버튼으로 이동
    if (p.tool === 'rowcol') {
      setRowcolTarget({ x: idx % p.W, y: Math.floor(idx / p.W) })
      return
    }
    // 붙여넣기: 복사해둔 패턴을 탭한 칸 중앙 기준으로 배치
    if (p.tool === 'paste') {
      if (!clipboard) {
        showToast('먼저 칸을 선택하고 [선택 복사]를 눌러 주세요')
        return
      }
      const tx = idx % p.W
      const ty = Math.floor(idx / p.W)
      const ox = tx - Math.floor(clipboard.w / 2)
      const oy = ty - Math.floor(clipboard.h / 2)
      const cells: number[] = []
      const values: number[] = []
      for (const c of clipboard.cells) {
        const x = ox + c.dx
        const y = oy + c.dy
        if (x < 0 || x >= p.W || y < 0 || y >= p.H) continue
        cells.push(y * p.W + x)
        values.push(c.v)
      }
      if (cells.length === 0) {
        showToast('붙일 위치가 도안 밖이에요')
        return
      }
      p.applyCellValues(cells, values)
      showToast(`${cells.length.toLocaleString()}칸 붙여넣기 완료 (되돌리기 가능)`)
      return
    }
    // 점 선택: 탭 토글 (다중선택)
    const sel = new Set(p.selection)
    if (sel.has(idx)) sel.delete(idx)
    else sel.add(idx)
    p.setSelection(sel)
  }

  // 칠하기: 드래그 중 즉시 반영, 경로를 되짚으면 그만큼 취소, 손을 떼면 하나의 행동으로 확정
  const onBrushCells = (cells: number[]) => {
    if (currentColor === null) {
      showToast('아래 색상 바에서 칠할 색을 먼저 선택해 주세요')
      return
    }
    p.strokeMove(cells, currentColor)
  }

  const onBrushEnd = () => {
    p.strokeCommit()
  }

  // 행/열 이동: 인접 줄과 통째로 교환 (한 번의 되돌리기)
  const shiftRowCol = (kind: 'row' | 'col', dir: -1 | 1) => {
    if (!rowcolTarget) return
    const { W, H } = p
    const cells: number[] = []
    const values: number[] = []
    if (kind === 'col') {
      const a = rowcolTarget.x
      const b = a + dir
      if (b < 0 || b >= W) {
        showToast('더 이동할 수 없어요 (가장자리)')
        return
      }
      for (let y = 0; y < H; y++) {
        const ia = y * W + a
        const ib = y * W + b
        cells.push(ia, ib)
        values.push(grid[ib], grid[ia])
      }
      p.applyCellValues(cells, values)
      setRowcolTarget({ x: b, y: rowcolTarget.y }) // 대상이 따라가서 연타로 계속 이동
    } else {
      const a = rowcolTarget.y
      const b = a + dir
      if (b < 0 || b >= H) {
        showToast('더 이동할 수 없어요 (가장자리)')
        return
      }
      for (let x = 0; x < W; x++) {
        const ia = a * W + x
        const ib = b * W + x
        cells.push(ia, ib)
        values.push(grid[ib], grid[ia])
      }
      p.applyCellValues(cells, values)
      setRowcolTarget({ x: rowcolTarget.x, y: b })
    }
  }

  // 선택한 칸들을 클립보드로 복사 (bounding box 기준 상대좌표)
  const copySelection = () => {
    if (p.selection.size === 0) return
    let minX = p.W, minY = p.H, maxX = 0, maxY = 0
    for (const i of p.selection) {
      const x = i % p.W
      const y = Math.floor(i / p.W)
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    const cells = [...p.selection].map((i) => ({
      dx: (i % p.W) - minX,
      dy: Math.floor(i / p.W) - minY,
      v: grid[i],
    }))
    setClipboard({ w: maxX - minX + 1, h: maxY - minY + 1, cells })
    p.setSelection(new Set())
    showToast(`${cells.length.toLocaleString()}칸 복사됨 — 붙일 위치를 탭하세요`)
  }

  const applyColor = (colorIdx: number) => {
    setCurrentColor(colorIdx) // 고른 색은 칠하기용 현재 색으로도 지정
    p.pushRecentColor(colorIdx)
    if (p.selection.size === 0) {
      // 칠할 색만 고른 것 → 바로 칠/채우기 할 수 있게 (이미 칠하기/채우기면 그대로)
      if (p.tool !== 'brush' && p.tool !== 'bucket') p.setTool('brush')
      setSheetOpen(false)
      return
    }
    p.applyColor([...p.selection], colorIdx)
    setSheetOpen(false)
    p.setSelection(new Set())
  }

  const colorName = (idx: number) => (idx === EMPTY ? '빈칸(지우개)' : palette[idx]?.name ?? '?')

  // 하단 색상 바 탭: 선택 칸이 있으면 즉시 교체, 없으면 현재 색 지정
  const onStripTap = (colorIdx: number) => {
    if (p.selection.size > 0) {
      applyColor(colorIdx)
      showToast(colorIdx === EMPTY ? '선택한 칸을 빈칸으로 지웠어요' : `${colorName(colorIdx)}(으)로 교체했어요`)
    } else {
      setCurrentColor(colorIdx)
      p.pushRecentColor(colorIdx)
      if (p.tool !== 'brush' && p.tool !== 'bucket') p.setTool('brush')
    }
  }

  const saveNow = () => {
    if (p.saveNow()) {
      showToast('중간 저장 완료! 홈 → [내 작업 목록]에서 언제든 열 수 있어요')
    } else {
      showToast('저장할 작업이 없어요')
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
        <PreviewCanvas
          editable
          onCellTap={onCellTap}
          onBrushCells={onBrushCells}
          onBrushEnd={onBrushEnd}
          onAutoPen={() => showToast('애플펜 감지 — 이제 손가락은 화면 이동이에요. 도구 바에서 끌 수 있어요')}
          cross={p.tool === 'rowcol' ? rowcolTarget : null}
        />
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
                onClick={() => {
                  p.setTool(t.id)
                  if (t.id !== 'rowcol') setRowcolTarget(null)
                }}
              >
                <span>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
          <p className="muted hint">
            {p.tool === 'pan' && '한 손가락으로 이동, 두 손가락으로 확대/축소합니다.'}
            {p.tool === 'point' && '탭으로 칸 선택/해제 (여러 칸 가능). 길게 누르면 돋보기가 떠요.'}
            {p.tool === 'brush' && '드래그하면 현재 색으로 바로 칠해져요. 지나온 경로를 거꾸로 되짚으면 그만큼 취소! 손을 떼면 확정됩니다. (색은 아래 색상 바에서 선택)'}
            {p.tool === 'bucket' && '그림판 채우기처럼! 아래 색상 바에서 색을 고르고, 채우고 싶은 곳을 탭하면 이어진 같은 색 영역이 한 번에 바뀌어요.'}
            {p.tool === 'magic' && '탭한 칸과 같은 색 전체가 선택됩니다.'}
            {p.tool === 'eyedrop' && '탭한 칸의 색을 현재 색으로 가져옵니다.'}
            {p.tool === 'rowcol' && '이동할 행/열의 칸을 탭한 뒤, 아래 화살표로 한 줄씩 밀어요.'}
            {p.tool === 'paste' && '칸을 선택하고 [선택 복사] → 붙일 위치를 탭하면 그 자리에 복사돼요.'}
          </p>

          {/* 행/열 이동 화살표 패널 */}
          {p.tool === 'rowcol' && (
            <div className="rowcol-panel">
              {rowcolTarget ? (
                <>
                  <span className="rowcol-info">
                    행 <strong>{rowcolTarget.y + 1}</strong> · 열 <strong>{rowcolTarget.x + 1}</strong>
                  </span>
                  <div className="rowcol-btns">
                    <button className="btn-sm btn-secondary" onClick={() => shiftRowCol('row', -1)}>▲ 행 위로</button>
                    <button className="btn-sm btn-secondary" onClick={() => shiftRowCol('row', 1)}>▼ 행 아래로</button>
                    <button className="btn-sm btn-secondary" onClick={() => shiftRowCol('col', -1)}>◀ 열 왼쪽</button>
                    <button className="btn-sm btn-secondary" onClick={() => shiftRowCol('col', 1)}>▶ 열 오른쪽</button>
                  </div>
                  <button className="btn-ghost" onClick={() => setRowcolTarget(null)}>해제</button>
                </>
              ) : (
                <span className="muted">이동할 칸을 도안에서 탭해 주세요</span>
              )}
            </div>
          )}

          {/* 복사/붙이기 패널 */}
          {p.tool === 'paste' && (
            <div className="rowcol-panel">
              {clipboard ? (
                <>
                  <span className="rowcol-info">
                    📋 복사됨: <strong>{clipboard.w}×{clipboard.h}</strong> ({clipboard.cells.length.toLocaleString()}칸)
                    — 붙일 위치를 탭하세요
                  </span>
                  <button className="btn-ghost" onClick={() => setClipboard(null)}>복사 비우기</button>
                </>
              ) : (
                <button
                  className="btn-sm btn-primary"
                  disabled={p.selection.size === 0}
                  onClick={copySelection}
                >
                  📋 선택 복사 ({p.selection.size.toLocaleString()}칸)
                </button>
              )}
            </div>
          )}

          <label className="toggle-sm">
            <input
              type="checkbox"
              checked={s.penMode}
              onChange={(e) => s.set('penMode', e.target.checked)}
            />
            ✏️ 애플펜 모드 (손가락 = 화면 이동)
          </label>
          <p className="muted hint">
            💡 아이패드: 애플펜=편집 · 손가락=이동 · 두 손가락=확대축소 &nbsp;/&nbsp; PC: 우클릭 드래그=이동
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

          {/* 사용 색상 바: [＋]=팔레트에서 색 고르기, [∅]=지우개 · 내가 고른 색 / 자동 변환 색 구분 */}
          <div className="used-strip" data-guide="used-colors">
            <button
              className="used-swatch add-swatch"
              onClick={() => setSheetOpen(true)}
              title="팔레트에서 색 고르기"
            >
              ＋
            </button>
            <button
              className={`used-swatch eraser-swatch ${currentColor === EMPTY ? 'on' : ''}`}
              onClick={() => onStripTap(EMPTY)}
              title="지우개 (빈칸으로)"
            >
              ∅
            </button>
            {stripColors.picked.length > 0 && (
              <span className="strip-group strip-picked">
                <span className="strip-label">내가 고른</span>
                {stripColors.picked.map((idx) => {
                  const c = palette[idx]
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
              </span>
            )}
            {stripColors.auto.length > 0 && (
              <span className="strip-group">
                <span className="strip-label">자동 변환</span>
                {stripColors.auto.map((idx) => {
                  const c = palette[idx]
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
              </span>
            )}
          </div>

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

        {/* 도안 크기 편집: 가장자리 행/열 추가(빈 칸)·자르기 */}
        <details className="card">
          <summary>✂️ 행·열 자르기 / 추가 <span className="muted">(현재 {p.W}×{p.H}칸)</span></summary>
          <p className="muted hint">
            가장자리 줄을 자르거나(필요 없는 부분 제거) 빈 칸 줄을 추가해요. 재변환 없이 도안만 바뀝니다.
          </p>
          <div className="crop-grid">
            <span className="crop-lbl">가로줄(행)</span>
            <div className="crop-btns">
              <span>위</span>
              <button className="btn-sm btn-secondary" onClick={() => p.cropGrid('top', 1)}>＋추가</button>
              <button className="btn-sm btn-warn" onClick={() => p.cropGrid('top', -1)}>－자르기</button>
            </div>
            <div className="crop-btns">
              <span>아래</span>
              <button className="btn-sm btn-secondary" onClick={() => p.cropGrid('bottom', 1)}>＋추가</button>
              <button className="btn-sm btn-warn" onClick={() => p.cropGrid('bottom', -1)}>－자르기</button>
            </div>
            <span className="crop-lbl">세로줄(열)</span>
            <div className="crop-btns">
              <span>왼쪽</span>
              <button className="btn-sm btn-secondary" onClick={() => p.cropGrid('left', 1)}>＋추가</button>
              <button className="btn-sm btn-warn" onClick={() => p.cropGrid('left', -1)}>－자르기</button>
            </div>
            <div className="crop-btns">
              <span>오른쪽</span>
              <button className="btn-sm btn-secondary" onClick={() => p.cropGrid('right', 1)}>＋추가</button>
              <button className="btn-sm btn-warn" onClick={() => p.cropGrid('right', -1)}>－자르기</button>
            </div>
          </div>
          <p className="muted hint">※ 자르기·추가도 [↩️ 되돌리기]로 취소할 수 있어요.</p>
        </details>
      </div>

      <div className="bottom-bar" data-guide="actions">
        <button className="btn-secondary" onClick={() => p.go('convert')}>← 변환 설정</button>
        <button className="btn-secondary" onClick={() => p.go('render3d')} title="완성된 비즈발 3D 미리보기">🌐 3D</button>
        <button className="btn-primary" onClick={() => p.go('result')}>💾 도안 저장</button>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {sheetOpen && (
        <PaletteSheet
          title={
            p.selection.size > 0
              ? `선택한 ${p.selection.size.toLocaleString()}칸의 색 교체`
              : '칠할 색 고르기'
          }
          suggestions={suggestions}
          onPick={applyColor}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  )
}
