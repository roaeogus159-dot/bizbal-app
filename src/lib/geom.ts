// 올가미(자유형) 영역: 그린 경로(다각형)가 감싼 칸들을 계산

/** 다각형(셀 좌표, 자동으로 끝점을 이어 닫음) 내부에 드는 칸 인덱스 목록.
 *  polyX/polyY는 셀 좌표계의 float 꼭짓점, 반환은 grid 인덱스(y*W+x). */
export function enclosedCells(
  polyX: number[], polyY: number[], W: number, H: number,
): number[] {
  const n = polyX.length
  if (n < 3) return []
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (let i = 0; i < n; i++) {
    if (polyX[i] < minX) minX = polyX[i]
    if (polyX[i] > maxX) maxX = polyX[i]
    if (polyY[i] < minY) minY = polyY[i]
    if (polyY[i] > maxY) maxY = polyY[i]
  }
  const x0 = Math.max(0, Math.floor(minX))
  const x1 = Math.min(W - 1, Math.ceil(maxX))
  const y0 = Math.max(0, Math.floor(minY))
  const y1 = Math.min(H - 1, Math.ceil(maxY))
  const out: number[] = []
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5
    for (let x = x0; x <= x1; x++) {
      const cx = x + 0.5
      let inside = false
      for (let i = 0, j = n - 1; i < n; j = i++) {
        if (
          polyY[i] > cy !== polyY[j] > cy &&
          cx < ((polyX[j] - polyX[i]) * (cy - polyY[i])) / (polyY[j] - polyY[i]) + polyX[i]
        ) {
          inside = !inside
        }
      }
      if (inside) out.push(y * W + x)
    }
  }
  return out
}
