import { useState } from 'react'
import { BrandMark } from '../components/BrandMark'
import { BusBoard, type BusRolePerson } from '../components/BusBoard'
import { ConfirmFields } from '../components/ConfirmFields'
import { ExcelUpload } from '../components/ExcelUpload'
import { StepRail } from '../components/StepRail'
import { busModel, coachCountForRoster, type BusCoach } from '../lib/busLayout'
import type { ColumnMapping, ExtraLabelOptions, StudentRow } from '../types'
import { uid } from '../types'

function emptyCoach(model = busModel(undefined).id): BusCoach {
  return { id: uid('bus'), name: '', plate: '', model, assignments: {} }
}

function ensureCoaches(current: BusCoach[], people: number): BusCoach[] {
  const model = busModel(current[0]?.model)
  const needed = coachCountForRoster(people, model.seats)
  if (current.length >= needed) return current
  const next = current.length ? [...current] : [emptyCoach(model.id)]
  while (next.length < needed) next.push(emptyCoach(model.id))
  return next
}

const defaultExtras = (): ExtraLabelOptions => ({
  useSequence: false,
  sequenceStyle: 'az',
  useStatic: false,
  staticLabels: [],
  useImage: false,
  imageSrc: '',
})

type Step = 'upload' | 'map' | 'assign'

interface Props {
  onHome: () => void
}

export function BusTool({ onHome }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState<string | null>(null)
  const [rawRows, setRawRows] = useState<StudentRow[]>([])
  const [mappings, setMappings] = useState<ColumnMapping[]>([])
  const [extras, setExtras] = useState<ExtraLabelOptions>(defaultExtras)
  const [coaches, setCoaches] = useState<BusCoach[]>(() => [emptyCoach()])
  const [coachIndex, setCoachIndex] = useState(0)
  const [rolePeople, setRolePeople] = useState<BusRolePerson[]>([])

  function resetToUpload() {
    setStep('upload')
    setFileName(null)
    setRawRows([])
    setMappings([])
    setExtras(defaultExtras())
    setCoaches([emptyCoach()])
    setCoachIndex(0)
    setRolePeople([])
  }

  const showChrome = step === 'upload' || step === 'map'

  return (
    <div className={`app step-${step === 'assign' ? 'seat' : step}`}>
      {showChrome && (
        <header className="site-header no-print">
          <div className="brand">
            <BrandMark onHome={onHome} />
            <div>
              <h1>遊覽車大師</h1>
            </div>
          </div>
          <StepRail
            steps={[
              { label: '匯入', state: step === 'upload' ? 'is-current' : 'is-done' },
              { label: '欄位', state: step === 'map' ? 'is-current' : '' },
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
              setCoaches([emptyCoach()])
              setCoachIndex(0)
              setRolePeople([])
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
              setCoaches((current) => ensureCoaches(current, rawRows.length))
              setStep('assign')
            }}
            showExtras={false}
            confirmLabel="確認，開始排座位"
          />
        )}

        {step === 'assign' && (
          <BusBoard
            rows={rawRows}
            mappings={mappings}
            coaches={coaches}
            coachIndex={coachIndex}
            onCoaches={setCoaches}
            onCoachIndex={setCoachIndex}
            roles={rolePeople}
            onRoles={setRolePeople}
            onBack={() => setStep('map')}
            onHome={onHome}
          />
        )}
      </main>
    </div>
  )
}
