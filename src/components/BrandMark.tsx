import logo from '../assets/ttab-logo-circle-v-arc-cut.svg'

interface Props {
  size?: 'md' | 'sm'
  onHome?: () => void
}

function Logo({ labelled }: { labelled: boolean }) {
  return <img className="brand-mark-logo" src={logo} alt={labelled ? 'TTAB' : ''} />
}

export function BrandMark({ size = 'md', onHome }: Props) {
  const className = size === 'sm' ? 'brand-mark sm' : 'brand-mark'
  if (onHome) {
    return (
      <button type="button" className={`${className} is-link`} onClick={onHome} aria-label="回到 TTAB 首頁">
        <Logo labelled={false} />
      </button>
    )
  }
  return (
    <span className={className}>
      <Logo labelled />
    </span>
  )
}
