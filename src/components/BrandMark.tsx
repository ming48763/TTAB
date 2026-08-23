interface Props {
  size?: 'md' | 'sm'
  onHome?: () => void
}

export function BrandMark({ size = 'md', onHome }: Props) {
  const className = size === 'sm' ? 'brand-mark sm' : 'brand-mark'
  if (onHome) {
    return (
      <button type="button" className={`${className} is-link`} onClick={onHome} aria-label="回到 TTAB 首頁">
        TTAB
      </button>
    )
  }
  return <span className={className}>TTAB</span>
}
