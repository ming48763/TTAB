import { SAMPLE_ROSTER_FILE, SAMPLE_ROSTER_HREF } from '../lib/sampleRoster'

/** Download link for the bundled sample roster; place under every Excel upload zone. */
export function SampleRosterDownload() {
  return (
    <div className="sample-roster-download">
      <a className="btn ghost" href={SAMPLE_ROSTER_HREF} download={SAMPLE_ROSTER_FILE}>
        測試文件下載
      </a>
    </div>
  )
}
