// PC 기준: 그림판식 채우기(플러드 필) 검증 — 탭한 곳의 같은색 영역이 현재색으로
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'

const OUT = fileURLToPath(new URL('./screenshots/', import.meta.url))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
page.on('dialog', (d) => d.accept())

// 직접 모드로 큰 단색(빈칸) 영역을 만들어 플러드 필이 넓게 퍼지는지 확인
await page.goto('http://localhost:5199/?demo=convert')
await page.waitForSelector('.color-list', { timeout: 30000 })
await page.waitForFunction(() => !document.querySelector('.converting-badge'), { timeout: 30000 })
await page.evaluate(() => {
  [...document.querySelectorAll('.segmented button')].find((b) => b.textContent === '직접').click()
})
await page.waitForTimeout(700)
await page.evaluate(() => {
  [...document.querySelectorAll('.bottom-bar button')].find((b) => b.textContent.includes('세부 수정')).click()
})
await page.waitForSelector('.used-strip', { timeout: 15000 })
await page.waitForTimeout(400)

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

// ① 채우기 도구 선택 + 색 안 고르고 탭 → 안내(차단)
await page.evaluate(() => {
  [...document.querySelectorAll('.tool-btn')].find((b) => b.textContent.includes('채우기')).click()
})
await page.waitForTimeout(150)
const toolOn = await page.$eval('.tool-btn.on', (el) => el.textContent.trim())
const before = await pixelAt(box.width / 2, box.height / 2)
await page.mouse.click(cx, cy)
await page.waitForTimeout(250)
const afterNoColor = await pixelAt(box.width / 2, box.height / 2)
const toastNoColor = await page.$eval('.toast', (el) => el.textContent).catch(() => null)

// ② 색 고르고(BB) 다시 채우기 도구로 → 빈 영역 한가운데 탭 → 전체 빈칸이 BB로
await page.click('.add-swatch')
await page.waitForSelector('.sheet')
await page.evaluate(() => {
  [...document.querySelectorAll('.palette-cell')].find((b) => b.textContent.trim() === 'BB').click()
})
await page.waitForTimeout(300)
await page.evaluate(() => {
  [...document.querySelectorAll('.tool-btn')].find((b) => b.textContent.includes('채우기')).click()
})
await page.waitForTimeout(150)
await page.mouse.click(cx, cy)
await page.waitForTimeout(400)
const filledCenter = await pixelAt(box.width / 2, box.height / 2)
// 멀리 떨어진 지점도 같이 채워졌는지(연결된 영역이므로) — 좌상단 부근
const filledCorner = await pixelAt(box.width * 0.2, box.height * 0.2)
const toastFill = await page.$eval('.toast', (el) => el.textContent).catch(() => null)
const undoEnabled = await page.evaluate(() =>
  !([...document.querySelectorAll('button')].find((x) => x.textContent.includes('되돌리기')).disabled))
await page.screenshot({ path: `${OUT}43_bucket_filled.png` })

// ③ 되돌리기 → 원복
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((x) => x.textContent.includes('되돌리기')).click()
})
await page.waitForTimeout(300)
const afterUndo = await pixelAt(box.width / 2, box.height / 2)

const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 10)
console.log(JSON.stringify({
  toolOn, toastNoColor, toastFill, undoEnabled,
  noColorBlocked: near(before, afterNoColor),
  centerFilled: !near(before, filledCenter),
  cornerAlsoFilled: near(filledCenter, filledCorner),
  undoRestored: near(before, afterUndo),
}))
await browser.close()
