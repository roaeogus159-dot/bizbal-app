// PC 기준: ① 수정 보존(이어하기) ② 설정 변경 → 3버튼 모달 ③ [유지] 재변환 검증
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
const close = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 10)

// ① BB(버건디)로 스트로크 → 중간 저장
await page.goto('http://localhost:5199/?demo=editor')
await page.waitForSelector('.used-strip', { timeout: 30000 })
await page.waitForTimeout(600)
await page.click('.add-swatch')
await page.waitForSelector('.sheet')
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
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((x) => x.textContent.includes('중간 저장')).click()
})
await page.waitForTimeout(700)

// ② 새 세션 → 이어하기 → 수정 보존 확인 (3초 대기 후에도 유지되는지)
await page.goto('http://localhost:5199/')
await page.waitForSelector('.home-actions', { timeout: 10000 })
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((b) => b.textContent.includes('이어하기')).click()
})
await page.waitForSelector('.preview-canvas', { timeout: 15000 })
await page.waitForTimeout(3000)
const restored = await pixelAt(...probe)
const editPreserved = close(painted, restored)

// ③ 설정 변경(최대 색 수) → 자동 재변환 없이 모달이 떠야 함
await page.evaluate(() => {
  const d = document.querySelector('details.card')
  if (d) d.open = true
})
await page.waitForTimeout(200)
await page.evaluate(() => {
  const sl = document.querySelector('details.card input[type=range]')
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  set.call(sl, '12')
  sl.dispatchEvent(new Event('input', { bubbles: true }))
})
await page.waitForTimeout(700)
const modalShown = await page.evaluate(() => !!document.querySelector('.modal'))
const modalBtns = await page.$$eval('.modal button', (els) => els.map((e) => e.textContent.split('\n')[0].trim()))
await page.screenshot({ path: `${OUT}39_reconvert_modal.png` })

// ④ [세부 수정 사항 유지] → 수정 칸 유지 + 나머지 재변환 (색 수 12로 줄었는지)
await page.evaluate(() => {
  [...document.querySelectorAll('.modal button')].find((b) => b.textContent.includes('유지')).click()
})
await page.waitForFunction(() => !document.querySelector('.converting-badge'), { timeout: 20000 })
await page.waitForTimeout(500)
const afterKeep = await pixelAt(...probe)
const keepPreserved = close(painted, afterKeep)
const colorCount = await page.$eval('.color-list-head .muted', (el) => el.textContent)

console.log(JSON.stringify({ painted, restored, editPreserved, modalShown, modalBtns, afterKeep, keepPreserved, colorCount }))
await browser.close()
