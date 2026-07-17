// PC 기준: 세부 수정 → 중간 저장 → 이어하기 시 수정 보존 확인 + 색상 바 그룹 확인
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'

const OUT = fileURLToPath(new URL('./screenshots/', import.meta.url))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
page.on('dialog', (d) => d.accept())

const pixelAt = (x, y) =>
  page.evaluate(([px, py]) => {
    const c = document.querySelector('.preview-canvas')
    const dpr = window.devicePixelRatio || 1
    const d = c.getContext('2d').getImageData(Math.round(px * dpr), Math.round(py * dpr), 1, 1).data
    return [d[0], d[1], d[2]]
  }, [x, y])

// ① 에디터에서 진한 색으로 스트로크
await page.goto('http://localhost:5199/?demo=editor')
await page.waitForSelector('.used-strip', { timeout: 30000 })
await page.waitForTimeout(600)
await page.click('.add-swatch')
await page.waitForSelector('.sheet', { timeout: 5000 })
await page.evaluate(() => {
  [...document.querySelectorAll('.palette-cell')].find((b) => b.textContent.trim() === 'BB').click()
})
await page.waitForTimeout(300)

const cv = await page.$('.preview-canvas')
const box = await cv.boundingBox()
const yMid = box.y + box.height / 2
await page.mouse.move(box.x + 300, yMid)
await page.mouse.down()
for (let x = 300; x <= 460; x += 8) {
  await page.mouse.move(box.x + x, yMid)
  await page.waitForTimeout(8)
}
await page.mouse.up()
await page.waitForTimeout(300)
const probe = [380, box.height / 2]
const painted = await pixelAt(...probe)

// 색상 바 그룹 라벨 확인
const stripLabels = await page.$$eval('.strip-label', (els) => els.map((e) => e.textContent))
await page.screenshot({ path: `${OUT}37_strip_groups.png` })

// ② 중간 저장
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((x) => x.textContent.includes('중간 저장')).click()
})
await page.waitForTimeout(600)

// ③ 새로고침(홈) → 이어하기 → 수정 보존 확인
await page.goto('http://localhost:5199/')
await page.waitForSelector('.home-actions', { timeout: 10000 })
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((b) => b.textContent.includes('이어하기')).click()
})
await page.waitForSelector('.preview-canvas', { timeout: 15000 })
await page.waitForTimeout(2500) // 예전 버그라면 이 사이 재변환으로 덮어써짐
const badgeSeen = await page.evaluate(() => !!document.querySelector('.converting-badge'))
const restored = await pixelAt(...probe)
await page.screenshot({ path: `${OUT}38_restored.png` })

const close = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 8)
console.log(JSON.stringify({
  painted, restored, stripLabels, badgeSeen,
  editPreserved: close(painted, restored),
}))
await browser.close()
