// PC 검증: 3D 뷰포트 + 시나리오 3종 + 고품질 SSAA 렌더 + 결과 이미지 + PNG 저장
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
const OUT = fileURLToPath(new URL('./screenshots/', import.meta.url))
const errors = []
const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()) })

const r = {}
await page.goto('http://localhost:5199/?demo=convert')
await page.waitForSelector('.color-list', { timeout: 30000 })
await page.waitForFunction(() => !document.querySelector('.converting-badge'), { timeout: 30000 })
r.size = await page.$eval('.size-info', (el) => el.innerText.replace(/\n/g, ' '))

// 🌐 3D 진입
await page.evaluate(() => { [...document.querySelectorAll('.bottom-bar button')].find((b) => b.textContent.includes('3D')).click() })
await page.waitForSelector('.r3d-canvas', { timeout: 20000 })
await page.waitForTimeout(2500)
r.stats = await page.$eval('.r3d-panel .hint', (el) => el.textContent).catch(() => null)

const nonBlank = async () => page.evaluate(() => {
  const cv = document.querySelector('.r3d-canvas'); const gl = cv.getContext('webgl2')
  const w = cv.width, h = cv.height, px = new Uint8Array(4 * 64)
  gl.readPixels(Math.floor(w / 2) - 4, Math.floor(h / 2) - 4, 8, 8, gl.RGBA, gl.UNSIGNED_BYTE, px)
  let min = 255, max = 0
  for (let i = 0; i < px.length; i += 4) { min = Math.min(min, px[i]); max = Math.max(max, px[i]) }
  return max - min > 3 || max > 30
})
r.viewportRendered = await nonBlank()
await page.screenshot({ path: `${OUT}52_r3d_window.png` })

// 시나리오 전환
await page.evaluate(() => { [...document.querySelectorAll('.segmented button')].find((b) => b.textContent.includes('벽면')).click() })
await page.waitForTimeout(900)
r.wallColorInputShown = await page.evaluate(() => !!document.querySelector('input[type=color]'))
await page.screenshot({ path: `${OUT}53_r3d_wall.png` })
await page.evaluate(() => { [...document.querySelectorAll('.segmented button')].find((b) => b.textContent.includes('스튜디오')).click() })
await page.waitForTimeout(900)
await page.screenshot({ path: `${OUT}54_r3d_studio.png` })
// 창가로 복귀
await page.evaluate(() => { [...document.querySelectorAll('.segmented button')].find((b) => b.textContent.includes('창가')).click() })
await page.waitForTimeout(900)

// 표준 화질 → 렌더 진행 → 결과 이미지
await page.evaluate(() => { [...document.querySelectorAll('.segmented button')].find((b) => b.textContent === '표준').click() })
await page.evaluate(() => { [...document.querySelectorAll('.bottom-bar button')].find((b) => b.textContent.includes('렌더 진행')).click() })
try {
  await page.waitForSelector('.r3d-result', { timeout: 30000 })
  r.rendered = true
  const dim = await page.evaluate(() => { const i = document.querySelector('.r3d-result'); return { w: i.naturalWidth, h: i.naturalHeight } })
  r.renderDim = dim
  await page.screenshot({ path: `${OUT}55_r3d_rendered.png` })
  // PNG 저장(데스크톱 다운로드)
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.evaluate(() => { [...document.querySelectorAll('.bottom-bar button')].find((b) => b.textContent.includes('PNG 저장')).click() }),
  ])
  r.savedFile = dl.suggestedFilename()
  // 다시 조정 → 뷰포트 복귀
  await page.evaluate(() => { [...document.querySelectorAll('.bottom-bar button')].find((b) => b.textContent.includes('다시 조정')).click() })
  await page.waitForTimeout(500)
  r.backToView = await page.evaluate(() => !!document.querySelector('.r3d-canvas') && getComputedStyle(document.querySelector('.r3d-canvas')).display !== 'none')
} catch (e) {
  r.rendered = false
  r.renderErr = String(e).slice(0, 120)
  await page.screenshot({ path: `${OUT}55_r3d_fail.png` })
}

r.errors = errors.slice(0, 8)
console.log(JSON.stringify(r, null, 1))
await ctx.close()
await browser.close()
