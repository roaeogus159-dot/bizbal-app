// 원본 오버레이 기능 확인용 캡처: 에디터에서 OFF/ON 비교
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'

const OUT = fileURLToPath(new URL('./screenshots/', import.meta.url))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })

await page.goto('http://localhost:5199/?demo=editor')
await page.waitForSelector('.tool-row', { timeout: 20000 })
await page.waitForFunction(
  () => !document.querySelector('.converting-badge') && document.querySelector('.overlay-ctrl'),
  { timeout: 20000 },
)
await page.waitForTimeout(600)

// 확대해서 비즈가 보이게
const cv = await page.$('.preview-canvas')
const box = await cv.boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -400)
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}12_overlay_off.png` })

// 오버레이 ON
await page.click('.overlay-btn')
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}13_overlay_on.png` })

// 투명도 75%로
await page.evaluate(() => {
  const sl = document.querySelector('.overlay-slider')
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  set.call(sl, '75')
  sl.dispatchEvent(new Event('input', { bubbles: true }))
})
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}14_overlay_75.png` })

await browser.close()
console.log('완료')
