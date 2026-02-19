import { useState } from 'react'

export default function AuthScreen({ login, error }) {
  const [role, setRole] = useState('child')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setLocalError('')
    try {
      await login(role, pin)
    } catch (err) {
      setLocalError(err?.message || '認証に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card auth-card">
      <h1>⚡ 英語瞬読</h1>
      <p className="muted">役割を選んでPINを入力</p>
      <form onSubmit={submit} className="stack">
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="child">child</option>
          <option value="parent">parent</option>
        </select>
        <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" type="password" required />
        <button className="btn btn-primary" disabled={busy}>
          {busy ? '処理中...' : 'ログイン'}
        </button>
      </form>
      <div className="muted">child: 33 / parent: 66</div>
      {(localError || error) && <div className="error">{localError || error}</div>}
    </div>
  )
}
