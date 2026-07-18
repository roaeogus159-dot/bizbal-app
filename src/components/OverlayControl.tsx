// 미리보기 우상단 플로팅 컨트롤: 원본 사진 오버레이 + 인쇄 도안식 격자 보기
import { useProject } from '../state/store'

export default function OverlayControl() {
  const overlayOn = useProject((s) => s.overlayOn)
  const overlayAlpha = useProject((s) => s.overlayAlpha)
  const setOverlay = useProject((s) => s.setOverlay)
  const chartOn = useProject((s) => s.chartOn)
  const setChart = useProject((s) => s.setChart)
  const image = useProject((s) => s.image)

  if (!image) return null

  return (
    <div className="overlay-ctrl" data-guide="overlay">
      <div className="overlay-row">
        <button
          className={`overlay-btn ${overlayOn ? 'on' : ''}`}
          onClick={() => setOverlay(!overlayOn)}
          title="원본 사진을 도안 위에 겹쳐 보기"
        >
          🖼 원본 {overlayOn ? 'ON' : 'OFF'}
        </button>
        {overlayOn && (
          <input
            className="overlay-slider"
            type="range" min={10} max={90} step={5}
            value={Math.round(overlayAlpha * 100)}
            onChange={(e) => setOverlay(true, Number(e.target.value) / 100)}
            title="원본 사진 투명도"
          />
        )}
      </div>
      <div className="overlay-row">
        <button
          className={`overlay-btn ${chartOn ? 'on' : ''}`}
          onClick={() => setChart(!chartOn)}
          title="인쇄 도안처럼 칸 색+순번+5/10칸 선으로 보기"
        >
          🔢 격자 {chartOn ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
  )
}
