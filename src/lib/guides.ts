// 화면별 단계 가이드(말풍선 투어) 데이터
// target: CSS 선택자 (없으면 화면 중앙에 일반 안내)
import type { Screen } from '../state/store'

export interface GuideStep {
  target?: string
  title: string
  text: string
}

export const GUIDES: Record<Screen, GuideStep[]> = {
  home: [],
  projects: [],

  convert: [
    {
      title: '사진 변환 화면이에요',
      text: '고른 사진이 비즈 도안으로 자동 변환됩니다. 지금부터 각 부분을 차례로 알려드릴게요.',
    },
    {
      target: '[data-guide="preview"]',
      title: '① 도안 미리보기',
      text: '변환된 비즈 도안이에요. 손가락 두 개(PC는 마우스 휠)로 확대/축소, 드래그로 이동할 수 있어요. 오른쪽 위 [원본] 버튼을 켜면 원본 사진을 겹쳐 비교할 수 있습니다.',
    },
    {
      target: '[data-guide="size-mode"]',
      title: '② 크기 기준 고르기',
      text: '완성 크기를 "가로 몇 cm"로 정할지, "비즈 총 몇 개"로 정할지 선택해요. 값을 바꾸면 1초 뒤 자동으로 적용됩니다.',
    },
    {
      target: '[data-guide="wh"]',
      title: '③ 가로·세로 칸 수',
      text: '칸 수를 직접 조절할 수도 있어요. "비율 고정"이 켜져 있으면 한쪽만 바꿔도 사진 비율에 맞춰 따라와요.',
    },
    {
      target: '[data-guide="diameter"]',
      title: '④ 비즈 지름',
      text: '사용할 비즈 크기(4/6/8mm)를 골라요. 완성 크기 계산에 반영되고, 마지막 선택이 기억됩니다.',
    },
    {
      target: '[data-guide="paint"]',
      title: '⑤ 채색 모드',
      text: '"자동"은 알아서 색을 정해줘요. "전문가"는 원본과 색이 많이 다른 칸을 주황색으로 알려줘요. "직접"은 빈 칸만 만들어 줘서 원하는 색을 처음부터 직접 채울 수 있어요.',
    },
    {
      target: '[data-guide="purchase"]',
      title: '⑥ 구매 계획',
      text: '색깔별로 몇 묶음(100개입) 사야 하는지, 예상 비용이 얼마인지 계산해 줘요. [엑셀(CSV) 추출]을 누르면 구매 목록 파일로 저장됩니다.',
    },
    {
      target: '[data-guide="colors"]',
      title: '⑦ 색상 개수표',
      text: '어떤 색 비즈가 몇 개 필요한지 정리한 표예요. "실제 색상 보기"를 켜면 실제 비즈 사진으로 확인할 수 있어요.',
    },
    {
      target: '[data-guide="actions"]',
      title: '⑧ 다음 단계로!',
      text: '도안이 마음에 들면 [도안 저장]으로 바로 저장하거나, [세부 수정]에서 칸 하나하나 색을 다듬을 수 있어요.',
    },
  ],

  editor: [
    {
      title: '세부 수정 화면이에요',
      text: '마음에 안 드는 칸의 색을 직접 바꿀 수 있어요. 순서대로 알려드릴게요.',
    },
    {
      target: '[data-guide="tools"]',
      title: '① 도구 고르기',
      text: '점 선택: 탭한 칸 선택 · 칠하기: 드래그로 한 칸씩 칠하기 · 영역 채우기: 색을 고르고 자유형으로 빙 둘러 그리면 안쪽이 한 번에 채워져요(큰 영역을 빠르게!) · 같은 색: 같은 색 전부 선택 · 스포이드: 색 집어오기.',
    },
    {
      target: '[data-guide="overlay"]',
      title: '② 원본 사진 겹쳐보기',
      text: '[원본] 버튼을 켜면 원본 사진이 도안 위에 반투명하게 겹쳐져요. 원본과 비교하면서 어색한 칸을 찾아보세요.',
    },
    {
      target: '[data-guide="edit-actions"]',
      title: '③ 선택·되돌리기',
      text: '전체 선택/해제와 되돌리기(실수해도 걱정 없어요!), 초기화(수정 전부 취소) 버튼이에요.',
    },
    {
      target: '[data-guide="replace"]',
      title: '④ 색 교체',
      text: '칸을 선택한 뒤 [색 교체]를 누르면 팔레트가 열려요. 전문가 모드에서 칸 1개를 선택하면 어울리는 색도 추천해 줍니다.',
    },
    {
      target: '[data-guide="used-colors"]',
      title: '⑤ 사용 중인 색상 바',
      text: '지금 도안에 쓰인 색들이에요. 칸을 선택하고 색을 탭하면 바로 교체되고, 선택 없이 탭하면 칠하기용 현재 색이 됩니다.',
    },
    {
      target: '[data-guide="actions"]',
      title: '⑥ 다 됐으면 저장!',
      text: '수정 중간중간 [💾 중간 저장]을 눌러두면 안전해요. 끝나면 [도안 저장]으로 결과 화면으로 이동하세요.',
    },
  ],

  result: [
    {
      title: '도안 결과 화면이에요',
      text: '완성된 도안 3종이 만들어졌어요. 하나씩 살펴볼게요.',
    },
    {
      target: '[data-guide="out-color"]',
      title: '① 휴대폰용 컬러 도안',
      text: '화면으로 보면서 만들기 좋은 컬러 도안이에요. [저장]을 누르면 사진으로 저장됩니다.',
    },
    {
      target: '[data-guide="out-print"]',
      title: '② 인쇄용 A4 도안',
      text: '프린트해서 쓰는 도안이에요. 칸마다 색상 번호가 있고, 마지막 장 범례에서 번호→색이름을 찾을 수 있어요. 큰 도안은 여러 장으로 나뉘어요.',
    },
    {
      target: '[data-guide="out-strand"]',
      title: '③ 세로 줄 순서표',
      text: '비즈발은 세로 줄을 하나씩 꿰어 만들죠? 줄마다 위→아래로 꿸 색과 개수를 순서대로 적어놨어요. 줄 길이도 함께 계산됩니다.',
    },
    {
      target: '[data-guide="actions"]',
      title: '④ 모두 저장',
      text: '[모두 저장]을 누르면 세 가지가 각각 파일로 저장돼요. 아이폰은 공유창에서 "이미지 저장"을 누르면 사진앱에 들어갑니다.',
    },
  ],

  library: [
    {
      title: '색상 라이브러리예요',
      text: '은센에서 파는 85가지 비즈 색을 구경하고, 변환에 쓸 색을 고르는 곳이에요.',
    },
    {
      target: '[data-guide="toolbar"]',
      title: '① 검색·실제 색상',
      text: '색 이름이나 코드로 검색할 수 있어요. "실제 색상 보기"를 켜면 실제 비즈 사진으로 표시됩니다.',
    },
    {
      target: '[data-guide="bulk"]',
      title: '② 일괄 관리·커스텀 색',
      text: '전체 사용/해제를 한 번에 할 수 있어요. 다른 가게에서 산 비즈가 있다면 [커스텀 색 추가]로 등록하세요 (재질·실제 지름까지 반영돼요).',
    },
    {
      target: '[data-guide="cats"]',
      title: '③ 카테고리',
      text: '단색·투명·반투명·오로라·직접추가 탭으로 나눠 볼 수 있어요.',
    },
    {
      target: '[data-guide="list"]',
      title: '④ 사용할 색 고르기',
      text: '체크를 끄면 그 색은 변환에 사용하지 않아요. 예: 갖고 있는 색만 켜두면 그 색들로만 도안을 만들어 줍니다.',
    },
  ],
}
