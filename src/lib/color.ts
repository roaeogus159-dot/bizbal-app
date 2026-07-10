// 색 연산: sRGB → CIELAB(D65), CIEDE2000
// 핫루프(수만 칸 × 85색)에서 객체 할당 없이 돌도록 순수 숫자 함수로 구현.

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const p = (v: number) => Math.round(v).toString(16).padStart(2, '0')
  return `#${p(r)}${p(g)}${p(b)}`
}

/** 검정 글자가 잘 보이는 밝은 색인지 (인쇄 순번 대비용) */
export function isLight(r: number, g: number, b: number): boolean {
  return 0.299 * r + 0.587 * g + 0.114 * b > 150
}

function srgbLin(v: number): number {
  v /= 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

/** sRGB(0-255) → Lab. out[o..o+2]에 기록 */
export function rgbToLab(
  r: number, g: number, b: number,
  out: Float32Array | number[], o = 0,
): void {
  const R = srgbLin(r), G = srgbLin(g), B = srgbLin(b)
  let X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375
  let Y = R * 0.2126729 + G * 0.7151522 + B * 0.072175
  let Z = R * 0.0193339 + G * 0.119192 + B * 0.9503041
  X /= 0.95047
  Z /= 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(X), fy = f(Y), fz = f(Z)
  out[o] = 116 * fy - 16
  out[o + 1] = 500 * (fx - fy)
  out[o + 2] = 200 * (fy - fz)
}

const RAD = Math.PI / 180
const DEG = 180 / Math.PI
const POW25_7 = Math.pow(25, 7)

/** CIEDE2000 (Sharma 구현 기준) */
export function deltaE2000(
  L1: number, a1: number, b1: number,
  L2: number, a2: number, b2: number,
): number {
  const C1 = Math.sqrt(a1 * a1 + b1 * b1)
  const C2 = Math.sqrt(a2 * a2 + b2 * b2)
  const Cb = (C1 + C2) / 2
  const Cb7 = Math.pow(Cb, 7)
  const G = 0.5 * (1 - Math.sqrt(Cb7 / (Cb7 + POW25_7)))
  const ap1 = (1 + G) * a1
  const ap2 = (1 + G) * a2
  const Cp1 = Math.sqrt(ap1 * ap1 + b1 * b1)
  const Cp2 = Math.sqrt(ap2 * ap2 + b2 * b2)
  let hp1 = Cp1 === 0 ? 0 : Math.atan2(b1, ap1) * DEG
  if (hp1 < 0) hp1 += 360
  let hp2 = Cp2 === 0 ? 0 : Math.atan2(b2, ap2) * DEG
  if (hp2 < 0) hp2 += 360

  const dL = L2 - L1
  const dC = Cp2 - Cp1
  let dhp = 0
  if (Cp1 * Cp2 !== 0) {
    dhp = hp2 - hp1
    if (dhp > 180) dhp -= 360
    else if (dhp < -180) dhp += 360
  }
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dhp / 2) * RAD)

  const Lbp = (L1 + L2) / 2
  const Cbp = (Cp1 + Cp2) / 2
  let hbp: number
  if (Cp1 * Cp2 === 0) hbp = hp1 + hp2
  else {
    const diff = Math.abs(hp1 - hp2)
    if (diff <= 180) hbp = (hp1 + hp2) / 2
    else if (hp1 + hp2 < 360) hbp = (hp1 + hp2 + 360) / 2
    else hbp = (hp1 + hp2 - 360) / 2
  }

  const T =
    1 -
    0.17 * Math.cos((hbp - 30) * RAD) +
    0.24 * Math.cos(2 * hbp * RAD) +
    0.32 * Math.cos((3 * hbp + 6) * RAD) -
    0.2 * Math.cos((4 * hbp - 63) * RAD)
  const dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2))
  const Cbp7 = Math.pow(Cbp, 7)
  const RC = 2 * Math.sqrt(Cbp7 / (Cbp7 + POW25_7))
  const Lm50 = Math.pow(Lbp - 50, 2)
  const SL = 1 + (0.015 * Lm50) / Math.sqrt(20 + Lm50)
  const SC = 1 + 0.045 * Cbp
  const SH = 1 + 0.015 * Cbp * T
  const RT = -Math.sin(2 * dTheta * RAD) * RC

  const l = dL / SL
  const c = dC / SC
  const h = dH / SH
  return Math.sqrt(l * l + c * c + h * h + RT * c * h)
}
