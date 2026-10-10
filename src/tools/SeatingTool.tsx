import { useState } from 'react'
import { BrandMark } from '../components/BrandMark'
import { ConfirmFields } from '../components/ConfirmFields'
import { ExcelUpload } from '../components/ExcelUpload'
import { SeatingBoard } from '../components/SeatingBoard'
import { SeatingSetup } from '../components/SeatingSetup'
import { StepRail } from '../components/StepRail'
import type { ClassroomDoor, RoomShape, SeatGroupMode } from '../lib/seating'
import type { ColumnMapping, ExtraLabelOptions, StudentRow } from '../types'

const defaultExtras = (): ExtraLabelOptions => ({
  useSequence: false,
  sequenceStyle: 'az',
  useStatic: false,
  staticLabels: [],
  useImage: false,
  imageSrc: '',
})

type Step = 'upload' | 'map' | 'setup' | 'assign'

interface Props {
  onHome: () => void
}

export function SeatingTool({ onHome }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState<string | null>(null)
  const [rawRows, setRawRows] = useState<StudentRow[]>([])
  const [mappings, setMappings] = useState<ColumnMapping[]>([])
  const [extras, setExtras] = useState<ExtraLabelOptions>(defaultExtras)
  const [mode, setMode] = useState<SeatGroupMode>('chess')
  const [rows, setRows] = useState(5)
  const [cols, setCols] = useState(4)
  const [shape, setShape] = useState<RoomShape>('portrait')
  const [doors, setDoors] = useState<ClassroomDoor[]>([])
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  const [setupAtDoors, setSetupAtDoors] = useState(false)

  function resetToUpload() {
    setStep('upload')
    setFileName(null)
    setRawRows([])
    setMappings([])
    setExtras(defaultExtras())
    setDoors([])
    setAssignments({})
  }

  const showChrome = step === 'upload' || step === 'map'

  return (
    <div className={`app step-${step === 'assign' || step === 'setup' ? 'seat' : step}`}>
      {showChrome && (
        <header className="site-header no-print">
          <div className="brand">
            <BrandMark onHome={onHome} />
            <div>
              <h1>排座位大師</h1>
            </div>
          </div>
          <StepRail
            steps={[
              { label: '匯入', state: step === 'upload' ? 'is-current' : 'is-done' },
              { label: '欄位', state: step === 'map' ? 'is-current' : '' },
              { label: '教室' },
              { label: '排座位' },
            ]}
          />
        </header>
      )}

      <main className="site-main">
        {step === 'upload' && (
          <ExcelUpload
            onLoaded={({ fileName: name, rows: nextRows, mappings: nextMappings }) => {
              setFileName(name)
              setRawRows(nextRows)
              setMappings(nextMappings)
              setExtras(defaultExtras())
              setStep('map')
            }}
          />
        )}

        {step === 'map' && fileName && (
          <ConfirmFields
            mappings={mappings}
            rows={rawRows}
            extras={extras}
            onChangeMappings={setMappings}
            onChangeExtras={setExtras}
            onBack={resetToUpload}
            onConfirm={() => {
              setSetupAtDoors(false)
              setStep('setup')
            }}
            showExtras={false}
            confirmLabel="確認，開始排座位"
          />
        )}

        {step === 'setup' && (
          <SeatingSetup
            mode={mode}
            rows={rows}
            cols={cols}
            shape={shape}
            doors={doors}
            studentCount={rawRows.length}
            onMode={(next) => {
              setMode(next)
              setAssignments({})
            }}
            onRows={(n) => {
              setRows(n)
              setAssignments({})
            }}
            onCols={(n) => {
              setCols(n)
              setAssignments({})
            }}
            onShape={setShape}
            onDoors={setDoors}
            onBack={() => setStep('map')}
            onNext={() => setStep('assign')}
            onHome={onHome}
            startPhase={setupAtDoors ? 'doors' : 'mode'}
          />
        )}

        {step === 'assign' && (
          <SeatingBoard
            rows={rawRows}
            mappings={mappings}
            mode={mode}
            gridRows={rows}
            gridCols={cols}
            shape={shape}
            doors={doors}
            assignments={assignments}
            onAssign={setAssignments}
            onBack={() => {
              setSetupAtDoors(true)
              setStep('setup')
            }}
            onHome={onHome}
          />
        )}
      </main>
    </div>
  )
}
