// 구매 계획 + 목표가로 자동적용 + CSV 추출 검증 캡처
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const OUT = fileURLToPath(new URL('./screenshots/', import.meta.url))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })

await page.goto('http://localhost:5199/?demo=convert')
await page.waitForSelector('.color-list', { timeout: 20000 })
await page.waitForFunction(() => !document.querySelector('.converting-badge'), { timeout: 20000 })

// 1) 목표 가로 80→50 입력 후 1초 대기 → 자동 적용 확인
const before = await page.$eval('.stepper input', (el) => el.value)
await page.fill('.field-row input[type=number]', '50')
await page.waitForTimeout(1600)
await page.waitForFunction(() => !document.querySelector('.converting-badge'), { timeout: 20000 })
const after = await page.$eval('.stepper input', (el) => el.value)
const sizeInfo = await page.$eval('.size-info', (el) => el.innerText)
console.log(JSON.stringify({ before, after, sizeInfo }))

// 2) 구매 계획 카드 확인 + 내역 펼치기
await page.evaluate(() => {
  document.querySelectorAll('.purchase details')[1].open = true
  document.querySelector('.purchase').scrollIntoView()
})
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}15_purchase.png` })
const total = await page.$eval('.purchase-total', (el) => el.innerText)
console.log(JSON.stringify({ total }))

// 3) CSV 추출 (다운로드 이벤트 확인)
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 10000 }),
  page.click('.purchase-head button'),
])
const path = await download.path()
const csv = readFileSync(path, 'utf8')
console.log(JSON.stringify({
  csvName: download.suggestedFilename(),
  bom: csv.charCodeAt(0) === 0xfeff,
  head: csv.split('\r\n').slice(0, 5),
  tail: csv.split('\r\n').slice(-3),
}))

await browser.close()
console.log('완료')
