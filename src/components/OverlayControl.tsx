// 원본 사진 오버레이 토글 + 투명도 슬라이더 (미리보기 우상단 플로팅)
import { useProject } from '../state/store'

export default function OverlayControl() {
  const overlayOn = useProject((s) => s.overlayOn)
  const overlayAlpha = useProject((s) => s.overlayAlpha)
  const setOverlay = useProject((s) => s.setOverlay)
  const image = useProject((s) => s.image)

  if (!image) return null

  return (
    <div className="overlay-ctrl">
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
  )
}
