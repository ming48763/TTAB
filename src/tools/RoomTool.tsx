import { useMemo, useState } from 'react'
import { BrandMark } from '../components/BrandMark'
import { ExcelUpload } from '../components/ExcelUpload'
import { RoomBoard, type RoomPerson } from '../components/RoomBoard'
import { RoomSetup, type RoomSpecDraft } from '../components/RoomSetup'
import { StepRail } from '../components/StepRail'
import { buildRooms, type RoomUnit } from '../lib/roomPlan'
import type { ColumnMapping, StudentRow } from '../types'
import { uid } from '../types'
import { savedData, usePersistWork } from '../lib/workSession'

type Step = 'upload' | 'rooms' | 'assign'

type RoomSnapshot = {
  step: Step
  fileName: string | null
  rawRows: StudentRow[]
  mappings: ColumnMapping[]
  drafts: RoomSpecDraft[]
  rooms: RoomUnit[]
  rolePeople: RoomPerson[]
}

interface Props {
  onHome: () => void
}

function freshDrafts(): RoomSpecDraft[] {
  return Array.from({ length: 5 }, (_, index) => ({
    id: uid('spec'),
    capacity: '6',
    count: '1',
    enabled: index === 0,
  }))
}

export function RoomTool({ onHome }: Props) {
  const saved = savedData<RoomSnapshot>('rooms')
  const [step, setStep] = useState<Step>(saved?.step ?? 'upload')
  const [fileName, setFileName] = useState<string | null>(saved?.fileName ?? null)
  const [rawRows, setRawRows] = useState<StudentRow[]>(saved?.rawRows ?? [])
  const [mappings, setMappings] = useState<ColumnMapping[]>(saved?.mappings ?? [])
  const [drafts, setDrafts] = useState<RoomSpecDraft[]>(saved?.drafts?.length ? saved.drafts : freshDrafts)
  const [rooms, setRooms] = useState<RoomUnit[]>(saved?.rooms ?? [])
  const [rolePeople, setRolePeople] = useState<RoomPerson[]>(saved?.rolePeople ?? [])
  const snapshot = useMemo<RoomSnapshot>(
    () => ({ step, fileName, rawRows, mappings, drafts, rooms, rolePeople }),
    [step, fileName, rawRows, mappings, drafts, rooms, rolePeople],
  )
  usePersistWork('rooms', snapshot)

  function resetToUpload() {
    setStep('upload')
    setFileName(null)
    setRawRows([])
    setMappings([])
    setDrafts(freshDrafts())
    setRooms([])
    setRolePeople([])
  }

  const showChrome = step === 'upload' || step === 'rooms'

  return (
    <div
      className={`app is-master step-${step === 'assign' ? 'seat' : step === 'rooms' ? 'map' : step}${
        step === 'upload' ? ' is-flow' : ''
      }`}
    >
      {showChrome && (
        <header className="site-header no-print">
          <div className="brand">
            <BrandMark onHome={onHome} />
            <div>
              <h1>排房間大師</h1>
            </div>
          </div>
          <StepRail
            steps={[
              { label: '匯入', state: step === 'upload' ? 'is-current' : 'is-done' },
              { label: '房間', state: step === 'rooms' ? 'is-current' : '' },
              { label: '排房間' },
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
              setDrafts(freshDrafts())
              setRooms([])
              setRolePeople([])
              setStep('rooms')
            }}
          />
        )}
        {step === 'rooms' && fileName && (
          <RoomSetup
            drafts={drafts}
            studentCount={rawRows.length}
            onChange={setDrafts}
            onBack={resetToUpload}
            onConfirm={() => {
              setRooms(
                buildRooms(
                  drafts
                    .filter((draft) => draft.enabled)
                    .map((draft) => ({
                      id: draft.id,
                      capacity: Number(draft.capacity),
                      count: Number(draft.count),
                    })),
                  uid,
                ),
              )
              setStep('assign')
            }}
          />
        )}
        {step === 'assign' && (
          <RoomBoard
            rows={rawRows}
            mappings={mappings}
            rooms={rooms}
            roles={rolePeople}
            onRooms={setRooms}
            onRoles={setRolePeople}
            onBack={() => setStep('rooms')}
            onHome={onHome}
          />
        )}
      </main>
    </div>
  )
}
