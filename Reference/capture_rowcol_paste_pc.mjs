// PC 검증: 툴바 2줄 그리드 / 행·열 이동(탭+화살표) / 복사·붙여넣기 / 카톡 공유(다운로드 폴백)
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
const cv = await page.$('.preview-canvas'); const box = await cv.boundingBox()
const W = box.width, Hh = box.height
const tool = (n) => page.evaluate((n) => { [...document.querySelectorAll('.tool-btn')].find((b) => b.textContent.includes(n)).click() }, n)
const hash = () => page.evaluate(() => { const d = document.querySelector('.preview-canvas').toDataURL(); return d.length + ':' + d.slice(3000, 3080) })
const undoBtn = () => page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('되돌리기')))
const undo = () => page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('되돌리기')); if (!b.disabled) b.click() })
const pixelAt = (x, y) => page.evaluate(([px, py]) => {
  const c = document.querySelector('.preview-canvas'); const dpr = window.devicePixelRatio || 1
  const d = c.getContext('2d').getImageData(Math.round(px * dpr), Math.round(py * dpr), 1, 1).data
  return [d[0], d[1], d[2]]
}, [x, y])

// ① 툴바: 8개, 스크롤 없음, 2줄
r.toolbar = await page.evaluate(() => {
  const row = document.querySelector('.tool-row')
  const btns = [...row.querySelectorAll('.tool-btn')]
  return {
    count: btns.length,
    noScroll: row.scrollWidth <= row.clientWidth + 2,
    twoRows: btns[4].offsetTop > btns[0].offsetTop + 10,
  }
})

// ② 행/열 이동: 탭 → 패널 표시 → ▶ 이동(해시 변화+대상 따라감) → undo → 해제 후 기준 해시와 일치
await tool('행/열 이동')
const h0 = await hash() // 강조 없음 기준
await page.mouse.click(box.x + W / 2, box.y + Hh / 2)
await page.waitForTimeout(200)
r.rowcolInfo1 = await page.$eval('.rowcol-info', (el) => el.textContent.trim()).catch(() => null)
const h1 = await hash() // 강조 있음
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('열 오른쪽')).click() })
await page.waitForTimeout(250)
r.colShiftChanged = (await hash()) !== h1
r.rowcolInfo2 = await page.$eval('.rowcol-info', (el) => el.textContent.trim()).catch(() => null)
await undo(); await page.waitForTimeout(250)
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '해제').click() })
await page.waitForTimeout(250)
r.colShiftUndone = (await hash()) === h0 // 격자 원복 + 강조 해제 = 기준과 동일
// 행 이동도 1회 (undo 활성 신호로 확인)
await page.mouse.click(box.x + W / 2, box.y + Hh / 2)
await page.waitForTimeout(150)
const h2 = await hash()
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('행 아래로')).click() })
await page.waitForTimeout(250)
r.rowShiftChanged = (await hash()) !== h2
await undo(); await page.waitForTimeout(200)
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '해제'); if (b) b.click() })
await page.waitForTimeout(150)

// ③ 복사/붙이기: BB로 영역 만들기 → 같은 색 선택 → 복사 → 다른 곳 탭 → 픽셀 BB화 → undo
await page.click('.add-swatch'); await page.waitForSelector('.sheet')
await page.evaluate(() => { [...document.querySelectorAll('.palette-cell')].find((b) => b.textContent.trim() === 'BB').click() })
await page.waitForTimeout(200)
await tool('칠하기')
const sy = box.y + Hh * 0.35
await page.mouse.move(box.x + W * 0.35, sy); await page.mouse.down()
for (let x = W * 0.35; x <= W * 0.45; x += 6) { await page.mouse.move(box.x + x, sy); await page.waitForTimeout(6) }
await page.mouse.up(); await page.waitForTimeout(200)
await tool('같은 색')
await page.mouse.click(box.x + W * 0.4, sy); await page.waitForTimeout(200)
const selN = await page.$eval('.replace-row strong', (el) => el.textContent)
await tool('복사/붙이기')
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('선택 복사')).click() })
await page.waitForTimeout(200)
r.copied = await page.$eval('.rowcol-info', (el) => el.textContent.trim()).catch(() => null)
const target = [W * 0.6, Hh * 0.75]
const hp0 = await hash()
const undoBefore = await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('되돌리기')).disabled)
await page.mouse.click(box.x + target[0], box.y + target[1])
await page.waitForTimeout(300)
r.selN = selN
r.pasteChanged = (await hash()) !== hp0 // 캔버스 변화
r.pasteToast = await page.$eval('.toast', (el) => el.textContent).catch(() => null)
r.pasteEditRecorded = await page.evaluate(() => !([...document.querySelectorAll('button')].find((b) => b.textContent.includes('되돌리기')).disabled))
void undoBefore
await undo(); await page.waitForTimeout(250)
r.pasteUndone = (await hash()) === hp0
await page.screenshot({ path: `${OUT}48_rowcol_paste.png` })

// ④ 카톡 공유: PC → .bizbal.json 다운로드 폴백
await page.evaluate(() => { document.querySelector('.app-header .back').click() })
await page.waitForTimeout(400)
await page.evaluate(() => { document.querySelector('.app-header .back').click() })
await page.waitForSelector('.home-actions', { timeout: 10000 })
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('내 작업 목록')).click() })
await page.waitForSelector('.proj-row', { timeout: 10000 })
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 10000 }),
  page.evaluate(() => { document.querySelector('.proj-actions button[title="파일로 내보내기"]').click() }),
])
r.shareFallbackFile = download.suggestedFilename()
r.hintHasKakao = await page.evaluate(() => document.querySelector('.library .hint, .controls .hint')?.textContent.includes('카카오톡'))

r.errors = errors
console.log(JSON.stringify(r, null, 1))
await browser.close()
