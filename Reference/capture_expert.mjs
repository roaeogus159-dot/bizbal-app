// 전문가 모드 강조 확인용 단건 캡처
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'

const OUT = fileURLToPath(new URL('./screenshots/', import.meta.url))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })

await page.goto('http://localhost:5199/?demo=convert')
await page.waitForSelector('.color-list', { timeout: 20000 })
await page.waitForFunction(() => !document.querySelector('.converting-badge'), { timeout: 20000 })

// 전문가 모드 + 임계값 10
await page.evaluate(() => {
  const seg = [...document.querySelectorAll('.segmented button')].find((b) => b.textContent === '전문가')
  if (!seg.classList.contains('on')) seg.click()
})
await page.waitForTimeout(300)
await page.evaluate(() => {
  const slider = document.querySelector('.field-col input[type=range]')
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  set.call(slider, '10')
  slider.dispatchEvent(new Event('input', { bubbles: true }))
})
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}11_expert_convert.png` })
await browser.close()
console.log('완료')
