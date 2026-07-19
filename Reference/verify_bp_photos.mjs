// PC 검증: 비즈팔레트(B) 실제 사진 렌더링 — '실제 색상 보기' ON에서 B 비즈가 <img>로 뜨고 실제 로드되는지
import { chromium } from 'playwright'
const errors = []
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()) })

const r = {}
await page.goto('http://localhost:5199/')
await page.waitForSelector('.home-actions', { timeout: 15000 })

// 팔레트에 B 전부 photo 경로가 붙었는지
r.palette = await page.evaluate(async () => {
  const m = await import('/src/lib/palette.ts')
  const B = m.fullPalette([]).filter((c) => c.brand === 'B')
  return { bCount: B.length, allHavePhoto: B.every((c) => !!c.photo), sample: B[0]?.photo, last: B[B.length - 1]?.photo }
})

// 라이브러리 진입 → '실제 색상 보기' 켜기 → B 필터 → 반투명 탭
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('색상 라이브러리')).click() })
await page.waitForSelector('.lib-toolbar', { timeout: 10000 })
// photoView on
await page.evaluate(() => {
  const cb = [...document.querySelectorAll('.toggle-sm input[type=checkbox]')][0]
  if (!cb.checked) cb.click()
})
await page.evaluate(() => { [...document.querySelectorAll('.chip')].find((b) => b.textContent.includes('B 비즈팔레트')).click() })
await page.evaluate(() => { [...document.querySelectorAll('.cat-tabs .tab')].find((b) => b.textContent.includes('반투명')).click() })
await page.waitForTimeout(600)

// B 행들의 스와치가 <img.swatch-photo>이고 실제 로드됐는지(naturalWidth>0)
r.photos = await page.evaluate(async () => {
  const imgs = [...document.querySelectorAll('.color-row img.swatch-photo')]
  await Promise.all(imgs.map((im) => im.complete ? null : new Promise((res) => { im.onload = im.onerror = res })))
  return {
    imgCount: imgs.length,
    loaded: imgs.filter((im) => im.naturalWidth > 0).length,
    broken: imgs.filter((im) => im.naturalWidth === 0).map((im) => im.getAttribute('src')).slice(0, 5),
    firstSrc: imgs[0]?.getAttribute('src'),
  }
})

// 투명 탭도 확인(검은배경 촬영본 B31~B34)
await page.evaluate(() => { [...document.querySelectorAll('.cat-tabs .tab')].find((b) => b.textContent.includes('투명') && !b.textContent.includes('반투명')).click() })
await page.waitForTimeout(500)
r.transparentPhotos = await page.evaluate(async () => {
  const imgs = [...document.querySelectorAll('.color-row img.swatch-photo')]
  await Promise.all(imgs.map((im) => im.complete ? null : new Promise((res) => { im.onload = im.onerror = res })))
  return { imgCount: imgs.length, loaded: imgs.filter((im) => im.naturalWidth > 0).length }
})

r.errors = errors.slice(0, 8)
console.log(JSON.stringify(r, null, 1))
await ctx.close()
await browser.close()
