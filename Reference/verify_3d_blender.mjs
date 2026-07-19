// PC 검증: ① Blender 스크립트 생성(합성 grid, 전 마감 커버) ② 3D 화면 그림자·IBL 렌더·시나리오 전환·에러0 ③ Blender 버튼
import { chromium } from 'playwright'
import fs from 'fs'
const errors = []
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()) })

const r = {}
await page.goto('http://localhost:5199/?demo=convert')
await page.waitForSelector('.color-list', { timeout: 30000 })
await page.waitForFunction(() => !document.querySelector('.converting-badge'), { timeout: 30000 })

// ── Blender 스크립트 생성 (합성 grid: opaque/transparent/semi/aurora/B/EMPTY 모두 포함) ──
const py = await page.evaluate(async () => {
  const be = await import('/src/lib/blenderExport.ts')
  const pal = await import('/src/lib/palette.ts')
  const palette = pal.fullPalette([])
  const ff = (f) => palette.findIndex((c) => c.finish === f)
  const idx = { opaque: ff('opaque'), transparent: ff('transparent'), semi: ff('semi'), aurora: ff('aurora'), b: palette.findIndex((c) => c.brand === 'B') }
  const W = 40, H = 30
  const grid = new Uint16Array(W * H)
  for (let i = 0; i < grid.length; i++) {
    const m = i % 6
    grid[i] = m === 0 ? idx.opaque : m === 1 ? idx.transparent : m === 2 ? idx.semi
      : m === 3 ? (idx.aurora >= 0 ? idx.aurora : idx.opaque) : m === 4 ? idx.b : pal.EMPTY
  }
  return be.buildBlenderScript(grid, W, H, palette, 8)
})
fs.writeFileSync('C:/Users/roaeo/AppData/Local/Temp/claude/test_bizbal.py', py)
r.blender = {
  len: py.length,
  hasImportBpy: py.includes('import bpy'),
  hasColors: py.includes('COLORS = ['),
  hasTransmission: py.includes('Transmission Weight'),
  hasF12: py.includes('F12'),
}

// ── 3D 화면 진입 (실제 UI) ──
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('3D')); if (b) b.click() })
await page.waitForFunction(() => document.querySelector('.render3d .r3d-canvas') || document.body.textContent.includes('WebGL2 미지원'), { timeout: 15000 })
r.on3d = await page.evaluate(() => !!document.querySelector('.render3d .r3d-canvas'))
r.webglFail = await page.evaluate(() => document.body.textContent.includes('WebGL2 미지원'))
r.stats = await page.evaluate(() => document.querySelector('.render3d .hint')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80))
r.hasBlenderBtn = await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Blender로 내보내기')))
await page.waitForTimeout(800)
r.errAfterEnter = errors.length

// ── 시나리오 전환 (조명 재구성 에러 확인) ──
for (const label of ['벽면', '스튜디오', '창가']) {
  await page.evaluate((l) => { const b = [...document.querySelectorAll('.segmented button')].find((x) => x.textContent.includes(l)); if (b) b.click() }, label)
  await page.waitForTimeout(500)
}

r.errors = errors.slice(0, 10)
console.log(JSON.stringify(r, null, 1))
await ctx.close(); await browser.close()
