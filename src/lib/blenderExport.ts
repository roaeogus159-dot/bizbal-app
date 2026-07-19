// 도안(grid) → Blender 파이썬 스크립트(.py) 생성.
// 데이터(비즈 위치·색·재질)를 스크립트에 통째로 박아, 사용자는 Blender에서 열고 ▶Run만 하면 됨.
// Blender 4.x / Cycles 기준. 좌표계: X=가로, Z=세로(위+), Y=깊이. 단위 m.
import type { BeadColor } from './palette'
import { EMPTY } from './palette'

function srgbToLinear(v: number): number {
  const s = v / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
function hexLin(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) || 0
  const g = parseInt(h.slice(2, 4), 16) || 0
  const b = parseInt(h.slice(4, 6), 16) || 0
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)]
}

export function buildBlenderScript(
  grid: Uint16Array, W: number, H: number, palette: BeadColor[], diameterMm: number,
): string {
  const d = diameterMm / 1000
  const x0 = -((W - 1) / 2) * d
  const ztop = ((H - 1) / 2) * d
  // 앱과 동일한 결정론적 지터(Math.random 미사용)
  const jt = (i: number, amp: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1) * amp
  const round = (n: number) => Math.round(n * 1e5) / 1e5

  // 색(팔레트 인덱스)별 위치 수집
  const byIdx = new Map<number, number[]>()
  for (let p = 0; p < grid.length; p++) {
    const idx = grid[p]
    if (idx === EMPTY || !palette[idx]) continue
    let a = byIdx.get(idx)
    if (!a) { a = []; byIdx.set(idx, a) }
    a.push(p)
  }

  const colorPy: string[] = []
  let total = 0
  for (const [idx, positions] of byIdx) {
    const c = palette[idx]
    const [r, g, b] = hexLin(c.hex)
    const pts: string[] = []
    for (const p of positions) {
      const col = p % W, row = Math.floor(p / W)
      const X = round(x0 + col * d + jt(p, d * 0.06))
      const Z = round(ztop - row * d)
      const Y = round(jt(p * 1.7, d * 0.18))
      pts.push(`(${X},${Y},${Z})`)
    }
    const name = c.code.replace(/[^A-Za-z0-9_]/g, '_')
    colorPy.push(`  {"name":"${name}","rgb":(${round(r)},${round(g)},${round(b)}),"finish":"${c.finish}","pts":[${pts.join(',')}]}`)
    total += positions.length
  }
  const Wm = round(W * d), Hm = round(H * d)
  const colorCount = byIdx.size

  return `# 비즈발 3D — Blender 스크립트 (앱에서 자동 생성)
# ── 사용법 ───────────────────────────────────────────────
#  1) Blender 열기(무료: blender.org)
#  2) 상단 [Scripting] 탭 클릭
#  3) 📁 Open(폴더 아이콘) → 이 파일 선택
#  4) ▶ Run Script(재생 버튼) 클릭 → 비즈발이 자동 생성
#  5) 키보드 F12 → 렌더 완료되면 Image ▸ Save As 로 저장
#  ※ 각도 바꾸려면 뷰포트에서 마우스로 돌린 뒤(넘버패드 0=카메라뷰) 다시 F12
#  ※ Blender 4.x(Cycles) 기준 · 비즈 ${total}알 · ${colorCount}색 · 지름 ${diameterMm}mm
# ────────────────────────────────────────────────────────
import bpy, math

DIAM = ${round(d)}   # 비즈 지름(m)
WM = ${Wm}; HM = ${Hm}   # 커튼 가로·세로(m)
COLORS = [
${colorPy.join(',\n')}
]

# 1) 기존 오브젝트 정리
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
scene = bpy.context.scene
coll = scene.collection

# 2) 베이스 구(색별로 복제해 공유)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=0.5)
_base = bpy.context.active_object
mesh0 = _base.data
for pg in mesh0.polygons:
    pg.use_smooth = True
bpy.data.objects.remove(_base, do_unlink=True)
mesh0.use_fake_user = True

# 3) 재질(마감별) — Principled BSDF (3.x/4.x 소켓명 모두 대응)
def set_in(b, value, *names):
    for n in names:
        if n in b.inputs:
            b.inputs[n].default_value = value
            return
def make_mat(name, rgb, finish):
    mat = bpy.data.materials.new('m_' + name)
    mat.use_nodes = True
    b = mat.node_tree.nodes.get('Principled BSDF')
    set_in(b, (rgb[0], rgb[1], rgb[2], 1.0), 'Base Color')
    set_in(b, 1.49, 'IOR')
    if finish == 'transparent':
        set_in(b, 0.03, 'Roughness')
        set_in(b, 1.0, 'Transmission Weight', 'Transmission')
    elif finish == 'semi':
        set_in(b, 0.22, 'Roughness')
        set_in(b, 0.5, 'Transmission Weight', 'Transmission')
        set_in(b, 0.3, 'Sheen Weight', 'Sheen')
    elif finish == 'aurora':
        set_in(b, 0.12, 'Roughness')
        set_in(b, 1.0, 'Coat Weight', 'Clearcoat')
        set_in(b, 0.5, 'Metallic')
    else:
        set_in(b, 0.35, 'Roughness')
        set_in(b, 0.5, 'Coat Weight', 'Clearcoat')
    return mat

# 4) 비즈 배치(색별 공유 메시 + 링크 복제). 고유 이름으로 대량 생성 최적화.
k = 0
for c in COLORS:
    mesh_c = mesh0.copy()
    mesh_c.materials.clear()
    mesh_c.materials.append(make_mat(c['name'], c['rgb'], c['finish']))
    for (x, y, z) in c['pts']:
        ob = bpy.data.objects.new('b%d' % k, mesh_c)
        k += 1
        ob.location = (x, y, z)
        ob.scale = (DIAM, DIAM * 0.92, DIAM)  # 살짝 눌린 구
        coll.objects.link(ob)

# 5) 커튼봉
bpy.ops.mesh.primitive_cylinder_add(radius=DIAM * 0.6, depth=WM + DIAM * 6)
rod = bpy.context.active_object
rod.rotation_euler = (0, math.radians(90), 0)
rod.location = (0, 0, HM / 2 + DIAM * 0.6)
rodmat = bpy.data.materials.new('rod'); rodmat.use_nodes = True
_rb = rodmat.node_tree.nodes.get('Principled BSDF')
set_in(_rb, (0.5, 0.42, 0.30, 1.0), 'Base Color'); set_in(_rb, 0.5, 'Roughness'); set_in(_rb, 0.3, 'Metallic')
rod.data.materials.append(rodmat)

# 6) 바닥
bpy.ops.mesh.primitive_plane_add(size=max(WM, HM) * 4)
floor = bpy.context.active_object
floor.location = (0, 0, -HM / 2 - DIAM * 2)
fmat = bpy.data.materials.new('floor'); fmat.use_nodes = True
_fb = fmat.node_tree.nodes.get('Principled BSDF')
set_in(_fb, (0.80, 0.79, 0.82, 1.0), 'Base Color'); set_in(_fb, 0.6, 'Roughness')
floor.data.materials.append(fmat)

# 7) 월드(하늘 조명) — Nishita 하늘로 유리에 자연광 반사/그림자
world = bpy.data.worlds.new('World'); scene.world = world; world.use_nodes = True
_wn = world.node_tree; _bg = _wn.nodes['Background']
try:
    _sky = _wn.nodes.new('ShaderNodeTexSky')
    _sky.sky_type = 'NISHITA'
    _sky.sun_elevation = math.radians(22)
    _sky.sun_rotation = math.radians(-25)
    _wn.links.new(_sky.outputs[0], _bg.inputs[0])
except Exception:
    _bg.inputs[0].default_value = (0.9, 0.93, 1.0, 1.0)
_bg.inputs[1].default_value = 1.0

# 8) 카메라(살짝 3/4 각도, 커튼 중앙 응시)
cam = bpy.data.cameras.new('Cam'); cam.lens = 42
cob = bpy.data.objects.new('Cam', cam); coll.objects.link(cob)
D = max(WM, HM) * 1.5 + 0.4
cob.location = (WM * 0.2, -D, HM * 0.05)
tgt = bpy.data.objects.new('Target', None); tgt.location = (0, 0, 0); coll.objects.link(tgt)
con = cob.constraints.new('TRACK_TO'); con.target = tgt
con.track_axis = 'TRACK_NEGATIVE_Z'; con.up_axis = 'UP_Y'
scene.camera = cob

# 9) 렌더 설정 (Cycles + GPU 자동 감지)
scene.render.engine = 'CYCLES'
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for dt in ('OPTIX', 'CUDA', 'HIP', 'METAL', 'ONEAPI'):
        try:
            prefs.compute_device_type = dt
            prefs.get_devices()
            has_gpu = False
            for dev in prefs.devices:
                dev.use = True
                if dev.type != 'CPU':
                    has_gpu = True
            if has_gpu:
                scene.cycles.device = 'GPU'
                break
        except Exception:
            continue
except Exception:
    pass
scene.cycles.samples = 128
try:
    scene.cycles.use_denoising = True
except Exception:
    pass
scene.render.resolution_x = 1600
scene.render.resolution_y = 1200
scene.render.resolution_percentage = 100

print('=== 비즈발 생성 완료! 키보드 F12(또는 Render > Render Image)로 렌더하세요. ===')
`
}
