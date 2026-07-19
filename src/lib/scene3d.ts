// 3D 완성 미리보기 씬 구성 (three.js)
// - 비즈: 색상별 InstancedMesh 1개(=드로우콜 ≤ 사용색 수). finish별 MeshPhysicalMaterial.
// - 재질 상수는 아크릴(PMMA) 실측 물성 기반. 이 파일 상단에서 미세조정.
// - 시나리오 3종: 창문(역광) / 벽면(천장 면광원, 벽색 지정) / 스튜디오(3점).
import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'

/** 상/하 색 그라데이션 equirect 환경맵 (하늘 느낌) — IBL 반사·투과용 */
function gradientEquirect(top: THREE.Color, bottom: THREE.Color, exponent = 1.6): THREE.DataTexture {
  const w = 16, h = 128
  const data = new Uint8Array(w * h * 4)
  const c = new THREE.Color()
  for (let y = 0; y < h; y++) {
    // y=0(위) → top, y=h-1(아래) → bottom. 위쪽에 하늘색이 넓게
    const t = Math.pow(1 - y / (h - 1), exponent)
    c.copy(bottom).lerp(top, t)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      data[i] = Math.round(c.r * 255)
      data[i + 1] = Math.round(c.g * 255)
      data[i + 2] = Math.round(c.b * 255)
      data[i + 3] = 255
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}
import type { BeadColor } from './palette'
import { EMPTY } from './palette'
import { buildLegend } from './pattern'

// ───────── 재질 상수 (아크릴 8mm 기준 · 미세조정 지점) ─────────
const IOR = 1.49 // PMMA(아크릴) 굴절률
export const MAT = {
  opaque: { roughness: 0.34, clearcoat: 0.55, clearcoatRoughness: 0.18, metalness: 0 },
  transparent: { roughness: 0.04, transmission: 1.0, thicknessScale: 1.0, attenScale: 0.9 },
  semi: { roughness: 0.26, transmission: 0.6, thicknessScale: 1.0, attenScale: 0.28, sheen: 0.35 },
  aurora: {
    roughness: 0.14, clearcoat: 1.0, metalness: 0.12, transmission: 0.12,
    iridescence: 1.0, iridescenceIOR: 1.8, iridescenceThicknessRange: [180, 620] as [number, number],
  },
}

let uniformsInited = false

export interface BeadStats {
  beads: number
  colors: number
  wMeters: number
  hMeters: number
}

export type ScenarioKind = 'window' | 'wall' | 'studio'

function makeBeadGeometry(totalBeads: number): THREE.BufferGeometry {
  // 성능 LOD: 알이 많을수록 세그먼트 축소
  const seg = totalBeads > 30000 ? 12 : totalBeads > 12000 ? 16 : 24
  // 살짝 눌린 구 = 아크릴 원형 비즈 느낌
  const g = new THREE.SphereGeometry(0.5, seg, Math.max(8, Math.round(seg * 0.75)))
  g.scale(1, 0.92, 1)
  return g
}

function makeMaterial(color: THREE.Color, finish: BeadColor['finish'], diameterM: number): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({ color })
  m.ior = IOR
  if (finish === 'transparent') {
    const t = MAT.transparent
    m.roughness = t.roughness
    m.transmission = t.transmission
    m.thickness = diameterM * 1000 * t.thicknessScale // three thickness는 월드 단위 (mm 스케일 씬)
    m.attenuationColor = color.clone()
    m.attenuationDistance = diameterM * 1000 * 6 * t.attenScale
    m.clearcoat = 0.3
  } else if (finish === 'semi') {
    const t = MAT.semi
    m.roughness = t.roughness
    m.transmission = t.transmission
    m.thickness = diameterM * 1000 * t.thicknessScale
    m.attenuationColor = color.clone()
    m.attenuationDistance = diameterM * 1000 * 2 * t.attenScale
    m.sheen = t.sheen
    m.sheenColor = new THREE.Color(0xffffff)
  } else if (finish === 'aurora') {
    const t = MAT.aurora
    m.roughness = t.roughness
    m.clearcoat = t.clearcoat
    m.metalness = t.metalness
    m.transmission = t.transmission
    m.thickness = diameterM * 1000
    m.iridescence = t.iridescence
    m.iridescenceIOR = t.iridescenceIOR
    m.iridescenceThicknessRange = t.iridescenceThicknessRange
    m.attenuationColor = color.clone()
    m.attenuationDistance = diameterM * 1000 * 4
  } else {
    const t = MAT.opaque
    m.roughness = t.roughness
    m.clearcoat = t.clearcoat
    m.clearcoatRoughness = t.clearcoatRoughness
    m.metalness = t.metalness
  }
  return m
}

/**
 * 도안 grid → 비즈발 3D 그룹.
 * 씬 단위는 mm (비즈 8mm=8). 상단 커튼봉에서 세로줄이 늘어짐.
 */
export function buildBeadCurtain(
  grid: Uint16Array, W: number, H: number, palette: BeadColor[], diameterMm: number,
): { group: THREE.Group; stats: BeadStats; dispose: () => void } {
  const group = new THREE.Group()
  const d = diameterMm // mm 단위
  const diameterM = diameterMm / 1000
  const curtainW = W * d
  const curtainH = H * d
  const x0 = -curtainW / 2 + d / 2
  const y0 = curtainH / 2 - d / 2

  const legend = buildLegend(grid) // 사용색만 (개수순)
  const geo = makeBeadGeometry(W * H)
  const disposables: { dispose: () => void }[] = [geo]

  // 결정론적 지터(줄이 자연스럽게 흔들림) — Math.random 미사용
  const jitter = (i: number, amp: number) => (Math.sin(i * 12.9898) * 43758.5453 % 1) * amp

  const dummy = new THREE.Object3D()
  let totalBeads = 0
  for (const entry of legend) {
    const idx = entry.paletteIdx
    if (idx === EMPTY) continue
    const c = palette[idx]
    if (!c) continue
    // 이 색 칸 수집
    const positions: number[] = []
    for (let i = 0; i < grid.length; i++) if (grid[i] === idx) positions.push(i)
    if (positions.length === 0) continue

    const col = new THREE.Color(c.hex)
    col.convertSRGBToLinear()
    const mat = makeMaterial(col, c.finish, diameterM)
    disposables.push(mat)
    const inst = new THREE.InstancedMesh(geo, mat, positions.length)
    inst.castShadow = true
    inst.receiveShadow = true
    for (let k = 0; k < positions.length; k++) {
      const p = positions[k]
      const gx = p % W
      const gy = Math.floor(p / W)
      dummy.position.set(
        x0 + gx * d + jitter(p, d * 0.06),
        y0 - gy * d,
        jitter(p * 1.7, d * 0.18), // z 지터 → 줄이 평면이 아니라 살짝 물결
      )
      dummy.scale.setScalar(d)
      dummy.rotation.set(0, jitter(p * 3.1, Math.PI), 0)
      dummy.updateMatrix()
      inst.setMatrixAt(k, dummy.matrix)
    }
    inst.instanceMatrix.needsUpdate = true
    group.add(inst)
    totalBeads += positions.length
  }

  // 세로 줄(실): 열마다 얇은 반투명 나일론 실린더 → 1 InstancedMesh
  const strandGeo = new THREE.CylinderGeometry(d * 0.045, d * 0.045, curtainH, 5)
  disposables.push(strandGeo)
  const strandMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.3, transmission: 0.6, thickness: 1, ior: 1.5, transparent: true, opacity: 0.5,
  })
  disposables.push(strandMat)
  const strands = new THREE.InstancedMesh(strandGeo, strandMat, W)
  for (let x = 0; x < W; x++) {
    dummy.position.set(x0 + x * d, 0, 0)
    dummy.scale.setScalar(1)
    dummy.rotation.set(0, 0, 0)
    dummy.updateMatrix()
    strands.setMatrixAt(x, dummy.matrix)
  }
  strands.instanceMatrix.needsUpdate = true
  group.add(strands)

  // 커튼봉 (상단 원기둥)
  const rodGeo = new THREE.CylinderGeometry(d * 0.6, d * 0.6, curtainW + d * 6, 20)
  disposables.push(rodGeo)
  const rodMat = new THREE.MeshStandardMaterial({ color: 0xb9a889, roughness: 0.5, metalness: 0.3 })
  disposables.push(rodMat)
  const rod = new THREE.Mesh(rodGeo, rodMat)
  rod.rotation.z = Math.PI / 2
  rod.position.set(0, curtainH / 2 + d * 0.4, 0)
  rod.castShadow = true
  group.add(rod)

  return {
    group,
    stats: { beads: totalBeads, colors: legend.filter((e) => e.paletteIdx !== EMPTY).length, wMeters: curtainW / 1000, hMeters: curtainH / 1000 },
    dispose: () => disposables.forEach((o) => o.dispose()),
  }
}

/** 시나리오별 조명·배경·환경맵 구성. 반환 dispose로 정리.
 *  환경맵은 pathtracer 호환 위해 equirect(GradientEquirectTexture)로 통일 — 실시간·패스트레이싱 공용. */
export function buildScenario(
  scene: THREE.Scene,
  _renderer: THREE.WebGLRenderer,
  kind: ScenarioKind,
  curtainH: number, // mm
  wallColor: string,
): { dispose: () => void; env: THREE.Texture } {
  if (!uniformsInited) {
    RectAreaLightUniformsLib.init()
    uniformsInited = true
  }
  const objs: THREE.Object3D[] = []
  const disposables: { dispose: () => void }[] = []

  // 환경맵 (반사·투과 IBL) — 시나리오별 하늘 그라데이션
  let env: THREE.DataTexture
  if (kind === 'window') {
    env = gradientEquirect(new THREE.Color(0xfff2d8), new THREE.Color(0x2a2622))
  } else if (kind === 'wall') {
    const wc = new THREE.Color(wallColor)
    env = gradientEquirect(new THREE.Color(0xffffff), wc.clone().multiplyScalar(0.7))
  } else {
    env = gradientEquirect(new THREE.Color(0xedeaf0), new THREE.Color(0xb2aeb8))
  }
  scene.environment = env
  disposables.push(env)

  const cy = curtainH / 2 // 비즈발 중심 y

  if (kind === 'window') {
    // 방 안쪽에서 창가에 걸린 비즈발을 역광으로 봄
    scene.background = env
    // 창(밝은 하늘) — 비즈발 뒤쪽의 큰 발광면
    const skyGeo = new THREE.PlaneGeometry(curtainH * 2.4, curtainH * 2.2)
    const skyMat = new THREE.MeshBasicMaterial({ color: 0xfff4dc })
    const sky = new THREE.Mesh(skyGeo, skyMat)
    sky.position.set(0, cy, -curtainH * 1.1)
    scene.add(sky); objs.push(sky); disposables.push(skyGeo, skyMat)
    // 창을 실제 광원으로 (역광)
    const win = new THREE.RectAreaLight(0xfff2d8, 9, curtainH * 2, curtainH * 1.8)
    win.position.set(0, cy, -curtainH * 1.05)
    win.lookAt(0, cy, 0)
    scene.add(win); objs.push(win)
    // 앞쪽 약한 채움
    const fill = new THREE.RectAreaLight(0xbfd0e6, 1.2, curtainH * 1.5, curtainH * 1.5)
    fill.position.set(curtainH * 0.6, cy, curtainH * 1.2)
    fill.lookAt(0, cy, 0)
    scene.add(fill); objs.push(fill)
    scene.add(new THREE.AmbientLight(0x30302e, 0.6))
  } else if (kind === 'wall') {
    // 벽 앞에 전시. 천장 조명. 눈높이에서 봄.
    const wc = new THREE.Color(wallColor)
    scene.background = wc.clone()
    // 벽
    const wallGeo = new THREE.PlaneGeometry(curtainH * 4, curtainH * 4)
    const wallMat = new THREE.MeshStandardMaterial({ color: wc, roughness: 0.9 })
    const wall = new THREE.Mesh(wallGeo, wallMat)
    wall.position.set(0, cy, -curtainH * 0.35)
    wall.receiveShadow = true
    scene.add(wall); objs.push(wall); disposables.push(wallGeo, wallMat)
    // 바닥
    const floorGeo = new THREE.PlaneGeometry(curtainH * 4, curtainH * 4)
    const floorMat = new THREE.MeshStandardMaterial({ color: wc.clone().multiplyScalar(0.85), roughness: 0.8 })
    const floor = new THREE.Mesh(floorGeo, floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.position.set(0, -cy - curtainH * 0.05, 0)
    floor.receiveShadow = true
    scene.add(floor); objs.push(floor); disposables.push(floorGeo, floorMat)
    // 천장 면광원 — 실제 비율(천장 2.35m, 비즈발 중심 1.5m, 벽 앞 1m) → 입사각 ~43°
    // 씬은 mm이므로 비즈발 중심 기준 상대 위치로 환산
    const ceil = new THREE.RectAreaLight(0xfff6e8, 6, curtainH * 1.2, curtainH * 1.2)
    ceil.position.set(0, cy + 850, 1000) // +0.85m 위, +1.0m 앞
    ceil.lookAt(0, cy, 0)
    scene.add(ceil); objs.push(ceil)
    scene.add(new THREE.AmbientLight(0xffffff, 0.35))
  } else {
    // 스튜디오: 환경 그라데이션 배경 + 3점 소프트박스
    scene.background = env
    const key = new THREE.RectAreaLight(0xffffff, 6, curtainH, curtainH)
    key.position.set(-curtainH * 0.7, cy + curtainH * 0.5, curtainH * 0.9)
    key.lookAt(0, cy, 0); scene.add(key); objs.push(key)
    const fillL = new THREE.RectAreaLight(0xeaf0ff, 2.5, curtainH, curtainH)
    fillL.position.set(curtainH * 0.9, cy, curtainH * 0.8)
    fillL.lookAt(0, cy, 0); scene.add(fillL); objs.push(fillL)
    const rim = new THREE.RectAreaLight(0xffffff, 5, curtainH * 1.2, curtainH * 0.4)
    rim.position.set(0, cy + curtainH * 0.4, -curtainH * 0.9)
    rim.lookAt(0, cy, 0); scene.add(rim); objs.push(rim)
    scene.add(new THREE.AmbientLight(0xffffff, 0.4))
  }

  return {
    env,
    dispose: () => {
      objs.forEach((o) => scene.remove(o))
      disposables.forEach((o) => o.dispose())
      scene.environment = null
      scene.background = null
    },
  }
}
