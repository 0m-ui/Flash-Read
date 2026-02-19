import { useState, useEffect, useRef } from 'react'
import { updateRecord } from '../utils/srs'
import './SessionScreen.css'

const PHASES = {
  READY: 'ready',
  FLASH: 'flash',
  RECALL: 'recall',
  ANSWER: 'answer',
  SUMMARY: 'summary'
}

const LEVEL_LABELS = { chunk: 'チャンク', collocation: 'コロケーション', sentence: '短文' }

export default function SessionScreen({ config, wordSets, records, onComplete, onExit }) {
  const { flashTime, sets } = config

  const [roundIndex, setRoundIndex] = useState(0)
  const [phase, setPhase] = useState(PHASES.READY)
  const [selfScore, setSelfScore] = useState(null) // null | 0..5
  const [sessionResults, setSessionResults] = useState([]) // accumulated results
  const [flashVisible, setFlashVisible] = useState(false)
  const [countdownKey, setCountdownKey] = useState(0)
  const timerRef = useRef(null)

  const currentSet = sets[roundIndex]
  const totalRounds = sets.length

  useEffect(() => {
    return () => clearTimeout(timerRef.current)
  }, [])

  const startFlash = () => {
    setPhase(PHASES.FLASH)
    setFlashVisible(true)
    setCountdownKey(k => k + 1)
    timerRef.current = setTimeout(() => {
      setFlashVisible(false)
      timerRef.current = setTimeout(() => {
        setPhase(PHASES.RECALL)
      }, 300)
    }, flashTime * 1000)
  }

  const handleSelfScore = (count) => {
    setSelfScore(count)
    setPhase(PHASES.ANSWER)
  }

  const handleNext = () => {
    // Record result
    const totalCount = currentSet.items.length
    const correctCount = selfScore || 0
    const prevRecord = records[currentSet.id]
    const newRecord = updateRecord(prevRecord, correctCount, totalCount)
    const result = { wordSetId: currentSet.id, correctCount, totalCount, record: newRecord }
    const newResults = [...sessionResults, result]
    setSessionResults(newResults)

    if (roundIndex + 1 >= totalRounds) {
      setPhase(PHASES.SUMMARY)
    } else {
      setRoundIndex(i => i + 1)
      setPhase(PHASES.READY)
      setSelfScore(null)
    }
  }

  const handleComplete = () => {
    onComplete(sessionResults)
  }

  // ── READY ──────────────────────────────────────────────────────────────────
  if (phase === PHASES.READY) {
    return (
      <div className="session-screen">
        <div className="session-topbar">
          <button className="exit-btn" onClick={onExit}>✕ 終了</button>
          <div className="round-indicator">
            {sets.map((_, i) => (
              <div key={i} className={`round-dot ${i < roundIndex ? 'done' : i === roundIndex ? 'current' : ''}`} />
            ))}
          </div>
        </div>

        <div className="session-content ready-content">
          <div className="round-label">ラウンド {roundIndex + 1} / {totalRounds}</div>
          <div className={`badge badge-${currentSet.level} level-badge`}>
            {LEVEL_LABELS[currentSet.level]}
          </div>
          <div className="ready-stars">{'★'.repeat(currentSet.importance)}</div>
          {currentSet.note && <div className="ready-note">📝 {currentSet.note}</div>}

          <div className="ready-info">
            <span>⏱ {flashTime}秒</span>
            <span>📦 {currentSet.items.length}個</span>
          </div>

          <button className="btn btn-primary btn-lg ready-btn" onClick={startFlash}>
            ⚡ フラッシュ開始！
          </button>
        </div>
      </div>
    )
  }

  // ── FLASH ──────────────────────────────────────────────────────────────────
  if (phase === PHASES.FLASH) {
    return (
      <div className="session-screen flash-screen">
        <div className="countdown-bar-wrap">
          <div
            key={countdownKey}
            className="countdown-bar"
            style={{ animationDuration: `${flashTime}s` }}
          />
        </div>
        <div className={`flash-content ${flashVisible ? 'visible' : 'hidden'}`}>
          <div className="flash-items">
            {currentSet.items.map((item, i) => (
              <div key={i} className="flash-item" style={{ animationDelay: `${i * 0.05}s` }}>
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── RECALL ─────────────────────────────────────────────────────────────────
  if (phase === PHASES.RECALL) {
    return (
      <div className="session-screen">
        <div className="session-topbar">
          <button className="exit-btn" onClick={onExit}>✕ 終了</button>
          <div className="round-indicator">
            {sets.map((_, i) => (
              <div key={i} className={`round-dot ${i < roundIndex ? 'done' : i === roundIndex ? 'current' : ''}`} />
            ))}
          </div>
        </div>

        <div className="session-content recall-content anim-slide-up">
          <div className="brain-icon">🧠</div>
          <div className="recall-question">何個言えた？</div>
          <div className="recall-sub">見えた単語の数を選んでね</div>

          <div className="score-buttons">
            {currentSet.items.map((_, i) => (
              <button
                key={i}
                className="score-btn"
                onClick={() => handleSelfScore(i + 1)}
              >
                {i + 1}
              </button>
            ))}
            <button className="score-btn score-zero" onClick={() => handleSelfScore(0)}>
              0
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── ANSWER ─────────────────────────────────────────────────────────────────
  if (phase === PHASES.ANSWER) {
    const pct = Math.round((selfScore / currentSet.items.length) * 100)
    const emoji = pct === 100 ? '🎉' : pct >= 60 ? '👍' : pct >= 30 ? '💪' : '😤'

    return (
      <div className="session-screen">
        <div className="session-topbar">
          <button className="exit-btn" onClick={onExit}>✕ 終了</button>
          <div className="round-indicator">
            {sets.map((_, i) => (
              <div key={i} className={`round-dot ${i < roundIndex ? 'done' : i === roundIndex ? 'current' : ''}`} />
            ))}
          </div>
        </div>

        <div className="session-content answer-content anim-slide-up">
          <div className="score-result">
            <span className="score-emoji">{emoji}</span>
            <span className="score-frac">{selfScore} / {currentSet.items.length}</span>
            <span className="score-pct">{pct}%</span>
          </div>

          <div className="answer-list">
            <div className="answer-list-title">✅ 正解リスト</div>
            {currentSet.items.map((item, i) => (
              <div key={i} className={`answer-item ${i < selfScore ? 'correct' : 'missed'}`}>
                <span className="answer-check">{i < selfScore ? '✓' : '✗'}</span>
                <span className="answer-text">{item}</span>
              </div>
            ))}
          </div>

          {currentSet.note && (
            <div className="answer-note">📝 {currentSet.note}</div>
          )}

          <button className="btn btn-primary btn-full" onClick={handleNext}>
            {roundIndex + 1 >= totalRounds ? '📊 結果を見る' : '次へ →'}
          </button>
        </div>
      </div>
    )
  }

  // ── SUMMARY ────────────────────────────────────────────────────────────────
  if (phase === PHASES.SUMMARY) {
    const totalCorrect = sessionResults.reduce((s, r) => s + r.correctCount, 0)
    const totalItems = sessionResults.reduce((s, r) => s + r.totalCount, 0)
    const pct = Math.round((totalCorrect / totalItems) * 100)
    const grade = pct === 100 ? '🏆 パーフェクト！' : pct >= 80 ? '🎉 すごい！' : pct >= 60 ? '👍 よくできました！' : '💪 もう一回！'

    return (
      <div className="session-screen">
        <div className="session-content summary-content anim-slide-up">
          <div className="summary-title">{grade}</div>
          <div className="summary-score">
            <span className="summary-num">{totalCorrect}</span>
            <span className="summary-sep"> / </span>
            <span className="summary-total">{totalItems}</span>
          </div>
          <div className="summary-pct">{pct}% 正解</div>

          <div className="summary-rounds">
            {sessionResults.map((r, i) => {
              const ws = sets[i]
              const p = Math.round((r.correctCount / r.totalCount) * 100)
              return (
                <div key={i} className="summary-round-item">
                  <span className={`badge badge-${ws.level}`}>{LEVEL_LABELS[ws.level]}</span>
                  <span className="summary-round-items">{ws.items.slice(0, 2).join(', ')}...</span>
                  <span className={`summary-round-pct ${p === 100 ? 'perfect' : p >= 60 ? 'good' : 'retry'}`}>
                    {r.correctCount}/{r.totalCount}
                  </span>
                </div>
              )
            })}
          </div>

          <button className="btn btn-primary btn-full btn-lg" onClick={handleComplete}>
            🏠 ホームへ
          </button>
        </div>
      </div>
    )
  }

  return null
}
