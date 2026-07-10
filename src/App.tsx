import { useEffect } from 'react'
import { useProject } from './state/store'
import type { Screen } from './state/store'
import { decodeImage } from './lib/convert'
import Home from './screens/Home'
import Convert from './screens/Convert'
import Editor from './screens/Editor'
import Result from './screens/Result'
import Library from './screens/Library'

const TITLES: Record<Screen, string> = {
  home: '비즈발 도안 생성기',
  convert: '사진 변환',
  editor: '세부 수정',
  result: '도안 결과',
  library: '색상 라이브러리',
}

const BACK: Partial<Record<Screen, Screen>> = {
  convert: 'home',
  editor: 'convert',
  result: 'editor',
}

export default function App() {
  const screen = useProject((s) => s.screen)
  const prevScreen = useProject((s) => s.prevScreen)
  const go = useProject((s) => s.go)
  const setImage = useProject((s) => s.setImage)

  // 데모/검증용: ?demo=convert|editor|result|library 로 샘플 이미지 자동 로드
  useEffect(() => {
    const demo = new URLSearchParams(location.search).get('demo')
    if (!demo) return
    ;(async () => {
      if (demo === 'library') {
        go('library')
        return
      }
      const res = await fetch('/sample.jpg')
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
          <h2>{TITLES[screen]}</h2>
          {screen !== 'library' ? (
            <button className="btn-ghost" onClick={() => go('library')} title="색상 라이브러리">
              🎨
            </button>
          ) : (
            <span className="header-spacer" />
          )}
        </header>
      )}
      <main className={`app-main screen-${screen}`}>
        {screen === 'home' && <Home />}
        {screen === 'convert' && <Convert />}
        {screen === 'editor' && <Editor />}
        {screen === 'result' && <Result />}
        {screen === 'library' && <Library />}
      </main>
    </div>
  )
}
