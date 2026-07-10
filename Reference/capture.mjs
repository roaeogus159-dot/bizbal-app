// 설명서용 실제 화면 캡처 스크립트 (시스템 Chrome 사용)
// 사용: node Reference/capture.mjs  (dev 서버 http://localhost:5199 필요)
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
import { fileURLToPath } from 'url'

const BASE = 'http://localhost:5199'
const OUT = fileURLToPath(new URL('./screenshots/', import.meta.url))
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })

const shot = (name) => page.screenshot({ path: `${OUT}${name}.png` })
const waitConvert = async () => {
  await page.waitForSelector('.color-list', { timeout: 20000 })
  await page.waitForFunction(() => !document.querySelector('.converting-badge'), { timeout: 20000 })
  await page.waitForTimeout(400)
}

// 1) 홈
await page.goto(BASE)
await page.waitForSelector('.home-actions')
await shot('01_home')

// 2) 변환 화면 (샘플 자동 로드)
await page.goto(`${BASE}/?demo=convert`)
await waitConvert()
await shot('02_convert')

// 3) 변환: 색상 개수표(실제사진 토글 ON)로 스크롤
await page.evaluate(() => {
  const head = document.querySelector('.color-list-head')
  head.querySelector('input').checked || head.querySelector('input').click()
  document.querySelector('.color-list').scrollIntoView()
})
await page.waitForTimeout(600)
await shot('03_counts')

// 4) 에디터 (재질감 끔, 확대해 격자 보이게)
await page.goto(`${BASE}/?demo=editor`)
await page.waitForSelector('.tool-row', { timeout: 20000 })
await page.waitForFunction(() => !!document.querySelector('canvas') &&
  !document.querySelector('.converting-badge'), { timeout: 20000 })
await page.waitForTimeout(600)
// 휠 줌 3회
const cv = await page.$('.preview-canvas')
const box = await cv.boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -400)
await page.waitForTimeout(300)
await shot('04_editor')

// 5) 에디터: 색 교체 시트 (칸 하나 선택 후)
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
await page.waitForTimeout(200)
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('색 교체'))
  if (b && !b.disabled) b.click()
})
await page.waitForTimeout(500)
await shot('05_palette_sheet')
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.sheet-head button')].find((x) => x.textContent === '닫기')
  b?.click()
})

// 6) 결과 화면 (3종 도안 생성 대기)
await page.goto(`${BASE}/?demo=result`)
await page.waitForFunction(() => document.querySelectorAll('.result-img').length >= 3, { timeout: 60000 })
await page.waitForTimeout(800)
await page.setViewportSize({ width: 390, height: 1400 })
await page.waitForTimeout(400)
await shot('06_result')

// 7) 결과: 인쇄 A4 확대
await page.setViewportSize({ width: 390, height: 844 })
await page.evaluate(() => document.querySelectorAll('.result-img')[1]?.scrollIntoView({ block: 'start' }))
await page.waitForTimeout(300)
await shot('07_result_print')

// 8) 줄 순서표
await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.result .card')]
  cards[2]?.scrollIntoView({ block: 'start' })
})
await page.waitForTimeout(300)
await shot('08_result_strand')

// 9) 라이브러리 (실제사진 ON 상태 유지됨)
await page.goto(`${BASE}/?demo=library`)
await page.waitForSelector('.lib-toolbar', { timeout: 15000 })
await page.waitForTimeout(800)
await page.setViewportSize({ width: 390, height: 1100 })
await page.waitForTimeout(300)
await shot('09_library')

// 10) 데스크톱 레이아웃
await page.setViewportSize({ width: 1280, height: 800 })
await page.goto(`${BASE}/?demo=convert`)
await waitConvert()
await shot('10_desktop')

await browser.close()
console.log('캡처 완료 →', OUT)
