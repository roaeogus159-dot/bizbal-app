// PC 검증: 실측 지름 반영(줄 길이) + 행/열 자르기·추가
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
const OUT = fileURLToPath(new URL('./screenshots/', import.meta.url))
const errors = []
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()) })
page.on('dialog', (d) => d.accept())

const r = {}

// 실측 지름 순수 검증: 앱 모듈을 직접 import (dev 서버의 ESM)
await page.goto('http://localhost:5199/?demo=convert')
await page.waitForSelector('.color-list', { timeout: 30000 })
await page.waitForFunction(() => !document.querySelector('.converting-badge'), { timeout: 30000 })
r.actual = await page.evaluate(async () => {
  const m = await import('/src/lib/pattern.ts')
  return {
    op8: m.actualBeadMm(8, 'opaque'), semi8: m.actualBeadMm(8, 'semi'),
    tr8: m.actualBeadMm(8, 'transparent'), au8: m.actualBeadMm(8, 'aurora'),
    op6: m.actualBeadMm(6, 'opaque'), tr6: m.actualBeadMm(6, 'transparent'),
    op4: m.actualBeadMm(4, 'opaque'),
  }
})

// 세부 수정 → 크기 확인 → 행/열 편집
await page.evaluate(() => { [...document.querySelectorAll('.bottom-bar button')].find((b) => b.textContent.includes('세부 수정')).click() })
await page.waitForSelector('.used-strip', { timeout: 15000 })
const sizeOf = () => page.evaluate(() => {
  const t = [...document.querySelectorAll('summary')].find((e) => e.textContent.includes('행·열'))
  return t ? (t.textContent.match(/(\d+)×(\d+)/) || [null])[0] : null
})
// details 펼치기
await page.evaluate(() => { const d = [...document.querySelectorAll('details.card')].find((e) => e.textContent.includes('행·열')); if (d) d.open = true })
await page.waitForTimeout(200)
r.sizeBefore = await sizeOf()
// 오른쪽 자르기 2번, 아래 추가 3번
const clickCrop = (dir, act) => page.evaluate(([d, a]) => {
  const rows = [...document.querySelectorAll('.crop-btns')]
  const row = rows.find((e) => e.querySelector('span')?.textContent === d)
  ;[...row.querySelectorAll('button')].find((b) => b.textContent.includes(a)).click()
}, [dir, act])
await clickCrop('오른쪽', '자르기'); await page.waitForTimeout(120)
await clickCrop('오른쪽', '자르기'); await page.waitForTimeout(120)
await clickCrop('아래', '추가'); await page.waitForTimeout(120)
await clickCrop('아래', '추가'); await page.waitForTimeout(120)
await clickCrop('아래', '추가'); await page.waitForTimeout(200)
r.sizeAfter = await sizeOf()
await page.screenshot({ path: `${OUT}46_crop.png` })

// 변환 화면 갔다 와도(크기 유지·재변환 안 함) 크기 그대로인지
await page.evaluate(() => { [...document.querySelectorAll('.bottom-bar button')].find((b) => b.textContent.includes('변환 설정')).click() })
await page.waitForSelector('.size-info', { timeout: 15000 })
await page.waitForTimeout(500)
r.convertSize = await page.$eval('.size-info', (el) => el.innerText.replace(/\n/g, ' '))
r.reconvertModal = await page.evaluate(() => !!document.querySelector('.modal'))

r.errors = errors
console.log(JSON.stringify(r, null, 1))
await browser.close()
