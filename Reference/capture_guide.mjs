// 단계별 가이드(말풍선 투어) 검증 캡처
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'

const OUT = fileURLToPath(new URL('./screenshots/', import.meta.url))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })

await page.goto('http://localhost:5199/?demo=convert')
await page.waitForSelector('.color-list', { timeout: 30000 })
await page.waitForFunction(() => !document.querySelector('.converting-badge'), { timeout: 30000 })

// 헤더의 [가이드] 버튼 확인 + 클릭
const btnText = await page.$eval('.guide-open-btn', (el) => el.textContent.trim())
console.log(JSON.stringify({ guideBtn: btnText }))
await page.click('.guide-open-btn')
await page.waitForSelector('.guide-bubble', { timeout: 5000 })
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}16_guide_step1.png` })

// 다음 → 2단계 (미리보기 강조)
await page.evaluate(() => {
  [...document.querySelectorAll('.guide-nav button')].find((b) => b.textContent === '다음').click()
})
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}17_guide_step2.png` })

// 6단계(구매 계획, 스크롤 필요)까지 이동
for (let i = 0; i < 5; i++) {
  await page.evaluate(() => {
    [...document.querySelectorAll('.guide-nav button')].find((b) => b.textContent === '다음')?.click()
  })
  await page.waitForTimeout(450)
}
await page.screenshot({ path: `${OUT}18_guide_purchase.png` })

// 진행 표시와 버튼 상태 확인
const state = await page.evaluate(() => ({
  progress: document.querySelector('.guide-progress')?.textContent,
  title: document.querySelector('.guide-bubble h4')?.textContent,
  quit: document.querySelector('.guide-quit')?.textContent,
  hasRing: !!document.querySelector('.guide-ring'),
}))
console.log(JSON.stringify(state))

// 가이드 종료 동작
await page.click('.guide-quit')
await page.waitForTimeout(200)
const closed = await page.evaluate(() => !document.querySelector('.guide-root'))
console.log(JSON.stringify({ closed }))

// 에디터 화면 가이드도 1장
await page.goto('http://localhost:5199/?demo=editor')
await page.waitForSelector('.tool-row', { timeout: 30000 })
await page.waitForTimeout(800)
await page.click('.guide-open-btn')
await page.waitForSelector('.guide-bubble', { timeout: 5000 })
await page.evaluate(() => {
  [...document.querySelectorAll('.guide-nav button')].find((b) => b.textContent === '다음').click()
})
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}19_guide_editor.png` })

await browser.close()
console.log('완료')
