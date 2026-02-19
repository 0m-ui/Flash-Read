// SRS (間隔反復) ロジック
// SM-2アルゴリズム簡易版 + 重要度フィルタ

const MS_PER_DAY = 86400000

/**
 * 次回復習日を計算
 * @param {number} interval - 現在のインターバル(日)
 * @param {number} easeFactor - 難易度係数(1.3~2.5)
 * @param {number} score - 自己採点(0~5 items中何個言えたか正規化)
 */
export function calcNextInterval(interval, easeFactor, score) {
  // score: 0=全滅, 1=完璧
  if (score < 0.3) {
    return { interval: 1, easeFactor: Math.max(1.3, easeFactor - 0.2) }
  }
  if (score < 0.6) {
    return { interval: Math.max(1, Math.floor(interval * 0.8)), easeFactor: Math.max(1.3, easeFactor - 0.1) }
  }
  const newEase = Math.min(2.5, easeFactor + 0.1 * (score - 0.6))
  const newInterval = interval === 0 ? 1 : interval === 1 ? 3 : Math.round(interval * newEase)
  return { interval: newInterval, easeFactor: newEase }
}

/**
 * WordSetの学習記録からデュー状態を判定
 * @returns {boolean}
 */
export function isDue(record) {
  if (!record) return true
  if (!record.nextDue) return true
  return Date.now() >= record.nextDue
}

/**
 * 重要度スコア計算 (選択に使用)
 * importance 3=5点, 2=3点, 1=1点, 0=0点
 */
export function importanceScore(importance) {
  const map = { 3: 5, 2: 3, 1: 1, 0: 0 }
  return map[importance] ?? 0
}

/**
 * セッション用ワードセットを選択 (最大5セット)
 * 優先順: ①デュー済み高重要度 → ②デュー済み低重要度 → ③未来予定
 */
export function selectSessionSets(wordSets, records, importanceFilter, maxSets = 5) {
  const filtered = wordSets.filter(ws => {
    if (importanceFilter.length > 0 && !importanceFilter.includes(ws.importance)) return false
    return true
  })

  const scored = filtered.map(ws => {
    const rec = records[ws.id]
    const due = isDue(rec)
    const impScore = importanceScore(ws.importance)
    const timeSinceDue = rec?.nextDue ? Math.max(0, Date.now() - rec.nextDue) / MS_PER_DAY : 999
    const neverStudied = !rec
    
    // スコア計算: デュー済み優先 + 重要度 + 時間経過
    let score = 0
    if (neverStudied) score = 1000 + impScore * 10
    else if (due) score = 500 + impScore * 10 + timeSinceDue
    else score = impScore // まだ期限前
    
    return { ws, score, due, neverStudied }
  })

  scored.sort((a, b) => b.score - a.score)
  
  return scored.slice(0, maxSets).map(s => s.ws)
}

/**
 * 学習後に記録を更新
 */
export function updateRecord(existingRecord, correctCount, totalCount) {
  const score = totalCount > 0 ? correctCount / totalCount : 0
  const prev = existingRecord || { interval: 0, easeFactor: 2.0, totalSessions: 0, totalCorrect: 0 }
  
  const { interval, easeFactor } = calcNextInterval(prev.interval, prev.easeFactor, score)
  
  return {
    interval,
    easeFactor,
    lastStudied: Date.now(),
    nextDue: Date.now() + interval * MS_PER_DAY,
    totalSessions: (prev.totalSessions || 0) + 1,
    totalCorrect: (prev.totalCorrect || 0) + correctCount,
    totalItems: (prev.totalItems || 0) + totalCount,
    lastScore: score
  }
}

export function formatNextDue(nextDue) {
  if (!nextDue) return '今すぐ'
  const diff = nextDue - Date.now()
  if (diff <= 0) return '今すぐ'
  const days = Math.ceil(diff / MS_PER_DAY)
  if (days === 1) return '明日'
  return `${days}日後`
}
