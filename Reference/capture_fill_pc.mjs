// PC 기준: 영역 채우기(색 먼저 고르고 그리면 즉시 채움) 검증
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'

const OUT = fileURLToPath(new URL('./screenshots/', import.meta.url))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
page.on('dialog', (d) => d.accept())

await page.goto('http://localhost:5199/?demo=editor')
await page.waitForSelector('.used-strip', { timeout: 30000 })
await page.waitForTimeout(600)

const cv = await page.$('.preview-canvas')
const box = await cv.boundingBox()
const cx = box.x + box.width / 2
const cy = box.y + box.height / 2
const pixelAt = (x, y) =>
  page.evaluate(([px, py]) => {
    const c = document.querySelector('.preview-canvas')
    const dpr = window.devicePixelRatio || 1
    const d = c.getContext('2d').getImageData(Math.round(px * dpr), Math.round(py * dpr), 1, 1).data
    return [d[0], d[1], d[2]]
  }, [x, y])

// ① 색 안 고르고 영역 채우기 시도 → 토스트 안내 (채워지면 안 됨)
await page.evaluate(() => {
  [...document.querySelectorAll('.tool-btn')].find((b) => b.textContent.includes('영역 채우기')).click()
})
await page.waitForTimeout(150)
const drawCircle = async (R) => {
  const pts = []
  for (let a = 0; a <= 360; a += 20) {
    const rad = (a * Math.PI) / 180
    pts.push([cx + Math.cos(rad) * R, cy + Math.sin(rad) * R])
  }
  await page.mouse.move(pts[0][0], pts[0][1])
  await page.mouse.down()
  for (const [x, y] of pts.slice(1)) { await page.mouse.move(x, y); await page.waitForTimeout(8) }
  await page.mouse.up()
  await page.waitForTimeout(300)
}
const before = await pixelAt(box.width / 2, box.height / 2)
await drawCircle(80)
const afterNoColor = await pixelAt(box.width / 2, box.height / 2)
const toastNoColor = await page.$eval('.toast', (el) => el.textContent).catch(() => null)

// ② 색상 바에서 BB 고르고 다시 그리기 → 즉시 채워짐, 선택은 0 유지
await page.click('.add-swatch')
await page.waitForSelector('.sheet')
await page.evaluate(() => {
  [...document.querySelectorAll('.palette-cell')].find((b) => b.textContent.trim() === 'BB').click()
})
await page.waitForTimeout(300)
// 색 고르면 칠하기 도구로 전환될 수 있으니 다시 영역 채우기 선택
await page.evaluate(() => {
  [...document.querySelectorAll('.tool-btn')].find((b) => b.textContent.includes('영역 채우기')).click()
})
await page.waitForTimeout(150)
await drawCircle(80)
const filled = await pixelAt(box.width / 2, box.height / 2)
const selText = await page.$eval('.replace-row strong', (el) => el.textContent)
const undoEnabled = await page.evaluate(() =>
  !([...document.querySelectorAll('button')].find((x) => x.textContent.includes('되돌리기')).disabled))
await page.screenshot({ path: `${OUT}42_fill_done.png` })

console.log(JSON.stringify({
  before, afterNoColor, toastNoColor, filled, selText, undoEnabled,
  noColorFillBlocked: before.join() === afterNoColor.join(),
  filledChanged: filled.join() !== before.join(),
}))
await browser.close()
