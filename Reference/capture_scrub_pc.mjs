// PC 기준: 칠하기 스트로크 되짚기(스크럽 백) 검증
// 픽셀 비교: 칠하기 전 ≠ 칠한 후, 칠하기 전 == 되짚은 후
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'

const OUT = fileURLToPath(new URL('./screenshots/', import.meta.url))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })

await page.goto('http://localhost:5199/?demo=editor')
await page.waitForSelector('.tool-row', { timeout: 30000 })
await page.waitForFunction(() => !!document.querySelector('.used-strip'), { timeout: 30000 })
await page.waitForTimeout(600)

// 진한 색 선택 (색상 바에서 가장 어두운 색 → 배경과 확실히 구분)
await page.evaluate(() => {
  const sw = [...document.querySelectorAll('.used-swatch .swatch')]
  let best = null, bestLum = 999
  for (const el of sw) {
    const m = getComputedStyle(el).backgroundColor.match(/\d+/g)
    if (!m) continue
    const lum = (+m[0] + +m[1] + +m[2]) / 3
    if (lum < bestLum) { bestLum = lum; best = el }
  }
  best.closest('button').click()
})
await page.waitForTimeout(250)

const cv = await page.$('.preview-canvas')
const box = await cv.boundingBox()

// 캔버스 내부 픽셀 읽기 (캔버스 좌표계)
const pixelAt = (x, y) =>
  page.evaluate(([px, py]) => {
    const c = document.querySelector('.preview-canvas')
    const dpr = window.devicePixelRatio || 1
    const d = c.getContext('2d').getImageData(Math.round(px * dpr), Math.round(py * dpr), 1, 1).data
    return [d[0], d[1], d[2]]
  }, [x, y])

// 수평 스트로크 경로: y 중앙, x 300→560 (캔버스 내부 좌표)
const yMid = box.height / 2
const xA = 300, xB = 560
const probe = [xB - 20, yMid] // 스트로크 끝 부근 확인 지점

const before = await pixelAt(...probe)

// ① 앞으로 칠하기 (A→B), 마우스 누른 상태 유지
await page.mouse.move(box.x + xA, box.y + yMid)
await page.mouse.down()
for (let x = xA; x <= xB; x += 8) {
  await page.mouse.move(box.x + x, box.y + yMid)
  await page.waitForTimeout(8)
}
await page.waitForTimeout(250)
const during = await pixelAt(...probe)
await page.screenshot({ path: `${OUT}28_scrub_painted.png` })

// ② 같은 경로를 거꾸로 되짚기 (B→A 절반쯤)
for (let x = xB; x >= (xA + xB) / 2; x -= 8) {
  await page.mouse.move(box.x + x, box.y + yMid)
  await page.waitForTimeout(8)
}
await page.waitForTimeout(250)
const afterScrub = await pixelAt(...probe)
await page.screenshot({ path: `${OUT}29_scrub_back.png` })
await page.mouse.up()

const close = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 8)
console.log(JSON.stringify({
  before, during, afterScrub,
  paintedChanged: !close(before, during),
  scrubRestored: close(before, afterScrub),
}))
await browser.close()
