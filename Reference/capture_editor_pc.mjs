// PC(데스크톱 1280×800) 기준 에디터 개선 검증: 색상 바, 칠하기, 되돌리기, 중간 저장
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'

const OUT = fileURLToPath(new URL('./screenshots/', import.meta.url))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 })

await page.goto('http://localhost:5199/?demo=editor')
await page.waitForSelector('.tool-row', { timeout: 30000 })
await page.waitForFunction(() => !!document.querySelector('.used-strip'), { timeout: 30000 })
await page.waitForTimeout(600)

// 데스크톱 2단 레이아웃 확인
const layout = await page.evaluate(() => {
  const prev = document.querySelector('.preview-area').getBoundingClientRect()
  const ctl = document.querySelector('.controls').getBoundingClientRect()
  return { previewW: Math.round(prev.width), controlsX: Math.round(ctl.x), controlsW: Math.round(ctl.width) }
})

// 색상 바에서 첫 색 클릭 → 칠하기 자동 전환
const stripCount = await page.$$eval('.used-swatch', (els) => els.length)
await page.click('.used-swatch:nth-child(1)')
await page.waitForTimeout(200)
const toolOn = await page.$eval('.tool-btn.on', (el) => el.textContent.trim())

// 마우스 드래그로 칠하기 (대각선 스트로크)
const cv = await page.$('.preview-canvas')
const box = await cv.boundingBox()
await page.mouse.move(box.x + 200, box.y + 200)
await page.mouse.down()
for (let i = 0; i <= 20; i++) {
  await page.mouse.move(box.x + 200 + i * 12, box.y + 200 + i * 8)
  await page.waitForTimeout(14)
}
await page.mouse.up()
await page.waitForTimeout(300)

const afterStroke = await page.evaluate(() => {
  const undo = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('되돌리기'))
  return { undoEnabled: !undo.disabled }
})

// 되돌리기 1번으로 스트로크 전체 취소
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((x) => x.textContent.includes('되돌리기')).click()
})
await page.waitForTimeout(250)
const afterUndo = await page.evaluate(() => {
  const undo = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('되돌리기'))
  const redo = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('다시실행'))
  return { undoDisabled: undo.disabled, redoEnabled: !redo.disabled }
})

// 초기화 → 되돌리기 활성 유지 확인
page.on('dialog', (d) => d.accept())
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((x) => x.textContent.includes('다시실행')).click()
})
await page.waitForTimeout(200)
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((x) => x.textContent.includes('초기화')).click()
})
await page.waitForTimeout(350)
const afterReset = await page.evaluate(() => {
  const undo = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('되돌리기'))
  return { undoEnabledAfterReset: !undo.disabled }
})

// 중간 저장
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((x) => x.textContent.includes('중간 저장')).click()
})
await page.waitForTimeout(300)
const toastText = await page.$eval('.toast', (el) => el.textContent).catch(() => null)

await page.screenshot({ path: `${OUT}26_editor_pc.png` })

// 변환 화면도 PC 확인 1장
await page.goto('http://localhost:5199/?demo=convert')
await page.waitForSelector('.color-list', { timeout: 30000 })
await page.waitForFunction(() => !document.querySelector('.converting-badge'), { timeout: 30000 })
await page.screenshot({ path: `${OUT}27_convert_pc.png` })

console.log(JSON.stringify({ layout, stripCount, toolOn, afterStroke, afterUndo, afterReset, toastText }))
await browser.close()
