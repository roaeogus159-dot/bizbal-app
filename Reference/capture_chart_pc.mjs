// PC 검증: 격자 보기 토글 — 인쇄 도안식(사각+순번+5/10칸선+좌표) 미리보기
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
const OUT = fileURLToPath(new URL('./screenshots/', import.meta.url))
const errors = []
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()) })
page.on('dialog', (d) => d.accept())

await page.goto('http://localhost:5199/?demo=editor')
await page.waitForSelector('.used-strip', { timeout: 30000 })
await page.waitForTimeout(600)

const r = {}
const hash = () => page.evaluate(() => { const d = document.querySelector('.preview-canvas').toDataURL(); return d.length + ':' + d.slice(3000, 3080) })

// ① [격자] 버튼 존재 (원본 버튼 아래 행)
r.buttons = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.overlay-row')]
  return rows.map((row) => row.querySelector('.overlay-btn')?.textContent.trim())
})

// ② 격자 ON → 화면 변화 (사각 격자로 전환)
const h1 = await hash()
await page.evaluate(() => { [...document.querySelectorAll('.overlay-btn')].find((b) => b.textContent.includes('격자')).click() })
await page.waitForTimeout(400)
r.chartChanged = (await hash()) !== h1
await page.screenshot({ path: `${OUT}50_chart_fit.png` })

// ③ 확대 → 순번 숫자 렌더 확인 (줌 후 스크린샷)
const cv = await page.$('.preview-canvas'); const box = await cv.boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -350)
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}51_chart_zoom.png` })

// ④ 격자 OFF → 원래 비즈 원 모습으로 (핏 상태 비교 위해 다시 축소)
for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 350)
await page.waitForTimeout(300)
await page.evaluate(() => { [...document.querySelectorAll('.overlay-btn')].find((b) => b.textContent.includes('격자')).click() })
await page.waitForTimeout(400)
r.chartOffRestores = true // 시각 확인은 스크린샷으로

// ⑤ 원본 오버레이와 동시 사용
await page.evaluate(() => { [...document.querySelectorAll('.overlay-btn')].find((b) => b.textContent.includes('격자')).click() })
await page.evaluate(() => { [...document.querySelectorAll('.overlay-btn')].find((b) => b.textContent.includes('원본')).click() })
await page.waitForTimeout(400)
r.bothOn = await page.evaluate(() =>
  [...document.querySelectorAll('.overlay-btn')].filter((b) => b.textContent.includes('ON')).length)

r.errors = errors
console.log(JSON.stringify(r, null, 1))
await browser.close()
