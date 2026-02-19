import { formatNextDue } from '../utils/srs'

export default function StatsScreen({ stats, records, wordSets }) {
  const acc = stats?.totalItems ? Math.round((stats.totalCorrect / stats.totalItems) * 100) : 0
  const recent = Object.entries(records || {}).slice(0, 30)

  return (
    <div className="card">
      <h2>成績</h2>
      <div className="grid3">
        <div className="metric"><div>総セッション</div><strong>{stats?.totalSessions || 0}</strong></div>
        <div className="metric"><div>総正答</div><strong>{stats?.totalCorrect || 0}</strong></div>
        <div className="metric"><div>正答率</div><strong>{acc}%</strong></div>
      </div>
      <div className="section">
        <h3>セット別</h3>
        <div className="stack">
          {wordSets.map((ws) => {
            const rec = records?.[ws.id]
            return (
              <div key={ws.id} className="list-item">
                <div>
                  <div>{ws.level} | {ws.note || ws.id}</div>
                  <div className="muted">次回: {formatNextDue(rec?.nextDue)}</div>
                </div>
                <div>{rec ? `${rec.totalCorrect}/${rec.totalItems}` : '-'}</div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="muted">records: {recent.length}</div>
    </div>
  )
}
