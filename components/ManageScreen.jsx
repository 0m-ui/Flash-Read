import { useState } from 'react'

function parseRows(rows) {
  return rows.map((r, idx) => {
    const items = Object.keys(r)
      .filter((k) => /^item\d+$/i.test(k))
      .map((k) => String(r[k] || '').trim())
      .filter(Boolean)
    return {
      id: r.id || `csv_${Date.now()}_${idx}`,
      level: r.level || 'chunk',
      owner: r.owner || 'shared',
      importance: Number(r.importance ?? 1),
      note: r.note || '',
      items
    }
  }).filter((x) => x.items.length > 0)
}

export default function ManageScreen({ wordSets, userId, profile, onAdd, onDelete, onBulkAdd }) {
  const [level, setLevel] = useState('chunk')
  const [owner, setOwner] = useState(profile?.role === 'parent' ? 'shared' : 'child')
  const [importance, setImportance] = useState(2)
  const [rawItems, setRawItems] = useState('')
  const [msg, setMsg] = useState('')
  const items = rawItems.split('\n').map((s) => s.trim()).filter(Boolean)
  const autoNote = items.join(', ')

  const addOne = async () => {
    if (items.length < 2) {
      setMsg('2語以上入力してください')
      return
    }
    await onAdd({ level, owner, importance, note: autoNote, items }, userId)
    setRawItems('')
    setMsg('追加しました')
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const XLSX = await import('xlsx')
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
    const sets = parseRows(rows)
    await onBulkAdd(sets, userId)
    setMsg(`${sets.length}件インポートしました`)
  }

  return (
    <div className="card">
      <h2>データ管理</h2>
      <div className="grid2">
        <select value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="chunk">chunk</option>
          <option value="collocation">collocation</option>
          <option value="sentence">sentence</option>
        </select>
        <select value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="child">child</option>
          <option value="parent">parent</option>
          <option value="shared">shared</option>
        </select>
      </div>
      <div className="grid2">
        <div className="row">
          {[0, 1, 2, 3].map((v) => (
            <button
              key={v}
              type="button"
              className={`chip ${importance === v ? 'active' : ''}`}
              onClick={() => setImportance(v)}
            >
              {'★'.repeat(v) || '☆'}
            </button>
          ))}
        </div>
        <input value={autoNote} readOnly placeholder="note (自動入力)" />
      </div>
      <textarea rows={5} value={rawItems} onChange={(e) => setRawItems(e.target.value)} placeholder={'item1\nitem2\nitem3'} />
      <button className="btn btn-primary" onClick={addOne}>セット追加</button>

      <div className="section">
        <label>CSV/XLSXインポート</label>
        <input type="file" accept=".csv,.xlsx,.xls" onChange={onFile} />
      </div>

      {msg && <div className="muted">{msg}</div>}

      <div className="section">
        <h3>セット一覧 ({wordSets.length})</h3>
        <div className="stack">
          {wordSets.map((ws) => (
            <div key={ws.id} className="list-item">
              <div>
                <div>{ws.level} | {'★'.repeat(ws.importance || 0) || '☆'} | {ws.owner}</div>
                <div className="muted">{ws.note || ws.items.slice(0, 2).join(', ')}</div>
              </div>
              <button className="btn btn-ghost" onClick={() => onDelete(ws, userId)}>削除</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
