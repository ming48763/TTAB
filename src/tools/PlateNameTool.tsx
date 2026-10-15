import { useMemo, useState } from 'react'
import { BoothWizard } from '../components/BoothWizard'
import { BrandMark } from '../components/BrandMark'
import { ConfirmFields } from '../components/ConfirmFields'
import { EditModePick } from '../components/EditModePick'
import { ExcelUpload } from '../components/ExcelUpload'
import { StepRail } from '../components/StepRail'
import { LayoutEditor } from '../components/LayoutEditor'
import {
  applySequenceToRows,
  buildLayoutFromConfirm,
  buildMappingsWithExtras,
} from '../lib/buildLayout'
import { applyBadgeSize, applyCardPaperSize } from '../lib/paper'
import type {
  AppStep,
  ColumnMapping,
  ExtraLabelOptions,
  LayoutSettings,
  PlateMode,
  StudentRow,
} from '../types'
import { DEFAULT_BADGE, DEFAULT_DESK } from '../types'

const defaultExtras = (): ExtraLabelOptions => ({
  useSequence: false,
  sequenceStyle: 'az',
  useStatic: false,
  staticLabels: [],
  useImage: false,
  imageSrc: '',
})

export type PlateToolFamily = 'desk' | 'badge'

interface Props {
  family: PlateToolFamily
  onHome: () => void
}

function familyTitle(family: PlateToolFamily) {
  return family === 'badge' ? '名牌製作神器' : '桌牌製作神器'
}

function familyModes(family: PlateToolFamily): PlateMode[] {
  return family === 'badge' ? ['badge-single'] : ['desk']
}

function freshSettings(family: PlateToolFamily, patch?: Partial<LayoutSettings>): LayoutSettings {
  const base = { ...familyBase(family), ...patch }
  return family === 'badge' ? applyBadgeSize(base, base.badgeSize ?? 'conf') : applyCardPaperSize(base, 'A4')
}

function familyBase(family: PlateToolFamily): LayoutSettings {
  return family === 'badge' ? DEFAULT_BADGE : DEFAULT_DESK
}

function cloneSettings(settings: LayoutSettings): LayoutSettings {
  return {
    ...settings,
    items: settings.items.map((item) => ({ ...item })),
    cardDecor: { ...settings.cardDecor },
    badgeLook: settings.badgeLook ? { ...settings.badgeLook } : undefined,
    pendingCenterIds: settings.pendingCenterIds ? [...settings.pendingCenterIds] : undefined,
  }
}

export function PlateNameTool({ family, onHome }: Props) {
  const title = familyTitle(family)
  const allowedModes = familyModes(family)
  const [step, setStep] = useState<AppStep>('upload')
  const [fileName, setFileName] = useState<string | null>(null)
  const [rawRows, setRawRows] = useState<StudentRow[]>([])
  const [mappings, setMappings] = useState<ColumnMapping[]>([])
  const [extras, setExtras] = useState<ExtraLabelOptions>(defaultExtras)
  const [settings, setSettings] = useState<LayoutSettings>(() => freshSettings(family))
  const [boothSeed, setBoothSeed] = useState<LayoutSettings | null>(null)
  const [boothSession, setBoothSession] = useState(0)
  const [editRows, setEditRows] = useState<StudentRow[]>([])
  const [editMappings, setEditMappings] = useState<ColumnMapping[]>([])

  const sample = useMemo(() => editRows[0] ?? null, [editRows])

  function resetToUpload() {
    setStep('upload')
    setFileName(null)
    setRawRows([])
    setMappings([])
    setExtras(defaultExtras())
    setSettings(freshSettings(family))
    setBoothSeed(null)
    setEditRows([])
    setEditMappings([])
  }

  function handleConfirm() {
    const nextMappings = buildMappingsWithExtras(mappings, extras)
    const nextRows = applySequenceToRows(rawRows, extras)
    const built = buildLayoutFromConfirm(mappings, extras, rawRows[0])
    const next: LayoutSettings = freshSettings(family, {
      items: built.items,
      pendingCenterIds: built.pendingCenterIds,
      cardDecor: built.cardDecor,
    })
    setEditMappings(nextMappings)
    setEditRows(nextRows)
    setSettings(next)
    setBoothSeed(cloneSettings(next))
    setStep('choose')
  }

  const showIntroChrome = step === 'upload' || step === 'map' || step === 'choose'
  const modeRailClass =
    step === 'choose' || step === 'booth' ? 'is-current' : step === 'edit' ? 'is-done' : ''

  return (
    <div className={`app step-${step} is-desk`}>
      {showIntroChrome && (
        <header className="site-header no-print">
          <div className="brand">
            <BrandMark onHome={onHome} />
            <div>
              <h1>{title}</h1>
            </div>
          </div>
          <StepRail
            steps={[
              { label: '匯入', state: step === 'upload' ? 'is-current' : 'is-done' },
              { label: '欄位', state: step === 'map' ? 'is-current' : step === 'upload' ? '' : 'is-done' },
              { label: '模式', state: modeRailClass },
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
            onConfirm={handleConfirm}
            showExtrasNote={false}
          />
        )}

        {step === 'choose' && fileName && (
          <EditModePick
            onPickBooth={() => {
              if (boothSeed) setSettings(cloneSettings(boothSeed))
              setBoothSession((n) => n + 1)
              setStep('booth')
            }}
            onPickEditor={() => {
              if (boothSeed) setSettings(cloneSettings(boothSeed))
              setStep('edit')
            }}
            onBack={() => setStep('map')}
          />
        )}

        {step === 'booth' && fileName && (
          <BoothWizard
            key={boothSession}
            settings={settings}
            sample={sample}
            rows={editRows}
            title={title}
            onChange={setSettings}
            onBack={() => setStep('choose')}
          />
        )}

        {step === 'edit' && fileName && (
          <LayoutEditor
            settings={settings}
            mappings={editMappings}
            sample={sample}
            rows={editRows}
            fileName={fileName}
            title={title}
            allowedModes={allowedModes}
            onChange={setSettings}
            onBack={() => setStep('choose')}
            onHome={onHome}
          />
        )}
      </main>
    </div>
  )
}
