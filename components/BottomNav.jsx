export default function BottomNav({ current, onChange }) {
  const items = [
    ['home', '🏠 Home'],
    ['manage', '⚙ Manage'],
    ['stats', '📊 Stats']
  ]
  return (
    <div className="bottom-nav">
      {items.map(([key, label]) => (
        <button key={key} className={`nav-btn ${current === key ? 'active' : ''}`} onClick={() => onChange(key)}>
          {label}
        </button>
      ))}
    </div>
  )
}
