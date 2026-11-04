import { useMemo, useState } from 'react'
import { BrandMark } from '../components/BrandMark'
import { ConfirmFields } from '../components/ConfirmFields'
import { ExcelUpload } from '../components/ExcelUpload'
import { SweepBoard, type SweepAssignments } from '../components/SweepBoard'
import { StepRail } from '../components/StepRail'
import type { ColumnMapping, ExtraLabelOptions, StudentRow } from '../types'
import { savedData, usePersistWork } from '../lib/workSession'

const defaultExtras = (): ExtraLabelOptions => ({
  useSequence: false,
  sequenceStyle: 'az',
  useStatic: false,
  staticLabels: [],
  useImage: false,
  imageSrc: '',
})

const emptyAssign = (): SweepAssignments => ({ pool: [], inner: [], outer: [] })

type Step = 'upload' | 'map' | 'assign'

type SweepSnapshot = {
  step: Step
  fileName: string | null
  rawRows: StudentRow[]
  mappings: ColumnMapping[]
  extras: ExtraLabelOptions
  assignments: SweepAssignments
}

interface Props {
  onHome: () => void
}

export function SweepTool({ onHome }: Props) {
  const saved = savedData<SweepSnapshot>('sweep')
  const [step, setStep] = useState<Step>(saved?.step ?? 'upload')
  const [fileName, setFileName] = useState<string | null>(saved?.fileName ?? null)
  const [rawRows, setRawRows] = useState<StudentRow[]>(saved?.rawRows ?? [])
  const [mappings, setMappings] = useState<ColumnMapping[]>(saved?.mappings ?? [])
  const [extras, setExtras] = useState<ExtraLabelOptions>(saved?.extras ?? defaultExtras)
  const [assignments, setAssignments] = useState<SweepAssignments>(saved?.assignments ?? emptyAssign)
  const snapshot = useMemo<SweepSnapshot>(
    () => ({ step, fileName, rawRows, mappings, extras, assignments }),
    [step, fileName, rawRows, mappings, extras, assignments],
  )
  usePersistWork('sweep', snapshot)

  function resetToUpload() {
    setStep('upload')
    setFileName(null)
    setRawRows([])
    setMappings([])
    setExtras(defaultExtras())
    setAssignments(emptyAssign())
  }

  const showChrome = step === 'upload' || step === 'map'

  return (
    <div className={`app is-flow is-master step-${step === 'assign' ? 'seat' : step}`}>
      {showChrome && (
        <header className="site-header no-print">
          <div className="brand">
            <BrandMark onHome={onHome} />
            <div>
              <h1>排掃地大師</h1>
            </div>
          </div>
          <StepRail
            steps={[
              { label: '匯入', state: step === 'upload' ? 'is-current' : 'is-done' },
              { label: '欄位', state: step === 'map' ? 'is-current' : '' },
              { label: '排掃地' },
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
              setAssignments(emptyAssign())
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
            onConfirm={() => setStep('assign')}
            showExtras={false}
            confirmLabel="確認，開始排掃地"
          />
        )}

        {step === 'assign' && (
          <SweepBoard
            rows={rawRows}
            mappings={mappings}
            assignments={assignments}
            onAssign={setAssignments}
            onBack={() => setStep('map')}
            onHome={onHome}
          />
        )}
      </main>
    </div>
  )
}
