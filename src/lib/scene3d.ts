// 3D 완성 미리보기 씬 구성 (three.js)
// - 비즈: 색상별 InstancedMesh 1개(=드로우콜 ≤ 사용색 수). finish별 MeshPhysicalMaterial.
// - 재질 상수는 아크릴(PMMA) 실측 물성 기반. 이 파일 상단에서 미세조정.
// - 시나리오 3종: 창문(역광) / 벽면(천장 면광원, 벽색 지정) / 스튜디오(3점).
import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

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

/** 반사·투과 IBL용 환경맵 — RoomEnvironment를 PMREM 프리필터.
 *  실내 소프트박스 반사가 들어가 유리·오로라 비즈에 사실적인 하이라이트가 생긴다.
 *  (외부 HDRI 파일 불필요 → 오프라인·PWA 안전). renderer 1개당 1회 만들어 공유. */
export function buildEnvironment(renderer: THREE.WebGLRenderer): { texture: THREE.Texture; dispose: () => void } {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const rt = pmrem.fromScene(room, 0.04)
  room.dispose()
  pmrem.dispose()
  return { texture: rt.texture, dispose: () => rt.dispose() }
}

/** 시나리오별 조명·배경 구성. 반환 dispose로 정리.
 *  IBL(scene.environment)은 공용 envTex(RoomEnvironment PMREM). 배경은 시나리오별 그라데이션/색.
 *  그림자: DirectionalLight(그림자 가능)를 키로 추가하고 바닥/벽이 receiveShadow. (RectAreaLight는 그림자 불가) */
export function buildScenario(
  scene: THREE.Scene,
  _renderer: THREE.WebGLRenderer,
  kind: ScenarioKind,
  curtainH: number, // mm
  wallColor: string,
  envTex: THREE.Texture,
): { dispose: () => void } {
  if (!uniformsInited) {
    RectAreaLightUniformsLib.init()
    uniformsInited = true
  }
  const objs: THREE.Object3D[] = []
  const disposables: { dispose: () => void }[] = []

  // 반사·투과 IBL — 공용 RoomEnvironment(PMREM). 역광(window)은 은은하게.
  scene.environment = envTex
  scene.environmentIntensity = kind === 'window' ? 0.5 : 0.85

  const cy = curtainH / 2 // 비즈발 중심 y

  // 그림자 캐스팅 키 라이트 (방향광). 정적 씬이라 카메라와 무관하게 안정적.
  const addKey = (color: number, intensity: number, pos: [number, number, number], shadow = true) => {
    const key = new THREE.DirectionalLight(color, intensity)
    key.position.set(pos[0], pos[1], pos[2])
    const tgt = new THREE.Object3D()
    tgt.position.set(0, cy, 0)
    scene.add(tgt); objs.push(tgt)
    key.target = tgt
    if (shadow) {
      key.castShadow = true
      key.shadow.mapSize.set(2048, 2048)
      const s = curtainH * 1.15
      key.shadow.camera.left = -s; key.shadow.camera.right = s
      key.shadow.camera.top = s; key.shadow.camera.bottom = -s
      key.shadow.camera.near = curtainH * 0.1
      key.shadow.camera.far = curtainH * 8
      key.shadow.bias = -0.0004
      key.shadow.normalBias = curtainH * 0.02 // 구 표면 그림자 여드름 방지
    }
    scene.add(key); objs.push(key)
  }
  const addAmbient = (color: number, intensity: number) => {
    const amb = new THREE.AmbientLight(color, intensity)
    scene.add(amb); objs.push(amb) // objs에 넣어 시나리오 전환 시 제거(누적 방지)
  }

  if (kind === 'window') {
    // 방 안쪽에서 창가에 걸린 비즈발을 역광으로 봄
    const bg = gradientEquirect(new THREE.Color(0xfff2d8), new THREE.Color(0x2a2622))
    scene.background = bg; disposables.push(bg)
    // 창(밝은 하늘) — 비즈발 뒤쪽의 큰 발광면(역광 + 투과 글로우 소스)
    const skyGeo = new THREE.PlaneGeometry(curtainH * 2.4, curtainH * 2.2)
    const skyMat = new THREE.MeshBasicMaterial({ color: 0xfff4dc })
    const sky = new THREE.Mesh(skyGeo, skyMat)
    sky.position.set(0, cy, -curtainH * 1.1)
    scene.add(sky); objs.push(sky); disposables.push(skyGeo, skyMat)
    // 창을 실제 광원으로 (역광)
    const win = new THREE.RectAreaLight(0xfff2d8, 7, curtainH * 2, curtainH * 1.8)
    win.position.set(0, cy, -curtainH * 1.05)
    win.lookAt(0, cy, 0)
    scene.add(win); objs.push(win)
    // 앞쪽 약한 채움
    const fill = new THREE.RectAreaLight(0xbfd0e6, 1.0, curtainH * 1.5, curtainH * 1.5)
    fill.position.set(curtainH * 0.6, cy, curtainH * 1.2)
    fill.lookAt(0, cy, 0)
    scene.add(fill); objs.push(fill)
    // 앞 위 약한 키(입체감; 뒤 배경엔 그림자 리시버가 없어 그림자 off)
    addKey(0xfff0d0, 1.1, [curtainH * 0.4, cy + curtainH * 1.0, curtainH * 1.0], false)
    addAmbient(0x30302e, 0.4)
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
    // 천장 면광원(부드러운 채움) + 그림자용 방향광 — 입사각 ~43°
    const ceil = new THREE.RectAreaLight(0xfff6e8, 4, curtainH * 1.2, curtainH * 1.2)
    ceil.position.set(0, cy + 850, 1000) // +0.85m 위, +1.0m 앞
    ceil.lookAt(0, cy, 0)
    scene.add(ceil); objs.push(ceil)
    addKey(0xfff4e2, 2.4, [curtainH * 0.35, cy + curtainH * 1.0, curtainH * 0.9])
    addAmbient(0xffffff, 0.22)
  } else {
    // 스튜디오: 그라데이션 배경 + 바닥(그림자 리시버) + 3점 소프트박스 + 그림자 키
    const bg = gradientEquirect(new THREE.Color(0xedeaf0), new THREE.Color(0xb2aeb8))
    scene.background = bg; disposables.push(bg)
    const floorGeo = new THREE.PlaneGeometry(curtainH * 4, curtainH * 4)
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xdedbe2, roughness: 0.7 })
    const floor = new THREE.Mesh(floorGeo, floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.position.set(0, -cy - curtainH * 0.05, 0)
    floor.receiveShadow = true
    scene.add(floor); objs.push(floor); disposables.push(floorGeo, floorMat)
    const key = new THREE.RectAreaLight(0xffffff, 4, curtainH, curtainH)
    key.position.set(-curtainH * 0.7, cy + curtainH * 0.5, curtainH * 0.9)
    key.lookAt(0, cy, 0); scene.add(key); objs.push(key)
    const fillL = new THREE.RectAreaLight(0xeaf0ff, 2.0, curtainH, curtainH)
    fillL.position.set(curtainH * 0.9, cy, curtainH * 0.8)
    fillL.lookAt(0, cy, 0); scene.add(fillL); objs.push(fillL)
    const rim = new THREE.RectAreaLight(0xffffff, 4, curtainH * 1.2, curtainH * 0.4)
    rim.position.set(0, cy + curtainH * 0.4, -curtainH * 0.9)
    rim.lookAt(0, cy, 0); scene.add(rim); objs.push(rim)
    addKey(0xffffff, 2.0, [-curtainH * 0.7, cy + curtainH * 0.9, curtainH * 0.8])
    addAmbient(0xffffff, 0.3)
  }

  return {
    dispose: () => {
      objs.forEach((o) => scene.remove(o))
      disposables.forEach((o) => o.dispose())
      scene.environment = null
      scene.background = null
    },
  }
}
