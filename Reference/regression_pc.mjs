// PC 종합 회귀 테스트: 전 화면 순회 + 콘솔/페이지 에러 수집 + 핵심 기능 동작 검증
import { chromium } from 'playwright'

const errors = []
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()) })
page.on('dialog', (d) => d.accept())

const B = 'http://localhost:5199'
const results = {}
const waitConv = async () => {
  await page.waitForSelector('.color-list', { timeout: 30000 })
  await page.waitForFunction(() => !document.querySelector('.converting-badge'), { timeout: 30000 })
}
const clickTool = (name) => page.evaluate((n) => {
  [...document.querySelectorAll('.tool-btn')].find((b) => b.textContent.includes(n)).click()
}, name)
const pickPalette = async (code) => {
  await page.click('.add-swatch')
  await page.waitForSelector('.sheet')
  await page.evaluate((c) => { [...document.querySelectorAll('.palette-cell')].find((b) => b.textContent.trim() === c).click() }, code)
  await page.waitForTimeout(200)
}

// 1) 홈 → 라이브러리 → 커스텀 색 추가
await page.goto(B)
await page.waitForSelector('.home-actions')
await page.click('.theme-btn') // 다크
await page.waitForTimeout(200)
await page.click('.theme-btn') // 라이트 복귀
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('색상 라이브러리')).click() })
await page.waitForSelector('.lib-toolbar', { timeout: 10000 })
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('커스텀 색 추가')).click() })
await page.waitForSelector('.sheet')
await page.fill('.sheet input:not([type])', '테스트라벤더')
await page.evaluate(() => { [...document.querySelectorAll('.sheet button')].find((b) => b.textContent.trim() === '추가').click() })
await page.waitForTimeout(300)
results.customAdded = await page.evaluate(() => JSON.parse(localStorage.getItem('bizbal-settings')).state.customColors.length)

// 2) 변환
await page.goto(`${B}/?demo=convert`)
await waitConv()
results.convertColors = await page.$eval('.color-list-head .muted', (el) => el.textContent)

// 3) 세부 수정: 칠하기 + 되짚기, 채우기, 점선택+색교체, undo/redo, 초기화
await page.evaluate(() => { [...document.querySelectorAll('.bottom-bar button')].find((b) => b.textContent.includes('세부 수정')).click() })
await page.waitForSelector('.used-strip', { timeout: 15000 })
await pickPalette('BB')
// 칠하기
await clickTool('칠하기')
const cv = await page.$('.preview-canvas'); const box = await cv.boundingBox()
const ym = box.y + box.height / 2
await page.mouse.move(box.x + 250, ym); await page.mouse.down()
for (let x = 250; x <= 420; x += 10) { await page.mouse.move(box.x + x, ym); await page.waitForTimeout(6) }
await page.mouse.up(); await page.waitForTimeout(200)
results.afterBrushUndo = await page.evaluate(() => !([...document.querySelectorAll('button')].find((b) => b.textContent.includes('되돌리기')).disabled))
// 채우기 도구
await clickTool('채우기')
await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.3)
await page.waitForTimeout(300)
// 점 선택 → 색 교체
await clickTool('점 선택')
await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.6)
await page.waitForTimeout(150)
results.selCount = await page.$eval('.replace-row strong', (el) => el.textContent)
// undo 여러 번
for (let i = 0; i < 3; i++) { await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('되돌리기')); if (!b.disabled) b.click() }); await page.waitForTimeout(120) }
// 초기화
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('초기화')).click() })
await page.waitForTimeout(200)
results.afterResetUndo = await page.evaluate(() => !([...document.querySelectorAll('button')].find((b) => b.textContent.includes('되돌리기')).disabled))
// 중간 저장
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('중간 저장')).click() })
await page.waitForTimeout(600)

// 4) 결과 화면 (3종 생성)
await page.evaluate(() => { [...document.querySelectorAll('.bottom-bar button')].find((b) => b.textContent.includes('도안 저장')).click() })
await page.waitForFunction(() => document.querySelectorAll('.result-img').length >= 3, { timeout: 60000 })
results.resultImgs = await page.$$eval('.result-img', (els) => els.length)

// 5) 내 작업 목록 → 열기
await page.goto(B)
await page.waitForSelector('.home-actions')
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('내 작업 목록')).click() })
await page.waitForSelector('.proj-row', { timeout: 10000 })
results.projCount = await page.$$eval('.proj-row', (els) => els.length)
await page.evaluate(() => document.querySelector('.proj-main').click())
await waitConv()
results.reopened = await page.$eval('.size-info', (el) => el.innerText.replace(/\n/g, ' '))

// 6) 재변환 모달: 세부수정 후 maxColors 변경
await page.evaluate(() => { [...document.querySelectorAll('.bottom-bar button')].find((b) => b.textContent.includes('세부 수정')).click() })
await page.waitForSelector('.used-strip', { timeout: 15000 })
await pickPalette('R'); await clickTool('채우기')
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(300)
await page.evaluate(() => { [...document.querySelectorAll('.bottom-bar button')].find((b) => b.textContent.includes('변환 설정')).click() })
await waitConv()
await page.evaluate(() => { const d = document.querySelector('details.card'); if (d) d.open = true })
await page.waitForTimeout(200)
await page.evaluate(() => { const sl = document.querySelector('details.card input[type=range]'); const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; set.call(sl, '10'); sl.dispatchEvent(new Event('input', { bubbles: true })) })
await page.waitForTimeout(700)
results.modalShown = await page.evaluate(() => !!document.querySelector('.modal'))
results.modalBtns = await page.$$eval('.modal-btn', (els) => els.length)

results.errors = errors
console.log(JSON.stringify(results, null, 1))
await browser.close()
