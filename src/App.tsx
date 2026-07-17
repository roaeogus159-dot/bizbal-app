import { useEffect, useState } from 'react'
import { useProject, useSettings } from './state/store'
import type { Screen } from './state/store'
import { decodeImage } from './lib/convert'
import { GUIDES } from './lib/guides'
import GuideTour from './components/GuideTour'
import Home from './screens/Home'
import Convert from './screens/Convert'
import Editor from './screens/Editor'
import Result from './screens/Result'
import Library from './screens/Library'
import Projects from './screens/Projects'

const TITLES: Record<Screen, string> = {
  home: '비즈발 도안 생성기',
  convert: '사진 변환',
  editor: '세부 수정',
  result: '도안 결과',
  library: '색상 라이브러리',
  projects: '내 작업 목록',
}

const BACK: Partial<Record<Screen, Screen>> = {
  convert: 'home',
  editor: 'convert',
  result: 'editor',
  projects: 'home',
}

export default function App() {
  const screen = useProject((s) => s.screen)
  const prevScreen = useProject((s) => s.prevScreen)
  const go = useProject((s) => s.go)
  const setImage = useProject((s) => s.setImage)
  const [guideOpen, setGuideOpen] = useState(false)
  const theme = useSettings((s) => s.theme)
  const setSetting = useSettings((s) => s.set)

  // 화면이 바뀌면 진행 중이던 가이드 닫기
  useEffect(() => {
    setGuideOpen(false)
  }, [screen])

  // 다크/라이트 테마 적용 (+ 브라우저 상단바 색)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#2e242c' : '#FCE8F0')
  }, [theme])

  const toggleTheme = () => setSetting('theme', theme === 'dark' ? 'light' : 'dark')
  const themeLabel = theme === 'dark' ? '☀️ 라이트' : '🌙 다크'

  // 데모/검증용: ?demo=convert|editor|result|library 로 샘플 이미지 자동 로드
  useEffect(() => {
    const demo = new URLSearchParams(location.search).get('demo')
    if (!demo) return
    ;(async () => {
      if (demo === 'library') {
        go('library')
        return
      }
      const res = await fetch(`${import.meta.env.BASE_URL}sample.jpg`)
      const img = await decodeImage(await res.blob())
      setImage(img)
      go(demo as Screen)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const back = screen === 'library' ? prevScreen : BACK[screen]

  return (
    <div className="app">
      {screen !== 'home' && (
        <header className="app-header">
          <button className="btn-ghost back" onClick={() => go(back ?? 'home')}>
            ‹ 뒤로
          </button>
          {GUIDES[screen].length > 0 && (
            <button className="guide-open-btn" onClick={() => setGuideOpen(true)}>
              💬 가이드
            </button>
          )}
          <h2>{TITLES[screen]}</h2>
          <button className="theme-btn" onClick={toggleTheme} title="라이트/다크 모드 전환">
            {themeLabel}
          </button>
          {screen !== 'library' ? (
            <button className="btn-ghost" onClick={() => go('library')} title="색상 라이브러리">
              🎨
            </button>
          ) : (
            <span className="header-spacer" />
          )}
        </header>
      )}
      {screen === 'home' && (
        <button className="theme-btn theme-btn-float" onClick={toggleTheme} title="라이트/다크 모드 전환">
          {themeLabel}
        </button>
      )}
      <main className={`app-main screen-${screen}`}>
        {screen === 'home' && <Home />}
        {screen === 'convert' && <Convert />}
        {screen === 'editor' && <Editor />}
        {screen === 'result' && <Result />}
        {screen === 'library' && <Library />}
        {screen === 'projects' && <Projects />}
      </main>
      {guideOpen && GUIDES[screen].length > 0 && (
        <GuideTour steps={GUIDES[screen]} onClose={() => setGuideOpen(false)} />
      )}
    </div>
  )
}
