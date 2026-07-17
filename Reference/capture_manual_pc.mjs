// PC 기준: 직접 채우기 모드 + 최근 색 우선 정렬 + 지우개 검증
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'

const OUT = fileURLToPath(new URL('./screenshots/', import.meta.url))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
page.on('dialog', (d) => d.accept())

await page.goto('http://localhost:5199/?demo=convert')
await page.waitForSelector('.color-list', { timeout: 30000 })
await page.waitForFunction(() => !document.querySelector('.converting-badge'), { timeout: 30000 })

// ① 채색 모드 '직접' 전환 → 빈 격자
await page.evaluate(() => {
  [...document.querySelectorAll('.segmented button')].find((b) => b.textContent === '직접').click()
})
await page.waitForTimeout(700)
const countsHead = await page.$eval('.color-list-head .muted', (el) => el.textContent)
await page.screenshot({ path: `${OUT}30_manual_convert.png` })

// ② 세부 수정으로 이동
await page.evaluate(() => {
  [...document.querySelectorAll('.bottom-bar button')].find((b) => b.textContent.includes('세부 수정')).click()
})
await page.waitForSelector('.used-strip', { timeout: 15000 })
await page.waitForTimeout(400)

// ③ [＋] → 팔레트에서 R(레드) 선택 → 현재 색 지정
await page.click('.add-swatch')
await page.waitForSelector('.sheet', { timeout: 5000 })
const sheetTitle = await page.$eval('.sheet-head strong', (el) => el.textContent)
await page.evaluate(() => {
  [...document.querySelectorAll('.palette-cell')].find((b) => b.textContent.trim() === 'R').click()
})
await page.waitForTimeout(300)

// ④ 칠하기 (수평 스트로크)
const cv = await page.$('.preview-canvas')
const box = await cv.boundingBox()
const yMid = box.y + box.height / 2
await page.mouse.move(box.x + 300, yMid)
await page.mouse.down()
for (let x = 300; x <= 480; x += 8) {
  await page.mouse.move(box.x + x, yMid)
  await page.waitForTimeout(8)
}
await page.mouse.up()
await page.waitForTimeout(300)

// ⑤ [＋] → S(하늘) 선택 → 최근 색 순서 확인 (S가 R보다 앞)
await page.click('.add-swatch')
await page.waitForSelector('.sheet', { timeout: 5000 })
await page.evaluate(() => {
  [...document.querySelectorAll('.palette-cell')].find((b) => b.textContent.trim() === 'S').click()
})
await page.waitForTimeout(300)
const stripOrder = await page.$$eval('.used-strip .used-swatch', (els) =>
  els.map((e) => e.title || e.textContent.trim()).slice(0, 5),
)

// S로 두 번째 스트로크
await page.mouse.move(box.x + 300, yMid + 40)
await page.mouse.down()
for (let x = 300; x <= 420; x += 8) {
  await page.mouse.move(box.x + x, yMid + 40)
  await page.waitForTimeout(8)
}
await page.mouse.up()
await page.waitForTimeout(300)

// ⑥ 지우개로 R 스트로크 일부 지우기 → 픽셀이 빈칸 톤으로 복귀하는지
const probe = [460, box.height / 2] // 캔버스 내부 좌표 (R 스트로크 끝 부근)
const pixelAt = (x, y) =>
  page.evaluate(([px, py]) => {
    const c = document.querySelector('.preview-canvas')
    const dpr = window.devicePixelRatio || 1
    const d = c.getContext('2d').getImageData(Math.round(px * dpr), Math.round(py * dpr), 1, 1).data
    return [d[0], d[1], d[2]]
  }, [x, y])
const paintedPx = await pixelAt(...probe)
await page.click('.eraser-swatch')
await page.waitForTimeout(200)
await page.mouse.move(box.x + 500, yMid)
await page.mouse.down()
for (let x = 500; x >= 430; x -= 8) {
  await page.mouse.move(box.x + x, yMid)
  await page.waitForTimeout(8)
}
await page.mouse.up()
await page.waitForTimeout(300)
const erasedPx = await pixelAt(...probe)

const counts2 = await page.evaluate(() => {
  document.querySelector('.controls').scrollTop = 0
  return null
})
void counts2
await page.screenshot({ path: `${OUT}31_manual_painted.png` })

console.log(JSON.stringify({
  countsHead, sheetTitle, stripOrder,
  paintedPx, erasedPx,
  erasedChanged: paintedPx.join() !== erasedPx.join(),
}))
await browser.close()
