// PC 검증: 브랜드 추가(비즈팔레트) — 색 수·A/B 접두어·라이브러리 범례/필터/4mm경고·브랜드별 구매계획·CSV·인덱스 안정성
import { chromium } from 'playwright'
const errors = []
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()) })
page.on('dialog', (d) => d.accept())

const r = {}

// 팔레트 모듈 직접 검사
await page.goto('http://localhost:5199/')
await page.waitForSelector('.home-actions', { timeout: 15000 })
r.palette = await page.evaluate(async () => {
  const m = await import('/src/lib/palette.ts')
  const full = m.fullPalette([])
  const A = full.filter((c) => c.brand === 'A')
  const B = full.filter((c) => c.brand === 'B')
  return {
    total: full.length,
    aCount: A.length, bCount: B.length,
    aFirst: A[0]?.name, aIdx: full.indexOf(A[0]),
    bFirst: B[0]?.name, bFirstIdx: full.indexOf(B[0]),
    bLastIdx: full.indexOf(B[B.length - 1]),
    // 4mm 제외 확인
    enAt8: m.enabledIndices([], {}, 8).length,
    enAt4: m.enabledIndices([], {}, 4).length,
  }
})

// 라이브러리: 범례·브랜드 필터·검색
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('색상 라이브러리')).click() })
await page.waitForSelector('.lib-toolbar', { timeout: 10000 })
r.legendHasBoth = await page.evaluate(() => {
  const t = document.querySelector('.brand-legend')?.textContent || ''
  return t.includes('은센') && t.includes('비즈팔레트')
})
// B 브랜드 필터 → 반투명 탭 → B 색만
await page.evaluate(() => { [...document.querySelectorAll('.chip')].find((b) => b.textContent.includes('B 비즈팔레트')).click() })
await page.evaluate(() => { [...document.querySelectorAll('.cat-tabs .tab')].find((b) => b.textContent.includes('반투명')).click() })
await page.waitForTimeout(300)
r.libBnames = await page.$$eval('.color-name', (els) => els.slice(0, 3).map((e) => e.textContent.trim()))

// 변환 → 구매계획에 브랜드 그룹 뜨는지 (B 비즈가 매칭에 쓰이도록 8mm 기본)
await page.goto('http://localhost:5199/?demo=convert')
await page.waitForSelector('.color-list', { timeout: 30000 })
await page.waitForFunction(() => !document.querySelector('.converting-badge'), { timeout: 30000 })
// 개수표에 A/B 접두어 색 이름
r.countNames = await page.$$eval('.color-list .color-name', (els) => els.slice(0, 4).map((e) => e.textContent.trim()))
r.purchaseGroups = await page.$$eval('.purchase-group-head strong', (els) => els.map((e) => e.textContent.trim()))
r.grandTotal = await page.$eval('.purchase .purchase-sum', (el) => el.textContent).catch(() => null)

// CSV 추출 (브랜드 구분 포함)
const [dl] = await Promise.all([
  page.waitForEvent('download', { timeout: 10000 }),
  page.evaluate(() => { [...document.querySelectorAll('.purchase button')].find((b) => b.textContent.includes('CSV')).click() }),
])
r.csvName = dl.suggestedFilename()
const fs = await import('fs')
const csv = fs.readFileSync(await dl.path(), 'utf8')
r.csvHasBrands = csv.includes('은센') || csv.includes('Bead Palette')
r.csvBom = csv.charCodeAt(0) === 0xfeff

r.errors = errors.slice(0, 8)
console.log(JSON.stringify(r, null, 1))
await ctx.close()
await browser.close()
