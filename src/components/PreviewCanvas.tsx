// 도안 미리보기/편집 캔버스: 뷰포트 컬링 렌더, 핀치 줌·패닝, 탭/브러시 선택, 길게 눌러 돋보기
import { useEffect, useMemo, useRef } from 'react'
import { useProject, useSettings } from '../state/store'
import { fullPalette } from '../lib/palette'
import { drawGrid, makeOverviewBitmap, paintBackground } from '../lib/render'
import type { ViewTransform } from '../lib/render'

interface Props {
  editable?: boolean
  onCellTap?: (idx: number) => void
  onBrushCells?: (idxs: number[]) => void
}

const TAP_MS = 350
const TAP_DIST = 8
const LONGPRESS_MS = 450

export default function PreviewCanvas({ editable, onCellTap, onBrushCells }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const grid = useProject((s) => s.grid)
  const W = useProject((s) => s.W)
  const H = useProject((s) => s.H)
  const gridVersion = useProject((s) => s.gridVersion)
  const selection = useProject((s) => s.selection)
  const deltaE = useProject((s) => s.deltaE)
  const tool = useProject((s) => s.tool)
  const image = useProject((s) => s.image)
  const overlayOn = useProject((s) => s.overlayOn)
  const overlayAlpha = useProject((s) => s.overlayAlpha)
  const customColors = useSettings((s) => s.customColors)
  const materialView = useSettings((s) => s.materialView)
  const background = useSettings((s) => s.background)
  const paintMode = useSettings((s) => s.paintMode)
  const expertThreshold = useSettings((s) => s.expertThreshold)

  const palette = useMemo(() => fullPalette(customColors), [customColors])

  const view = useRef<ViewTransform>({ s: 10, tx: 0, ty: 0 })
  const fittedFor = useRef('')
  const overview = useRef<HTMLCanvasElement | null>(null)
  const overviewFor = useRef(-1)
  const srcCanvas = useRef<HTMLCanvasElement | null>(null) // 원본 사진 (오버레이용)
  const srcCanvasFor = useRef<object | null>(null)
  const raf = useRef(0)
  const mag = useRef<{ x: number; y: number } | null>(null) // 돋보기(CSS px)

  // 포인터 상태
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null)
  const down = useRef<{ x: number; y: number; t: number; moved: boolean } | null>(null)
  const brushAcc = useRef<Set<number>>(new Set())
  const longTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const cssSize = () => {
    const el = wrapRef.current!
    return { cw: el.clientWidth, ch: el.clientHeight }
  }

  const fit = () => {
    if (!W || !H) return
    const { cw, ch } = cssSize()
    if (!cw || !ch) return
    const s = Math.min(cw / W, ch / H) * 0.96
    view.current = { s, tx: (cw - W * s) / 2, ty: (ch - H * s) / 2 }
  }

  const clampView = () => {
    const v = view.current
    const { cw, ch } = cssSize()
    const fitS = Math.min(cw / W, ch / H) * 0.96
    v.s = Math.max(fitS * 0.4, Math.min(90, v.s))
    // 그리드가 화면에서 완전히 벗어나지 않게
    v.tx = Math.max(cw - W * v.s - cw * 0.4, Math.min(cw * 0.4, v.tx))
    v.ty = Math.max(ch - H * v.s - ch * 0.4, Math.min(ch * 0.4, v.ty))
  }

  const draw = () => {
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      const cv = canvasRef.current
      const wrap = wrapRef.current
      if (!cv || !wrap) return
      const dpr = window.devicePixelRatio || 1
      const { cw, ch } = cssSize()
      if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) {
        cv.width = Math.round(cw * dpr)
        cv.height = Math.round(ch * dpr)
      }
      const ctx = cv.getContext('2d')!
      const bg = materialView ? background : 'white'
      if (!grid || !W || !H) {
        ctx.save()
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        paintBackground(ctx, cw, ch, bg)
        ctx.restore()
        return
      }
      if (overviewFor.current !== gridVersion) {
        overview.current = makeOverviewBitmap(grid, W, H, palette)
        overviewFor.current = gridVersion
      }
      // 원본 사진 캔버스 (이미지 바뀔 때 1회 생성)
      if (overlayOn && image && srcCanvasFor.current !== image) {
        const sc = document.createElement('canvas')
        sc.width = image.w
        sc.height = image.h
        sc.getContext('2d')!.putImageData(new ImageData(image.rgba.slice(), image.w, image.h), 0, 0)
        srcCanvas.current = sc
        srcCanvasFor.current = image
      }
      const overlay =
        overlayOn && srcCanvas.current
          ? { source: srcCanvas.current, alpha: overlayAlpha }
          : null
      drawGrid(ctx, cw, ch, dpr, grid, W, H, palette, view.current, {
        mode: materialView ? 'material' : 'flat',
        bg,
        overview: overview.current,
        showGridLines: !!editable,
        selection: editable ? selection : null,
        highlight:
          paintMode === 'expert' && deltaE
            ? { deltaE, threshold: expertThreshold }
            : null,
        overlay,
      })
      // 돋보기
      if (mag.current) {
        const { x, y } = mag.current
        const R = 74
        const zoom = 3
        const myp = Math.max(R + 8, y - 110)
        ctx.save()
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.beginPath()
        ctx.arc(x, myp, R, 0, Math.PI * 2)
        ctx.clip()
        // 손가락 아래 지점을 zoom배로 확대해 원 안에 그림
        const v = view.current
        const zv: ViewTransform = {
          s: v.s * zoom,
          tx: x - (x - v.tx) * zoom,
          ty: myp - (y - v.ty) * zoom,
        }
        drawGrid(ctx, cw, ch, 1, grid, W, H, palette, zv, {
          mode: materialView ? 'material' : 'flat',
          bg,
          overview: overview.current,
          showGridLines: true,
          selection: editable ? selection : null,
          highlight: null,
          overlay,
        })
        ctx.restore()
        ctx.save()
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.beginPath()
        ctx.arc(x, myp, R, 0, Math.PI * 2)
        ctx.lineWidth = 3
        ctx.strokeStyle = '#1e78ff'
        ctx.stroke()
        // 십자선
        ctx.beginPath()
        ctx.moveTo(x - 10, myp)
        ctx.lineTo(x + 10, myp)
        ctx.moveTo(x, myp - 10)
        ctx.lineTo(x, myp + 10)
        ctx.strokeStyle = '#ff3355'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.restore()
      }
    })
  }

  // 그리드 크기 바뀌면 화면 맞춤
  useEffect(() => {
    const key = `${W}x${H}`
    if (grid && fittedFor.current !== key) {
      fit()
      fittedFor.current = key
    }
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, W, H, gridVersion, selection, materialView, background, paintMode, expertThreshold, palette, editable, overlayOn, overlayAlpha, image])

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (grid && W && H) fit()
      draw()
    })
    if (wrapRef.current) ro.observe(wrapRef.current)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, W, H])

  const toLocal = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const cellAt = (x: number, y: number): number | null => {
    const v = view.current
    const cx = Math.floor((x - v.tx) / v.s)
    const cy = Math.floor((y - v.ty) / v.s)
    if (cx < 0 || cx >= W || cy < 0 || cy >= H) return null
    return cy * W + cx
  }

  const magnifierPoint = (x: number, y: number) => ({ x, y }) // 돋보기 중심=손가락 위치

  const clearLongPress = () => {
    clearTimeout(longTimer.current)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    canvasRef.current!.setPointerCapture(e.pointerId)
    const p = toLocal(e)
    pointers.current.set(e.pointerId, p)
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
      }
      down.current = null
      mag.current = null
      clearLongPress()
      return
    }
    down.current = { ...p, t: performance.now(), moved: false }
    brushAcc.current = new Set()
    if (editable && tool === 'brush') {
      const c = cellAt(p.x, p.y)
      if (c !== null) {
        brushAcc.current.add(c)
        onBrushCells?.([...brushAcc.current])
      }
    }
    if (editable && tool === 'point') {
      clearLongPress()
      longTimer.current = setTimeout(() => {
        if (down.current && !down.current.moved) {
          mag.current = magnifierPoint(p.x, p.y)
          draw()
        }
      }, LONGPRESS_MS)
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    const p = toLocal(e)
    const prev = pointers.current.get(e.pointerId)!
    pointers.current.set(e.pointerId, p)

    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      const v = view.current
      const k = dist / pinch.current.dist
      v.tx = cx - (pinch.current.cx - v.tx) * k
      v.ty = cy - (pinch.current.cy - v.ty) * k
      v.s *= k
      // 두 손가락 이동 = 팬
      v.tx += cx - pinch.current.cx
      v.ty += cy - pinch.current.cy
      pinch.current = { dist, cx, cy }
      clampView()
      draw()
      return
    }

    if (!down.current) return
    const dx = p.x - down.current.x
    const dy = p.y - down.current.y
    if (Math.hypot(dx, dy) > TAP_DIST) down.current.moved = true

    if (mag.current) {
      mag.current = magnifierPoint(p.x, p.y)
      draw()
      return
    }

    if (editable && tool === 'brush') {
      const c = cellAt(p.x, p.y)
      if (c !== null && !brushAcc.current.has(c)) {
        brushAcc.current.add(c)
        onBrushCells?.([...brushAcc.current])
      }
      return
    }

    if (down.current.moved) {
      clearLongPress()
      const v = view.current
      v.tx += p.x - prev.x
      v.ty += p.y - prev.y
      clampView()
      draw()
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const p = toLocal(e)
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    clearLongPress()

    const wasMag = mag.current
    if (wasMag) {
      mag.current = null
      draw()
      // 돋보기로 정밀 조준한 위치를 탭 처리
      const c = cellAt(p.x, p.y)
      if (c !== null && editable) onCellTap?.(c)
      down.current = null
      return
    }

    if (down.current) {
      const dt = performance.now() - down.current.t
      if (!down.current.moved && dt < TAP_MS) {
        const c = cellAt(p.x, p.y)
        if (c !== null && editable && tool !== 'brush' && tool !== 'pan') onCellTap?.(c)
      }
      down.current = null
    }
  }

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const p = toLocal(e)
    const v = view.current
    const k = Math.exp(-e.deltaY * 0.0015)
    v.tx = p.x - (p.x - v.tx) * k
    v.ty = p.y - (p.y - v.ty) * k
    v.s *= k
    clampView()
    draw()
  }

  return (
    <div ref={wrapRef} className="preview-wrap">
      <canvas
        ref={canvasRef}
        className="preview-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      />
    </div>
  )
}
