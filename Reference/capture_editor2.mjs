// 에디터 개선 검증: 색상 바, 실시간 칠하기(스트로크 1회 = undo 1회), 중간 저장
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'

const OUT = fileURLToPath(new URL('./screenshots/', import.meta.url))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })

await page.goto('http://localhost:5199/?demo=editor')
await page.waitForSelector('.tool-row', { timeout: 30000 })
await page.waitForFunction(() => !!document.querySelector('.used-strip'), { timeout: 30000 })
await page.waitForTimeout(500)

// 1) 색상 바 존재 + 스와치 수
const stripCount = await page.$$eval('.used-swatch', (els) => els.length)

// 2) 칠하기: 색상 바에서 색 지정 → 칠하기 도구 자동 전환 확인
await page.click('.used-swatch:nth-child(1)')
await page.waitForTimeout(200)
const toolOn = await page.$eval('.tool-btn.on', (el) => el.textContent.trim())

// 3) 드래그로 칠하기 (수평 스트로크) → undo 스택 1개 확인
const cv = await page.$('.preview-canvas')
const box = await cv.boundingBox()
const y = box.y + box.height / 2
await page.mouse.move(box.x + 80, y)
await page.mouse.down()
for (let x = 90; x <= 260; x += 10) {
  await page.mouse.move(box.x + x, y)
  await page.waitForTimeout(16)
}
await page.screenshot({ path: `${OUT}24_stroke_live.png` }) // 드래그 중(커밋 전) 화면
await page.mouse.up()
await page.waitForTimeout(300)

const undoEnabled = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('되돌리기'))
  return !b.disabled
})

// 4) 되돌리기 1번 → 스트로크 전체 취소 → 다시실행 활성 확인
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((x) => x.textContent.includes('되돌리기')).click()
})
await page.waitForTimeout(300)
const afterUndo = await page.evaluate(() => {
  const undo = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('되돌리기'))
  const redo = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('다시실행'))
  return { undoDisabled: undo.disabled, redoEnabled: !redo.disabled }
})

// 5) 초기화 후에도 되돌리기 가능 확인 (다시 칠하고 초기화)
page.on('dialog', (d) => d.accept())
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((x) => x.textContent.includes('다시실행')).click()
})
await page.waitForTimeout(200)
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((x) => x.textContent.includes('초기화')).click()
})
await page.waitForTimeout(400)
const afterReset = await page.evaluate(() => {
  const undo = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('되돌리기'))
  return { undoEnabledAfterReset: !undo.disabled }
})

// 6) 중간 저장 → 토스트 확인
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((x) => x.textContent.includes('중간 저장')).click()
})
await page.waitForTimeout(300)
const toastText = await page.$eval('.toast', (el) => el.textContent).catch(() => null)
const saved = await page.evaluate(() => !!localStorage.getItem('bizbal-project'))
await page.screenshot({ path: `${OUT}25_editor_new.png` })

console.log(JSON.stringify({ stripCount, toolOn, undoEnabled, afterUndo, afterReset, toastText, saved }))
await browser.close()
