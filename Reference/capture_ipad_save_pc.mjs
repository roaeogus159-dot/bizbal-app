// 검증: shouldUseShare 아이패드 감지(UA/터치 모킹) + 데스크톱 다중 저장(9개) 전부 다운로드
import { chromium } from 'playwright'
const errors = []
const browser = await chromium.launch({ channel: 'chrome', headless: true })

// ── 1) 감지 로직 단위 검증: 여러 기기 UA/maxTouchPoints 조합 ──
async function detect(ua, touch) {
  const ctx = await browser.newContext({ userAgent: ua })
  const page = await ctx.newPage()
  await page.addInitScript((t) => {
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => t })
  }, touch)
  await page.goto('http://localhost:5199/')
  await page.waitForSelector('.home-actions', { timeout: 15000 })
  const res = await page.evaluate(async () => {
    const m = await import('/src/lib/export.ts')
    return m.shouldUseShare()
  })
  await ctx.close()
  return res
}
const IPAD_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const WIN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const detection = {
  ipad_macUA_touch5: await detect(IPAD_UA, 5),   // 아이패드 → true
  iphone: await detect(IPHONE_UA, 5),            // 아이폰 → true
  realMac_noTouch: await detect(MAC_UA, 0),      // 진짜 맥 → false
  winTouchLaptop: await detect(WIN_UA, 10),      // 윈도우 터치랩탑 → false(다운로드)
  winDesktop: await detect(WIN_UA, 0),           // 윈도우 데스크톱 → false
}

// ── 2) 데스크톱: 모두 저장 9개 다운로드 전부 완료되는지 ──
const ctx = await browser.newContext({ acceptDownloads: true })
const page = await ctx.newPage()
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()) })
const downloads = []
page.on('download', (d) => downloads.push(d.suggestedFilename()))
await page.goto('http://localhost:5199/?demo=result')
await page.waitForFunction(() => document.querySelectorAll('.result-img').length >= 3, { timeout: 60000 })
await page.waitForTimeout(1500)
const fileCount = await page.evaluate(() => document.querySelectorAll('.result-img').length)
await page.evaluate(() => { [...document.querySelectorAll('.bottom-bar button')].find((b) => b.textContent.includes('모두 저장')).click() })
await page.waitForTimeout(fileCount * 700 + 2000)
const savedMsg = await page.$eval('.toast', (el) => el.textContent).catch(() => null)

console.log(JSON.stringify({
  detection,
  detectionOk: detection.ipad_macUA_touch5 === true && detection.iphone === true
    && detection.realMac_noTouch === false && detection.winTouchLaptop === false && detection.winDesktop === false,
  resultImgs: fileCount,
  downloadsFired: downloads.length,
  allDownloaded: downloads.length === fileCount,
  sampleNames: downloads.slice(0, 3),
  savedMsg,
  errors,
}, null, 1))
await ctx.close()
await browser.close()
