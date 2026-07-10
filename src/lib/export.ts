// 도안 출력: (A) 휴대폰용 컬러 PNG (B) 인쇄용 A4 (순번+범례+5/10칸선+4변 좌표) (C) 세로 줄 순서표
// iOS 저장: canvas.toBlob → Web Share(사진앱) 우선, 미지원 시 다운로드 폴백
import type { BeadColor } from './palette'
import type { LegendEntry } from './pattern'
import { legendNumberMap, strandRuns, strandLengths, finishedSizeCm } from './pattern'
import { getBeadSprite } from './render'
import { hexToRgb, isLight } from './color'

const FONT = '"Apple SD Gothic Neo","Malgun Gothic",sans-serif'

// ---------- (A) 휴대폰용 컬러 도안 ----------

export function renderColorPng(
  grid: Uint16Array, W: number, H: number, palette: BeadColor[],
): HTMLCanvasElement {
  const cell = Math.max(3, Math.min(24, Math.floor(4096 / Math.max(W, H))))
  const cv = document.createElement('canvas')
  cv.width = W * cell
  cv.height = H * cell
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = '#f6f5f2'
  ctx.fillRect(0, 0, cv.width, cv.height)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = palette[grid[y * W + x]]
      if (!c) continue
      if (cell >= 5) {
        ctx.drawImage(getBeadSprite(c.hex, c.finish, cell, 'flat'), x * cell, y * cell)
      } else {
        ctx.fillStyle = c.hex
        ctx.fillRect(x * cell, y * cell, cell, cell)
      }
    }
  }
  return cv
}

// ---------- (B) 인쇄용 A4 (300DPI) ----------

const A4W = 2480
const A4H = 3508
const MARGIN = 110
const COORD = 78 // 좌표 번호 띠 폭
const HEADER = 110

export interface PrintResult {
  pages: HTMLCanvasElement[]
  tilesX: number
  tilesY: number
}

export function renderPrintPages(
  grid: Uint16Array, W: number, H: number, palette: BeadColor[],
  legend: LegendEntry[], diameterMm: number,
): PrintResult {
  const numMap = legendNumberMap(legend)
  const availW = A4W - MARGIN * 2 - COORD * 2
  const availH = A4H - MARGIN * 2 - COORD * 2 - HEADER
  // 한 장에 다 들어가면 칸을 키우고, 아니면 26px(≈2.2mm) 고정으로 타일 분할
  const fitCell = Math.floor(Math.min(availW / W, availH / H))
  const cell = fitCell >= 26 ? Math.min(64, fitCell) : 26
  const colsPer = Math.floor(availW / cell)
  const rowsPer = Math.floor(availH / cell)
  const tilesX = Math.ceil(W / colsPer)
  const tilesY = Math.ceil(H / rowsPer)

  const pages: HTMLCanvasElement[] = []
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const x0 = tx * colsPer
      const y0 = ty * rowsPer
      const x1 = Math.min(W, x0 + colsPer)
      const y1 = Math.min(H, y0 + rowsPer)
      pages.push(
        renderPrintTile(grid, W, palette, numMap, x0, y0, x1, y1, cell, {
          page: pages.length + 1,
          total: tilesX * tilesY,
          tx, ty, tilesX, tilesY, diameterMm, W, H,
        }),
      )
    }
  }
  pages.push(renderLegendPage(legend, palette, W, H, diameterMm))
  return { pages, tilesX, tilesY }
}

interface TileInfo {
  page: number
  total: number
  tx: number
  ty: number
  tilesX: number
  tilesY: number
  diameterMm: number
  W: number
  H: number
}

function renderPrintTile(
  grid: Uint16Array, W: number, palette: BeadColor[], numMap: Map<number, number>,
  x0: number, y0: number, x1: number, y1: number, cell: number, info: TileInfo,
): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = A4W
  cv.height = A4H
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, A4W, A4H)

  const gx = MARGIN + COORD
  const gy = MARGIN + HEADER + COORD
  const cols = x1 - x0
  const rows = y1 - y0
  const gw = cols * cell
  const gh = rows * cell

  // 헤더
  ctx.fillStyle = '#111'
  ctx.font = `bold 52px ${FONT}`
  ctx.textBaseline = 'top'
  const tileLabel =
    info.total > 1 ? `  ${info.page}/${info.total}장 (가로 ${info.tx + 1}·세로 ${info.ty + 1})` : ''
  ctx.fillText(`비즈발 도안${tileLabel}`, MARGIN, MARGIN - 10)
  ctx.font = `36px ${FONT}`
  ctx.fillStyle = '#555'
  ctx.fillText(
    `전체 ${info.W}×${info.H}칸 · 이 장: 열 ${x0 + 1}~${x1} / 행 ${y0 + 1}~${y1} · 지름 ${info.diameterMm}mm`,
    MARGIN, MARGIN + 56,
  )

  // 칸 채움 + 순번
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const fs = Math.floor(cell * (cell >= 40 ? 0.42 : 0.5))
  ctx.font = `bold ${fs}px ${FONT}`
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = grid[y * W + x]
      const c = palette[idx]
      if (!c) continue
      const px = gx + (x - x0) * cell
      const py = gy + (y - y0) * cell
      ctx.fillStyle = c.hex
      ctx.fillRect(px, py, cell, cell)
      const [r, g, b] = hexToRgb(c.hex)
      ctx.fillStyle = isLight(r, g, b) ? '#000' : '#fff'
      const n = numMap.get(idx)
      if (n !== undefined) ctx.fillText(String(n), px + cell / 2, py + cell / 2 + 1)
    }
  }

  // 격자: 5칸 얇은 선, 10칸 굵은 선 (전역 좌표 기준)
  const lineAt = (v: number) => (v % 10 === 0 ? 5 : v % 5 === 0 ? 2.5 : 1)
  ctx.strokeStyle = '#000'
  for (let x = x0; x <= x1; x++) {
    ctx.lineWidth = lineAt(x)
    ctx.beginPath()
    ctx.moveTo(gx + (x - x0) * cell, gy)
    ctx.lineTo(gx + (x - x0) * cell, gy + gh)
    ctx.stroke()
  }
  for (let y = y0; y <= y1; y++) {
    ctx.lineWidth = lineAt(y)
    ctx.beginPath()
    ctx.moveTo(gx, gy + (y - y0) * cell)
    ctx.lineTo(gx + gw, gy + (y - y0) * cell)
    ctx.stroke()
  }
  ctx.lineWidth = 5
  ctx.strokeRect(gx, gy, gw, gh)

  // 네 변 좌표 번호 (1과 5의 배수)
  ctx.fillStyle = '#111'
  ctx.font = `bold ${Math.max(26, Math.min(34, cell * 0.7))}px ${FONT}`
  for (let x = x0; x < x1; x++) {
    const label = x + 1
    if (label !== 1 && label % 5 !== 0) continue
    const cxp = gx + (x - x0) * cell + cell / 2
    ctx.fillText(String(label), cxp, gy - COORD / 2)
    ctx.fillText(String(label), cxp, gy + gh + COORD / 2)
  }
  for (let y = y0; y < y1; y++) {
    const label = y + 1
    if (label !== 1 && label % 5 !== 0) continue
    const cyp = gy + (y - y0) * cell + cell / 2
    ctx.fillText(String(label), gx - COORD / 2, cyp)
    ctx.fillText(String(label), gx + gw + COORD / 2, cyp)
  }

  // 푸터
  ctx.textAlign = 'left'
  ctx.font = `30px ${FONT}`
  ctx.fillStyle = '#777'
  ctx.fillText('칸 안 숫자 = 색상 순번(범례 참조) · 얇은 선 5칸 · 굵은 선 10칸', MARGIN, A4H - MARGIN + 14)
  return cv
}

function renderLegendPage(
  legend: LegendEntry[], palette: BeadColor[], W: number, H: number, diameterMm: number,
): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = A4W
  cv.height = A4H
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, A4W, A4H)
  ctx.fillStyle = '#111'
  ctx.font = `bold 52px ${FONT}`
  ctx.textBaseline = 'top'
  ctx.fillText('범례 — 색상 순번표', MARGIN, MARGIN)
  const { wCm, hCm } = finishedSizeCm(W, H, diameterMm)
  ctx.font = `36px ${FONT}`
  ctx.fillStyle = '#555'
  ctx.fillText(
    `${W}×${H}칸 · 총 ${(W * H).toLocaleString()}개 · ${legend.length}색 · 완성 약 ${wCm.toFixed(1)}×${hCm.toFixed(1)}cm (지름 ${diameterMm}mm)`,
    MARGIN, MARGIN + 70,
  )

  const cols = legend.length > 28 ? 2 : 1
  const colW = (A4W - MARGIN * 2) / cols
  const rowH = 88
  const top = MARGIN + 170
  ctx.textBaseline = 'middle'
  legend.forEach((e, i) => {
    const col = Math.floor(i / Math.ceil(legend.length / cols))
    const row = i % Math.ceil(legend.length / cols)
    const x = MARGIN + col * colW
    const y = top + row * rowH
    if (y > A4H - MARGIN) return // 안전장치 (85색 2열이면 충분)
    const c = palette[e.paletteIdx]
    if (!c) return
    ctx.fillStyle = '#111'
    ctx.font = `bold 40px ${FONT}`
    ctx.textAlign = 'right'
    ctx.fillText(String(e.number), x + 70, y + rowH / 2)
    ctx.textAlign = 'left'
    ctx.fillStyle = c.hex
    ctx.fillRect(x + 95, y + 12, 100, rowH - 24)
    ctx.strokeStyle = '#999'
    ctx.lineWidth = 2
    ctx.strokeRect(x + 95, y + 12, 100, rowH - 24)
    ctx.fillStyle = '#111'
    ctx.font = `36px ${FONT}`
    ctx.fillText(`${c.code} · ${c.name}`, x + 220, y + rowH / 2)
    ctx.textAlign = 'right'
    ctx.fillText(`${e.count.toLocaleString()}개`, x + colW - 40, y + rowH / 2)
    ctx.textAlign = 'left'
  })
  return cv
}

// ---------- (C) 세로 줄(스트랜드) 순서표 ----------

export function renderStrandSheets(
  grid: Uint16Array, W: number, H: number, palette: BeadColor[],
): HTMLCanvasElement[] {
  const runs = strandRuns(grid, W, H)
  const lens = strandLengths(grid, W, H, palette)
  const pages: HTMLCanvasElement[] = []

  const lineH = 54
  const font = `34px ${FONT}`
  const boldFont = `bold 34px ${FONT}`
  const maxW = A4W - MARGIN * 2

  // 줄별 표시 라인 구성 (측정 후 페이지 분배)
  interface Seg { text: string; hex?: string; bold?: boolean }
  const lines: Seg[][] = []
  const meas = document.createElement('canvas').getContext('2d')!

  // 요약 헤더
  lines.push([{ text: `세로 줄 순서표 — 총 ${W}줄 × ${H}알`, bold: true }])
  lines.push([{
    text: `줄 길이: 최소 ${(lens.minMm / 10).toFixed(1)}cm · 최대 ${(lens.maxMm / 10).toFixed(1)}cm · 편차 ${(lens.devMm / 10).toFixed(1)}cm (볼 종류별 실제 지름 합)`,
  }])
  lines.push([{ text: '각 줄을 위→아래 순서로 꿰어 왼쪽(1번)부터 순서대로 매답니다.', }])
  lines.push([{ text: '' }])

  for (let x = 0; x < W; x++) {
    const head: Seg = { text: `${x + 1}번 줄 (${(lens.mm[x] / 10).toFixed(1)}cm): `, bold: true }
    let cur: Seg[] = [head]
    meas.font = boldFont
    let curW = meas.measureText(head.text).width
    meas.font = font
    for (let i = 0; i < runs[x].length; i++) {
      const r = runs[x][i]
      const c = palette[r.paletteIdx]
      const chip = 26
      const t = `${c?.code ?? '?'}×${r.len}${i < runs[x].length - 1 ? ',  ' : ''}`
      const wSeg = chip + 8 + meas.measureText(t).width
      if (curW + wSeg > maxW) {
        lines.push(cur)
        cur = [{ text: '      ' }]
        curW = meas.measureText('      ').width
      }
      cur.push({ text: t, hex: c?.hex })
      curW += wSeg
    }
    lines.push(cur)
  }

  const rowsPerPage = Math.floor((A4H - MARGIN * 2 - 60) / lineH)
  for (let p = 0; p * rowsPerPage < lines.length; p++) {
    const cv = document.createElement('canvas')
    cv.width = A4W
    cv.height = A4H
    const ctx = cv.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, A4W, A4H)
    ctx.textBaseline = 'middle'
    const slice = lines.slice(p * rowsPerPage, (p + 1) * rowsPerPage)
    slice.forEach((segs, row) => {
      let x = MARGIN
      const y = MARGIN + row * lineH + lineH / 2
      for (const seg of segs) {
        ctx.font = seg.bold ? (row === 0 && p === 0 ? `bold 46px ${FONT}` : boldFont) : font
        if (seg.hex) {
          ctx.fillStyle = seg.hex
          ctx.beginPath()
          ctx.arc(x + 13, y, 13, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#888'
          ctx.lineWidth = 1.5
          ctx.stroke()
          x += 34
        }
        ctx.fillStyle = '#111'
        ctx.fillText(seg.text, x, y)
        x += ctx.measureText(seg.text).width
      }
    })
    ctx.font = `28px ${FONT}`
    ctx.fillStyle = '#888'
    ctx.textAlign = 'right'
    ctx.fillText(`${p + 1} 페이지`, A4W - MARGIN, A4H - MARGIN / 2)
    pages.push(cv)
  }
  return pages
}

// ---------- 저장 (iOS Web Share 우선) ----------

export function canvasToBlob(cv: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    cv.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob 실패'))), 'image/png'),
  )
}

export function dateStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

/** 공유시트는 모바일(iOS/Android)에서만 — 데스크톱 Chrome은 OS 공유창이 떠서 다운로드를 막음 */
export function shouldUseShare(): boolean {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

/** 파일들을 iOS 공유시트(사진 저장) 또는 다운로드로 저장 */
export async function saveFiles(items: { blob: Blob; name: string }[]): Promise<'shared' | 'downloaded'> {
  const files = items.map((i) => new File([i.blob], i.name, { type: 'image/png' }))
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (shouldUseShare() && nav.share && nav.canShare?.({ files })) {
    try {
      await nav.share({ files })
      return 'shared'
    } catch (e) {
      // 사용자가 취소한 경우 등 → 다운로드 폴백하지 않고 조용히 종료
      if ((e as Error).name === 'AbortError') return 'shared'
    }
  }
  for (const { blob, name } of items) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    await new Promise((r) => setTimeout(r, 350))
    URL.revokeObjectURL(url)
  }
  return 'downloaded'
}
