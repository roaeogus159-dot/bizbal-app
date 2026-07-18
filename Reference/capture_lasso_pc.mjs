// PC 기준: 올가미(자유형) 영역 선택 → 색상 바로 채우기 검증
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'

const OUT = fileURLToPath(new URL('./screenshots/', import.meta.url))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
page.on('dialog', (d) => d.accept())

await page.goto('http://localhost:5199/?demo=editor')
await page.waitForSelector('.used-strip', { timeout: 30000 })
await page.waitForTimeout(600)

// 올가미 도구 선택
await page.evaluate(() => {
  [...document.querySelectorAll('.tool-btn')].find((b) => b.textContent.includes('영역 선택')).click()
})
await page.waitForTimeout(200)
const toolOn = await page.$eval('.tool-btn.on', (el) => el.textContent.trim())

const cv = await page.$('.preview-canvas')
const box = await cv.boundingBox()
const cx = box.x + box.width / 2
const cy = box.y + box.height / 2

// 자유형 원(사각에 가까운 루프) 그리기
const R = 90
const path = []
for (let a = 0; a <= 360; a += 20) {
  const rad = (a * Math.PI) / 180
  path.push([cx + Math.cos(rad) * R, cy + Math.sin(rad) * R])
}
await page.mouse.move(path[0][0], path[0][1])
await page.mouse.down()
for (const [x, y] of path.slice(1)) {
  await page.mouse.move(x, y)
  await page.waitForTimeout(10)
}
await page.mouse.up()
await page.waitForTimeout(300)

const selCount = await page.$eval('.replace-row strong', (el) => el.textContent)
await page.screenshot({ path: `${OUT}40_lasso_selected.png` })

// 선택된 영역을 색상 바 첫 색으로 채우기 전, 대표 픽셀 기록
const pixelAt = (x, y) =>
  page.evaluate(([px, py]) => {
    const c = document.querySelector('.preview-canvas')
    const dpr = window.devicePixelRatio || 1
    const d = c.getContext('2d').getImageData(Math.round(px * dpr), Math.round(py * dpr), 1, 1).data
    return [d[0], d[1], d[2]]
  }, [x, y])

// 진한 색(BB) 팔레트에서 골라 채우기
await page.click('.add-swatch')
await page.waitForSelector('.sheet')
await page.evaluate(() => {
  [...document.querySelectorAll('.palette-cell')].find((b) => b.textContent.trim() === 'BB').click()
})
await page.waitForTimeout(400)
const filled = await pixelAt(box.width / 2, box.height / 2)
const selAfter = await page.$eval('.replace-row strong', (el) => el.textContent)
await page.screenshot({ path: `${OUT}41_lasso_filled.png` })

// 되돌리기 한 번으로 전체 취소되는지
const undoEnabled = await page.evaluate(() =>
  !([...document.querySelectorAll('button')].find((x) => x.textContent.includes('되돌리기')).disabled))

console.log(JSON.stringify({ toolOn, selCount, filled, selAfter, undoEnabled,
  isDark: filled[0] < 120 && filled[1] < 80 }))
await browser.close()
