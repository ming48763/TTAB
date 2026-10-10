import { Fragment } from 'react'

export type StepRailState = '' | 'is-current' | 'is-done'

export function StepRail({ steps }: { steps: { label: string; state?: StepRailState }[] }) {
  return (
    <ol className="step-rail is-track" aria-label="進度">
      {steps.map((step, index) => (
        <Fragment key={`${step.label}-${index}`}>
          {index > 0 ? <li className="step-rail-slash" aria-hidden /> : null}
          <li className={step.state || undefined}>{step.label}</li>
        </Fragment>
      ))}
    </ol>
  )
}
