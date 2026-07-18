// 채우기(그림판 페인트통): 탭한 칸과 이어진 같은 색 영역을 계산 (4방향 플러드 필)

/** start 칸과 상하좌우로 이어진 '같은 색' 칸 인덱스 목록 */
export function floodFillRegion(
  grid: Uint16Array, W: number, H: number, start: number,
): number[] {
  const target = grid[start]
  const seen = new Uint8Array(W * H)
  const out: number[] = []
  const stack = [start]
  seen[start] = 1
  while (stack.length) {
    const c = stack.pop()!
    if (grid[c] !== target) continue
    out.push(c)
    const x = c % W
    const y = (c - x) / W
    if (x > 0 && !seen[c - 1]) { seen[c - 1] = 1; stack.push(c - 1) }
    if (x < W - 1 && !seen[c + 1]) { seen[c + 1] = 1; stack.push(c + 1) }
    if (y > 0 && !seen[c - W]) { seen[c - W] = 1; stack.push(c - W) }
    if (y < H - 1 && !seen[c + W]) { seen[c + W] = 1; stack.push(c + W) }
  }
  return out
}
