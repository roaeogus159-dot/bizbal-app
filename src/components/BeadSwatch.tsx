// 색 스와치: '실제 색상 보기' 켜면 실제 비즈 사진으로 전환 (모든 색 리스트 공통)
// 사진 로드 실패 시 색상 원으로 자동 폴백
import { useState } from 'react'
import { useSettings } from '../state/store'
import type { BeadColor } from '../lib/palette'

export default function BeadSwatch({ color, size = 34 }: { color: BeadColor; size?: number }) {
  const photoView = useSettings((s) => s.photoView)
  const [failed, setFailed] = useState(false)
  if (photoView && color.photo && !failed) {
    return (
      <img
        className="swatch swatch-photo"
        src={color.photo}
        alt={color.name}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <span
      className="swatch"
      style={{ width: size, height: size, background: color.hex }}
      aria-label={color.name}
    />
  )
}
