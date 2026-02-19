import { useMemo, useState } from 'react'
import { selectSessionSets } from '../utils/srs'

const LEVELS = ['chunk', 'collocation', 'sentence']

export default function HomeScreen({ profile, wordSets, records, onStartSession, onLogout }) {
  const [flashTime, setFlashTime] = useState(3)
  const [importanceFilter, setImportanceFilter] = useState([3, 2, 1])
  const [levelFilter, setLevelFilter] = useState(['chunk', 'collocation', 'sentence'])

  const toggleImportance = (v) => {
    setImportanceFilter((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v])
  }
  const toggleLevel = (v) => {
    setLevelFilter((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v])
  }

  const filteredSets = useMemo(
    () => wordSets.filter((ws) => levelFilter.includes(ws.level)),
    [wordSets, levelFilter]
  )

  const selectedSets = useMemo(
    () => selectSessionSets(filteredSets, records, importanceFilter, 5),
    [filteredSets, records, importanceFilter]
  )

  return (
    <div className="card">
      <div className="row between">
        <h2>ホーム</h2>
        <button className="btn btn-ghost" onClick={onLogout}>ログアウト</button>
      </div>
      <p className="muted">ユーザー: {profile?.displayName || 'Guest'} ({profile?.role || 'child'})</p>

      <div className="section">
        <label>フラッシュ秒数</label>
        <div className="row">
          {[1, 2, 3, 5].map((s) => (
            <button key={s} className={`chip ${flashTime === s ? 'active' : ''}`} onClick={() => setFlashTime(s)}>{s}s</button>
          ))}
        </div>
      </div>

      <div className="section">
        <label>重要度</label>
        <div className="row">
          {[3, 2, 1, 0].map((v) => (
            <button key={v} className={`chip ${importanceFilter.includes(v) ? 'active' : ''}`} onClick={() => toggleImportance(v)}>
              {'★'.repeat(v) || '☆'}
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <label>レベル</label>
        <div className="row">
          {LEVELS.map((lv) => (
            <button key={lv} className={`chip ${levelFilter.includes(lv) ? 'active' : ''}`} onClick={() => toggleLevel(lv)}>
              {lv}
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <p className="muted">対象セット: {selectedSets.length}</p>
        <button
          className="btn btn-primary"
          disabled={selectedSets.length === 0}
          onClick={() => onStartSession({ flashTime, importanceFilter, levelFilter, sets: selectedSets })}
        >
          セッション開始
        </button>
      </div>
    </div>
  )
}
