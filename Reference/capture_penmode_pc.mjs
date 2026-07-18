// PC + 합성 포인터 검증: 우클릭 팬 / 펜·손가락 분리 / 펜 자동감지 / 핀치 회귀
// 편집 발생 여부는 '되돌리기' 버튼 활성(=undo 추가)로, 화면 이동 여부는 캔버스 이미지 변화로 판정
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

const cv = await page.$('.preview-canvas'); const box = await cv.boundingBox()
const W = box.width, Hh = box.height
const cx = box.x + W / 2, cy = box.y + Hh / 2

const undoEnabled = () => page.evaluate(() =>
  !([...document.querySelectorAll('button')].find((b) => b.textContent.includes('되돌리기')).disabled))
const clearUndo = async () => {
  for (let i = 0; i < 60; i++) {
    const en = await undoEnabled(); if (!en) break
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('되돌리기')).click())
    await page.waitForTimeout(30)
  }
}
const hash = () => page.evaluate(() => document.querySelector('.preview-canvas').toDataURL().length + ':' + document.querySelector('.preview-canvas').toDataURL().slice(2000, 2100))
const tool = (name) => page.evaluate((n) => { [...document.querySelectorAll('.tool-btn')].find((b) => b.textContent.includes(n)).click() }, name)
const penCheckbox = () => page.evaluate(() =>
  [...document.querySelectorAll('.toggle-sm')].find((l) => l.textContent.includes('애플펜 모드'))?.querySelector('input')?.checked)
const setPen = async (on) => { if ((await penCheckbox()) !== on) await page.evaluate(() => [...document.querySelectorAll('.toggle-sm')].find((l) => l.textContent.includes('애플펜 모드')).querySelector('input').click()) }
const pickBB = async () => {
  await page.click('.add-swatch'); await page.waitForSelector('.sheet')
  await page.evaluate(() => { [...document.querySelectorAll('.palette-cell')].find((b) => b.textContent.trim() === 'BB').click() })
  await page.waitForTimeout(150)
}
const synth = (type, x0, y0, x1, y1, button = 0) => page.evaluate(([type, x0, y0, x1, y1, button]) => {
  const c = document.querySelector('.preview-canvas'); const r = c.getBoundingClientRect()
  const mk = (name, X, Y, extra = {}) => c.dispatchEvent(new PointerEvent(name, {
    pointerId: 1, pointerType: type, isPrimary: true, clientX: r.left + X, clientY: r.top + Y, bubbles: true, cancelable: true, ...extra,
  }))
  mk('pointerdown', x0, y0, { button, buttons: button === 2 ? 2 : 1 })
  const steps = 10
  for (let i = 1; i <= steps; i++) mk('pointermove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps, { buttons: button === 2 ? 2 : 1 })
  mk('pointerup', x1, y1, { button, buttons: 0 })
}, [type, x0, y0, x1, y1, button])

const r = {}
await setPen(false)
await pickBB()
await tool('채우기')

// 1) PC 좌클릭 = 편집(채우기): undo 활성됨
await clearUndo()
await page.mouse.click(cx, cy); await page.waitForTimeout(250)
r.leftClickEdits = await undoEnabled()

// 2) PC 우클릭 드래그 = 팬(편집 아님, 화면 이동): undo 비활성 유지 + 화면 변함
await clearUndo()
const h1 = await hash()
await page.mouse.move(cx, cy); await page.mouse.down({ button: 'right' })
await page.mouse.move(cx + 90, cy + 60, { steps: 8 }); await page.mouse.up({ button: 'right' })
await page.waitForTimeout(200)
r.rightDragNoEdit = !(await undoEnabled())
r.rightDragPans = (await hash()) !== h1

// 3) 펜 자동감지: penMode off + 이동 도구에서 펜 탭 1회 → penMode on + 자동감지 토스트
await setPen(false)
await tool('이동')
await synth('pen', W * 0.5, Hh * 0.5, W * 0.5, Hh * 0.5)
await page.waitForTimeout(250)
r.penAutoOn = await penCheckbox()
r.penToast = await page.$eval('.toast', (el) => el.textContent).catch(() => null)

// 이제 penMode ON. 채우기 도구로 전환
await tool('채우기')

// 4) 펜 모드 ON: 손가락 탭 = 편집 안 함 / 펜 탭 = 편집함
await clearUndo()
await synth('touch', W * 0.6, Hh * 0.6, W * 0.6, Hh * 0.6)
await page.waitForTimeout(200)
r.touchTapNoEdit = !(await undoEnabled())
await synth('pen', W * 0.6, Hh * 0.6, W * 0.6, Hh * 0.6)
await page.waitForTimeout(250)
r.penTapEdits = await undoEnabled()

// 5) 펜 모드 ON: 손가락 드래그 = 팬(편집 안 함, 화면 이동)
await tool('점 선택')
await clearUndo()
const h2 = await hash()
await synth('touch', W * 0.5, Hh * 0.5, W * 0.5 + 130, Hh * 0.5 + 90)
await page.waitForTimeout(200)
r.touchDragNoEdit = !(await undoEnabled())
r.touchDragPans = (await hash()) !== h2

// 6) 핀치(두 손가락) 줌 회귀: 두 touch 포인터 확대 → 화면 변함, 편집 안 함
await clearUndo()
const h3 = await hash()
await page.evaluate(([W, Hh]) => {
  const c = document.querySelector('.preview-canvas'); const r = c.getBoundingClientRect()
  const ev = (name, id, X, Y) => c.dispatchEvent(new PointerEvent(name, { pointerId: id, pointerType: 'touch', clientX: r.left + X, clientY: r.top + Y, bubbles: true, cancelable: true, buttons: 1 }))
  ev('pointerdown', 1, W * 0.4, Hh * 0.5); ev('pointerdown', 2, W * 0.6, Hh * 0.5)
  for (let i = 1; i <= 10; i++) { ev('pointermove', 1, W * 0.4 - i * 6, Hh * 0.5); ev('pointermove', 2, W * 0.6 + i * 6, Hh * 0.5) }
  ev('pointerup', 1, W * 0.4 - 60, Hh * 0.5); ev('pointerup', 2, W * 0.6 + 60, Hh * 0.5)
}, [W, Hh])
await page.waitForTimeout(200)
r.pinchNoEdit = !(await undoEnabled())
r.pinchZooms = (await hash()) !== h3

r.errors = errors
console.log(JSON.stringify(r, null, 1))
await browser.close()
