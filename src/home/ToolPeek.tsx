import { StandPreview } from '../components/StandPreview'
import { DEFAULT_DESK, type LayoutSettings, type StudentRow } from '../types'

type PeekKind = 'plates' | 'seats' | 'booth' | 'editor'

const PEEK_STUDENT: StudentRow = {
  rowIndex: 0,
  values: { 姓名: '王小明' },
}

const PEEK_DESK: LayoutSettings = {
  ...DEFAULT_DESK,
  cardDecor: { kind: 'header', color: '#0f6e56', lineStyle: 'dashed' },
  items: [
    {
      id: 'peek-name',
      kind: 'field',
      fieldHeader: '姓名',
      text: '姓名',
      x: 50,
      y: 62,
      fontSizeMm: 24,
      fontWeight: 700,
      align: 'center',
      color: '#10241f',
      fontFamily: 'Noto Sans TC',
    },
  ],
}

export function ToolPeek({ kind }: { kind: PeekKind }) {
  if (kind === 'seats') {
    return (
      <div className="tool-peek" aria-hidden>
        <div className="peek-ui peek-seats">
          <div className="peek-seats-room">
            <span className="peek-seats-board">黑板</span>
            <div className="peek-seats-grid">
              {['王小明', '許小茹', '王小明', '許小茹', '王小明', '許小茹', '王小明', '許小茹'].map((name, i) => (
                <span key={i} className="peek-seats-slot is-on">
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
        <p className="tool-peek-cap">成品預覽</p>
      </div>
    )
  }

  return (
    <div className="tool-peek" aria-hidden>
      <div className="peek-product peek-desk">
        <StandPreview settings={PEEK_DESK} student={PEEK_STUDENT} movable={false} />
      </div>
      <p className="tool-peek-cap">成品預覽</p>
    </div>
  )
}
