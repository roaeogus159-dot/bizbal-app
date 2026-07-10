// 비즈 렌더링: 스프라이트 프리렌더(재질감 포함) + 뷰포트 컬링 그리드 드로잉
import type { BeadColor, Finish } from './palette'
import { hexToRgb, rgbToHex } from './color'

export type RenderMode = 'flat' | 'material'
export type Background = 'white' | 'backlit' | 'dark'

export const BG_LABELS: Record<Background, string> = {
  white: '흰 배경',
  backlit: '역광(창가)',
  dark: '어두움',
}

/** 배경 채우기 (투명 비즈는 배경이 비쳐야 구분됨) */
export function paintBackground(
  ctx: CanvasRenderingContext2D, w: number, h: number, bg: Background,
) {
  if (bg === 'white') {
    ctx.fillStyle = '#f4f2ee'
    ctx.fillRect(0, 0, w, h)
  } else if (bg === 'dark') {
    ctx.fillStyle = '#23252d'
    ctx.fillRect(0, 0, w, h)
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#fdf6dd')
    g.addColorStop(0.45, '#f3ede0')
    g.addColorStop(1, '#c9d6e4')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
}

function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex)
  const f = (v: number) => Math.max(0, Math.min(255, v + amt))
  return rgbToHex(f(r), f(g), f(b))
}

/** 비즈 1알 스프라이트를 그린다 (투명 배경 캔버스에) */
function drawBeadSprite(
  ctx: CanvasRenderingContext2D, size: number, hex: string, finish: Finish, mode: RenderMode,
) {
  const c = size / 2
  const r = size / 2 - Math.max(0.5, size * 0.03)
  ctx.clearRect(0, 0, size, size)

  if (mode === 'flat') {
    // 도안(편집) 뷰: 전부 불투명 플랫 원 + 또렷한 경계
    ctx.beginPath()
    ctx.arc(c, c, r, 0, Math.PI * 2)
    ctx.fillStyle = hex
    ctx.fill()
    if (size >= 8) {
      ctx.lineWidth = Math.max(0.6, size * 0.03)
      ctx.strokeStyle = 'rgba(0,0,0,0.28)'
      ctx.stroke()
    }
    return
  }

  // ---- 재질감(완성 미리보기) ----
  const hi = shade(hex, 70)
  const lo = shade(hex, -55)

  if (finish === 'transparent') {
    // 투명: 가운데가 비치고 림은 진함
    const g = ctx.createRadialGradient(c, c, r * 0.1, c, c, r)
    g.addColorStop(0, hex + '52') // 중심 알파 낮음 → 배경 비침
    g.addColorStop(0.72, hex + '99')
    g.addColorStop(1, hex + 'e6')
    ctx.beginPath()
    ctx.arc(c, c, r, 0, Math.PI * 2)
    ctx.fillStyle = g
    ctx.fill()
    ctx.lineWidth = Math.max(0.6, size * 0.05)
    ctx.strokeStyle = lo + 'aa'
    ctx.stroke()
  } else if (finish === 'semi') {
    // 반투명: 우윳빛 반투과
    const g = ctx.createRadialGradient(c - r * 0.3, c - r * 0.3, r * 0.1, c, c, r)
    g.addColorStop(0, shade(hex, 55) + 'e0')
    g.addColorStop(0.6, hex + 'd9')
    g.addColorStop(1, lo + 'ee')
    ctx.beginPath()
    ctx.arc(c, c, r, 0, Math.PI * 2)
    ctx.fillStyle = g
    ctx.fill()
  } else {
    // 불투명 / 오로라 베이스
    const g = ctx.createRadialGradient(c - r * 0.35, c - r * 0.35, r * 0.1, c, c, r)
    g.addColorStop(0, hi)
    g.addColorStop(0.55, hex)
    g.addColorStop(1, lo)
    ctx.beginPath()
    ctx.arc(c, c, r, 0, Math.PI * 2)
    ctx.fillStyle = g
    ctx.fill()
  }

  if (finish === 'aurora') {
    // 오로라: 무지개 광택 코트 (각도 의존 이리데센스 근사)
    ctx.save()
    ctx.beginPath()
    ctx.arc(c, c, r, 0, Math.PI * 2)
    ctx.clip()
    const g1 = ctx.createLinearGradient(0, 0, size, size)
    g1.addColorStop(0.05, 'rgba(255,110,180,0.42)')
    g1.addColorStop(0.35, 'rgba(120,255,210,0.30)')
    g1.addColorStop(0.65, 'rgba(120,170,255,0.34)')
    g1.addColorStop(0.95, 'rgba(255,230,120,0.30)')
    ctx.fillStyle = g1
    ctx.fillRect(0, 0, size, size)
    ctx.restore()
  }

  // 스페큘러 하이라이트 (구슬 광택)
  const hr = r * 0.34
  const hx = c - r * 0.4
  const hy = c - r * 0.42
  const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr)
  const alpha = finish === 'transparent' ? 0.75 : 0.85
  hg.addColorStop(0, `rgba(255,255,255,${alpha})`)
  hg.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.beginPath()
  ctx.arc(hx, hy, hr, 0, Math.PI * 2)
  ctx.fillStyle = hg
  ctx.fill()

  // 림 음영
  ctx.beginPath()
  ctx.arc(c, c, r, 0, Math.PI * 2)
  ctx.lineWidth = Math.max(0.5, size * 0.025)
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'
  ctx.stroke()
}

const spriteCache = new Map<string, HTMLCanvasElement>()

/** 스프라이트 캐시: (색hex, 재질, 픽셀크기, 모드) 당 1회 프리렌더 → drawImage 스탬프 */
export function getBeadSprite(
  hex: string, finish: Finish, sizePx: number, mode: RenderMode,
): HTMLCanvasElement {
  const size = Math.max(2, Math.round(sizePx))
  const key = `${hex}|${finish}|${size}|${mode}`
  let cv = spriteCache.get(key)
  if (!cv) {
    if (spriteCache.size > 800) spriteCache.clear()
    cv = document.createElement('canvas')
    cv.width = size
    cv.height = size
    drawBeadSprite(cv.getContext('2d')!, size, hex, finish, mode)
    spriteCache.set(key, cv)
  }
  return cv
}

/** 그리드 전체를 1칸=1px 비트맵으로 (줌아웃 미리보기·빠른 팬용) */
export function makeOverviewBitmap(
  grid: Uint16Array, W: number, H: number, palette: BeadColor[],
): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')!
  const img = ctx.createImageData(W, H)
  const rgbCache: [number, number, number][] = palette.map((c) => hexToRgb(c.hex))
  for (let i = 0; i < grid.length; i++) {
    const [r, g, b] = rgbCache[grid[i]] ?? [255, 0, 255]
    img.data[i * 4] = r
    img.data[i * 4 + 1] = g
    img.data[i * 4 + 2] = b
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return cv
}

export interface ViewTransform {
  s: number // 1칸당 CSS px
  tx: number
  ty: number
}

export interface DrawOptions {
  mode: RenderMode
  bg: Background
  overview: HTMLCanvasElement | null
  showGridLines?: boolean
  selection?: Set<number> | null
  highlight?: { deltaE: Float32Array; threshold: number } | null
  /** 원본 사진 오버레이 (직접 대조하며 색 수정용) */
  overlay?: { source: CanvasImageSource; alpha: number } | null
}

/** 메인 그리드 드로잉 (뷰포트 컬링, dpr 반영) */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  cssW: number, cssH: number, dpr: number,
  grid: Uint16Array, W: number, H: number, palette: BeadColor[],
  view: ViewTransform, opts: DrawOptions,
) {
  const { s, tx, ty } = view
  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  paintBackground(ctx, cssW, cssH, opts.bg)

  const x0 = Math.max(0, Math.floor(-tx / s))
  const y0 = Math.max(0, Math.floor(-ty / s))
  const x1 = Math.min(W, Math.ceil((cssW - tx) / s))
  const y1 = Math.min(H, Math.ceil((cssH - ty) / s))
  if (x1 <= x0 || y1 <= y0) {
    ctx.restore()
    return
  }

  // 1칸이 아주 작거나 보이는 칸이 너무 많으면 오버뷰 비트맵으로 (성능)
  const visibleCells = (x1 - x0) * (y1 - y0)
  const useOverview = (s < 2.5 || visibleCells > 40_000) && opts.overview
  if (useOverview && opts.overview) {
    ctx.imageSmoothingEnabled = s < 1.5
    ctx.drawImage(opts.overview, tx, ty, W * s, H * s)
  } else {
    const spriteSize = Math.round(s * dpr)
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const c = palette[grid[y * W + x]]
        if (!c) continue
        const sp = getBeadSprite(c.hex, c.finish, spriteSize, opts.mode)
        ctx.drawImage(sp, tx + x * s, ty + y * s, s, s)
      }
    }
  }

  // 원본 사진 오버레이: 격자 영역에 정확히 맞춰 반투명 합성
  if (opts.overlay) {
    ctx.save()
    ctx.globalAlpha = opts.overlay.alpha
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(opts.overlay.source, tx, ty, W * s, H * s)
    ctx.restore()
  }

  // 격자 보조선 (편집 뷰 고배율)
  if (opts.showGridLines && s >= 10) {
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    for (let x = x0; x <= x1; x++) {
      ctx.moveTo(tx + x * s, ty + y0 * s)
      ctx.lineTo(tx + x * s, ty + y1 * s)
    }
    for (let y = y0; y <= y1; y++) {
      ctx.moveTo(tx + x0 * s, ty + y * s)
      ctx.lineTo(tx + x1 * s, ty + y * s)
    }
    ctx.stroke()
  }

  // 전문가 모드: ΔE 초과 칸 강조 (축소 시 반투명 채움, 확대 시 주황 테두리 + 빗금)
  if (opts.highlight) {
    const { deltaE, threshold } = opts.highlight
    const small = s < 8 // 칸이 작으면 테두리가 안 보이므로 채움으로 표시
    ctx.strokeStyle = '#ff5a00'
    ctx.fillStyle = 'rgba(255,90,0,0.5)'
    ctx.lineWidth = Math.max(1.5, s * 0.09)
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * W + x
        if (deltaE[i] > threshold) {
          if (small) {
            ctx.fillRect(tx + x * s, ty + y * s, s, s)
          } else {
            ctx.strokeRect(tx + x * s + 1, ty + y * s + 1, s - 2, s - 2)
            if (s >= 12) {
              ctx.beginPath()
              ctx.moveTo(tx + x * s + 2, ty + y * s + s - 2)
              ctx.lineTo(tx + x * s + s - 2, ty + y * s + 2)
              ctx.stroke()
            }
          }
        }
      }
    }
  }

  // 선택 오버레이
  if (opts.selection && opts.selection.size > 0) {
    ctx.fillStyle = 'rgba(30,120,255,0.32)'
    ctx.strokeStyle = '#1e78ff'
    ctx.lineWidth = Math.max(1, s * 0.07)
    for (const i of opts.selection) {
      const x = i % W
      const y = Math.floor(i / W)
      if (x < x0 || x >= x1 || y < y0 || y >= y1) continue
      ctx.fillRect(tx + x * s, ty + y * s, s, s)
      ctx.strokeRect(tx + x * s + 0.5, ty + y * s + 0.5, s - 1, s - 1)
    }
  }

  ctx.restore()
}
