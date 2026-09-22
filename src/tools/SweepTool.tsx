import { useState } from 'react'
import { BrandMark } from '../components/BrandMark'
import { ConfirmFields } from '../components/ConfirmFields'
import { ExcelUpload } from '../components/ExcelUpload'
import { SweepBoard, type SweepAssignments } from '../components/SweepBoard'
import type { ColumnMapping, ExtraLabelOptions, StudentRow } from '../types'

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

interface Props {
  onHome: () => void
}

export function SweepTool({ onHome }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState<string | null>(null)
  const [rawRows, setRawRows] = useState<StudentRow[]>([])
  const [mappings, setMappings] = useState<ColumnMapping[]>([])
  const [extras, setExtras] = useState<ExtraLabelOptions>(defaultExtras)
  const [assignments, setAssignments] = useState<SweepAssignments>(emptyAssign)

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
    <div className={`app step-${step === 'assign' ? 'seat' : step}`}>
      {showChrome && (
        <header className="site-header no-print">
          <div className="brand">
            <BrandMark onHome={onHome} />
            <div>
              <h1>排掃地大師</h1>
            </div>
          </div>
          <ol className="step-rail" aria-label="進度">
            <li className={step === 'upload' ? 'is-current' : 'is-done'}>匯入</li>
            <li className={step === 'map' ? 'is-current' : ''}>欄位</li>
            <li>排掃地</li>
          </ol>
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

      {showChrome && (
        <footer className="site-footer no-print">
          <p>匯入名冊後，在內掃／外掃建立工作資料夾，再把學生拖進去。</p>
        </footer>
      )}
    </div>
  )
}
