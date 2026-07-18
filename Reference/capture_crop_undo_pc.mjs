// PC 검증: 자르기/추가 되돌리기·다시실행 + 편집↔크롭 혼합 시퀀스 안전성
import { chromium } from 'playwright'
const errors = []
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()) })
page.on('dialog', (d) => d.accept())

await page.goto('http://localhost:5199/?demo=editor')
await page.waitForSelector('.used-strip', { timeout: 30000 })
await page.waitForTimeout(600)

const size = () => page.evaluate(() => {
  const t = [...document.querySelectorAll('summary')].find((e) => e.textContent.includes('행·열'))
  return (t.textContent.match(/\d+×\d+/) || [null])[0]
})
const openCrop = () => page.evaluate(() => { const d = [...document.querySelectorAll('details.card')].find((e) => e.textContent.includes('행·열')); if (d) d.open = true })
const crop = (dir, act) => page.evaluate(([d, a]) => {
  const row = [...document.querySelectorAll('.crop-btns')].find((e) => e.querySelector('span')?.textContent === d)
  ;[...row.querySelectorAll('button')].find((b) => b.textContent.includes(a)).click()
}, [dir, act])
const undo = () => page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('되돌리기')); if (!b.disabled) b.click() })
const redo = () => page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('다시실행')); if (!b.disabled) b.click() })
const undoDisabled = () => page.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('되돌리기')).disabled)

await openCrop()
const r = {}
r.start = await size()

// 1) 자르기 → 되돌리기 → 원복
await crop('오른쪽', '자르기'); await page.waitForTimeout(150)
r.afterCrop = await size()
await undo(); await page.waitForTimeout(200)
r.afterUndoCrop = await size()
await redo(); await page.waitForTimeout(200)
r.afterRedoCrop = await size()

// 2) 혼합: 색칠(채우기) → 아래추가 → 색칠 → undo×3 → redo×3, 크래시/에러 없이 복귀
await undo(); await page.waitForTimeout(150) // 크롭 취소 → 원래 크기
r.backToStart = await size()
// 색 고르고 채우기
await page.click('.add-swatch'); await page.waitForSelector('.sheet')
await page.evaluate(() => { [...document.querySelectorAll('.palette-cell')].find((b) => b.textContent.trim() === 'BB').click() })
await page.waitForTimeout(200)
await page.evaluate(() => { [...document.querySelectorAll('.tool-btn')].find((b) => b.textContent.includes('채우기')).click() })
const cv = await page.$('.preview-canvas'); const box = await cv.boundingBox()
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(250)
await openCrop()
await crop('아래', '추가'); await page.waitForTimeout(150)
r.afterMixCrop = await size()
// 또 색칠(다른 색)
await page.click('.add-swatch'); await page.waitForSelector('.sheet')
await page.evaluate(() => { [...document.querySelectorAll('.palette-cell')].find((b) => b.textContent.trim() === 'S').click() })
await page.waitForTimeout(200)
await page.evaluate(() => { [...document.querySelectorAll('.tool-btn')].find((b) => b.textContent.includes('채우기')).click() })
await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3); await page.waitForTimeout(250)
// undo 3회 (색칠2 + 크롭1) → 시작 크기로
await undo(); await page.waitForTimeout(150)
await undo(); await page.waitForTimeout(150)
r.afterUndo2 = await size() // 크롭 취소됨 → start
await undo(); await page.waitForTimeout(150)
r.afterUndo3 = await size()
// redo 3회 → afterMix 크기·색 복원
await redo(); await page.waitForTimeout(150)
await redo(); await page.waitForTimeout(150)
await redo(); await page.waitForTimeout(150)
r.afterRedo3 = await size()
r.undoDisabledEnd = await undoDisabled()
r.errors = errors
console.log(JSON.stringify(r, null, 1))
await browser.close()
