// ① 사진 선택 & 변환 화면: 미리보기 + 크기/모드/지름 컨트롤 + 색상 개수표
import { useEffect, useMemo, useRef } from 'react'
import { useProject, useSettings } from '../state/store'
import { finishedSizeCm } from '../lib/pattern'
import { BG_LABELS } from '../lib/render'
import type { Background } from '../lib/render'
import PreviewCanvas from '../components/PreviewCanvas'
import ColorList from '../components/ColorList'
import OverlayControl from '../components/OverlayControl'
import PurchasePlan from '../components/PurchasePlan'

export default function Convert() {
  const s = useSettings()
  const W = useProject((p) => p.W)
  const H = useProject((p) => p.H)
  const image = useProject((p) => p.image)
  const converting = useProject((p) => p.converting)
  const grid = useProject((p) => p.grid)
  const setSize = useProject((p) => p.setSize)
  const applyAutoSize = useProject((p) => p.applyAutoSize)
  const requestConvert = useProject((p) => p.requestConvert)
  const hasEdits = useProject((p) => p.hasEdits)
  const go = useProject((p) => p.go)

  // 팔레트·옵션이 바뀌면 재변환
  const disabled = useSettings((st) => st.disabled)
  const customColors = useSettings((st) => st.customColors)
  const maxColors = useSettings((st) => st.maxColors)
  const dithering = useSettings((st) => st.dithering)
  useEffect(() => {
    if (image) requestConvert()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, customColors, maxColors, dithering])

  // 전문가 모드: 임계값 초과(변경 권장) 칸 수
  const deltaE = useProject((p) => p.deltaE)
  const gridVersion = useProject((p) => p.gridVersion)
  const expertCount = useMemo(() => {
    if (s.paintMode !== 'expert' || !deltaE) return 0
    let n = 0
    for (let i = 0; i < deltaE.length; i++) if (deltaE[i] > s.expertThreshold) n++
    return n
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deltaE, s.expertThreshold, s.paintMode, gridVersion])

  // 목표 가로/총 개수를 바꾸면 1초 뒤 자동 적용
  const autoApplyFirst = useRef(true)
  useEffect(() => {
    if (autoApplyFirst.current) {
      autoApplyFirst.current = false
      return
    }
    if (!image) return
    const t = setTimeout(() => {
      if (
        !hasEdits() ||
        window.confirm('가로/세로를 바꾸면 세부 수정 내용이 사라집니다. 계속할까요?')
      ) {
        applyAutoSize()
      }
    }, 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.widthCm, s.budget])

  if (!image) return <p className="pad">사진이 없습니다. 홈에서 사진을 선택해 주세요.</p>

  const aspect = image.aspect
  const confirmGridChange = () =>
    !hasEdits() ||
    window.confirm('가로/세로를 바꾸면 세부 수정 내용이 사라집니다. 계속할까요?')

  const changeW = (nw: number) => {
    if (nw < 1 || !confirmGridChange()) return
    setSize(nw, s.lockAspect ? Math.max(1, Math.round(nw / aspect)) : H)
  }
  const changeH = (nh: number) => {
    if (nh < 1 || !confirmGridChange()) return
    setSize(s.lockAspect ? Math.max(1, Math.round(nh * aspect)) : W, nh)
  }

  const { wCm, hCm } = finishedSizeCm(W, H, s.diameterMm)

  return (
    <div className="split">
      <div className="preview-area" data-guide="preview">
        <PreviewCanvas />
        {converting && <div className="converting-badge">변환 중…</div>}
        {!converting && s.paintMode === 'expert' && grid && (
          <div className="expert-badge">변경 권장 {expertCount.toLocaleString()}칸</div>
        )}
        <OverlayControl />
      </div>

      <div className="controls">
        {/* 초기 크기 모드 */}
        <div className="card">
          <div className="seg-row" data-guide="size-mode">
            <div className="segmented">
              <button
                className={s.sizeMode === 'widthCm' ? 'on' : ''}
                onClick={() => { s.set('sizeMode', 'widthCm'); }}
              >
                가로 cm 기준
              </button>
              <button
                className={s.sizeMode === 'count' ? 'on' : ''}
                onClick={() => { s.set('sizeMode', 'count'); }}
              >
                총 개수 기준
              </button>
            </div>
            <button className="btn-secondary btn-sm" onClick={() => { if (confirmGridChange()) applyAutoSize() }}>
              비율 자동
            </button>
          </div>

          {s.sizeMode === 'widthCm' ? (
            <label className="field-row">
              목표 가로
              <input
                type="number" inputMode="decimal" min={1}
                value={s.widthCm}
                onChange={(e) => s.set('widthCm', Math.max(1, Number(e.target.value) || 0))}
              />
              cm
            </label>
          ) : (
            <label className="field-row">
              총 비즈 개수
              <input
                type="number" inputMode="numeric" min={1}
                value={s.budget}
                onChange={(e) => s.set('budget', Math.max(1, Number(e.target.value) || 0))}
              />
              개
            </label>
          )}

          <label className="toggle-sm">
            <input
              type="checkbox"
              checked={s.lockAspect}
              onChange={(e) => s.set('lockAspect', e.target.checked)}
            />
            가로세로 비율 고정 (사진 비율)
          </label>

          {/* 가로/세로 스테퍼 */}
          <div className="wh-row" data-guide="wh">
            <div className="stepper">
              <span>가로</span>
              <button onClick={() => changeW(W - 1)}>−</button>
              <input
                type="number" inputMode="numeric" value={W}
                onChange={(e) => changeW(Number(e.target.value) || 1)}
              />
              <button onClick={() => changeW(W + 1)}>＋</button>
            </div>
            <span className="muted">×</span>
            <div className="stepper">
              <span>세로</span>
              <button onClick={() => changeH(H - 1)}>−</button>
              <input
                type="number" inputMode="numeric" value={H}
                onChange={(e) => changeH(Number(e.target.value) || 1)}
              />
              <button onClick={() => changeH(H + 1)}>＋</button>
            </div>
          </div>

          {/* 지름 */}
          <div className="chips-row" data-guide="diameter">
            <span>비즈 지름</span>
            {([4, 6, 8] as const).map((d) => (
              <button
                key={d}
                className={`chip ${s.diameterMm === d ? 'on' : ''}`}
                onClick={() => {
                  s.set('diameterMm', d)
                  if (s.sizeMode === 'widthCm' && confirmGridChange()) applyAutoSize()
                }}
              >
                {d}mm
              </button>
            ))}
          </div>

          <p className="size-info">
            {W}×{H}칸 = 총 <strong>{(W * H).toLocaleString()}개</strong>
            <br />
            약 <strong>{wCm.toFixed(1)} × {hCm.toFixed(1)} cm</strong>
          </p>
        </div>

        {/* 채색 모드 + 재질 미리보기 */}
        <div className="card" data-guide="paint">
          <div className="seg-row">
            <span>채색 모드</span>
            <div className="segmented">
              {(
                [
                  ['auto', '자동'],
                  ['expert', '전문가'],
                  ['manual', '직접'],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  className={s.paintMode === mode ? 'on' : ''}
                  onClick={() => {
                    if (s.paintMode === mode) return
                    // 직접 모드 ↔ 자동/전문가 전환은 격자가 다시 만들어짐
                    const crossing = mode === 'manual' || s.paintMode === 'manual'
                    if (crossing && !confirmGridChange()) return
                    s.set('paintMode', mode)
                    if (crossing) requestConvert()
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {s.paintMode === 'manual' && (
            <p className="muted hint">
              빈 비즈 칸만 만들어 드려요. [세부 수정]에서 [원본] 오버레이를 켜고 색상 바에서 색을 골라
              직접 채워보세요.
            </p>
          )}
          {s.paintMode === 'expert' && (
            <>
              <p className="muted hint">
                이미지 색과 크게 벗어난 칸이 주황색으로 강조됩니다 (현재{' '}
                <strong>{expertCount.toLocaleString()}칸</strong>). 세부 수정에서 탭하면 대체 색을 추천해요.
              </p>
              <label className="field-col">
                강조 임계값 ΔE: <strong>{s.expertThreshold}</strong>{' '}
                <span className="muted">(낮출수록 더 많은 칸이 강조됩니다)</span>
                <input
                  type="range" min={5} max={40} value={s.expertThreshold}
                  onChange={(e) => s.set('expertThreshold', Number(e.target.value))}
                />
              </label>
            </>
          )}
          <label className="toggle-sm">
            <input
              type="checkbox"
              checked={s.materialView}
              onChange={(e) => s.set('materialView', e.target.checked)}
            />
            재질감 미리보기 (완성 느낌: 투명·반투명·오로라)
          </label>
          {s.materialView && (
            <div className="chips-row">
              <span>배경</span>
              {(Object.keys(BG_LABELS) as Background[]).map((b) => (
                <button key={b} className={`chip ${s.background === b ? 'on' : ''}`} onClick={() => s.set('background', b)}>
                  {BG_LABELS[b]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 고급 옵션 */}
        <details className="card">
          <summary>고급 옵션 (최대 색 수 · 디더링)</summary>
          <label className="field-col">
            최대 색 수: <strong>{s.maxColors}색</strong> <span className="muted">(파스텔 사진은 15~30색 권장)</span>
            <input
              type="range" min={4} max={60} value={s.maxColors}
              onChange={(e) => s.set('maxColors', Number(e.target.value))}
            />
          </label>
          <label className="toggle-sm">
            <input
              type="checkbox"
              checked={s.dithering}
              onChange={(e) => s.set('dithering', e.target.checked)}
            />
            디더링 (그라데이션을 인접 색 혼합으로 표현)
          </label>
        </details>

        <PurchasePlan />
        <ColorList />
      </div>

      {/* 하단 고정 바 */}
      <div className="bottom-bar" data-guide="actions">
        <button className="btn-secondary" onClick={() => go('editor')} disabled={!grid}>
          ✏️ 세부 수정
        </button>
        <button className="btn-primary" onClick={() => go('result')} disabled={!grid}>
          💾 도안 저장
        </button>
      </div>
    </div>
  )
}
