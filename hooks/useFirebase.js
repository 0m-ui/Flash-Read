import { useState, useEffect, useCallback } from 'react'
import {
  collection, doc, setDoc, deleteDoc, onSnapshot,
  query, orderBy, serverTimestamp, runTransaction, writeBatch
} from 'firebase/firestore'
import { db } from '../firebase'
import { SAMPLE_WORD_SETS } from '../data/sampleData'

const DEFAULT_STATS = { totalSessions: 0, totalCorrect: 0, totalItems: 0 }

function safeGetLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function safeSetLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore localStorage errors
  }
}

const wordSetsKey = (userId) => `es_wordSets_${userId || 'guest'}`
const recordsKey = (userId) => `es_records_${userId || 'guest'}`

// ─── WordSets ────────────────────────────────────────────────────────────────

export function useWordSets(userId, role) {
  const [wordSets, setWordSets] = useState(() => safeGetLocal(wordSetsKey(userId), SAMPLE_WORD_SETS))
  const [loading, setLoading] = useState(false)
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    if (!userId) {
      setWordSets(safeGetLocal(wordSetsKey(userId), SAMPLE_WORD_SETS))
      setIsOffline(true)
      return
    }
    setLoading(true)
    setIsOffline(false)

    // Listen to shared + user-specific sets
    const sharedRef = collection(db, 'wordSets', 'shared', 'sets')
    const userRef = collection(db, 'wordSets', userId, 'sets')

    let sharedSets = []
    let userSets = []

    const merge = () => {
      const all = [...sharedSets, ...userSets]
      if (all.length === 0) {
        setWordSets(SAMPLE_WORD_SETS)
        safeSetLocal(wordSetsKey(userId), SAMPLE_WORD_SETS)
      } else {
        setWordSets(all)
        safeSetLocal(wordSetsKey(userId), all)
      }
    }

    const unsubShared = onSnapshot(query(sharedRef, orderBy('createdAt', 'asc')), (snap) => {
      sharedSets = snap.docs.map(d => ({ id: d.id, ...d.data(), owner: 'shared' }))
      merge()
      setLoading(false)
    }, () => {
      setIsOffline(true)
      setLoading(false)
      setWordSets(safeGetLocal(wordSetsKey(userId), SAMPLE_WORD_SETS))
    })

    const unsubUser = onSnapshot(query(userRef, orderBy('createdAt', 'asc')), snap => {
      userSets = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      merge()
    }, () => {
      setIsOffline(true)
      setWordSets(safeGetLocal(wordSetsKey(userId), SAMPLE_WORD_SETS))
    })

    return () => { unsubShared(); unsubUser() }
  }, [userId])

  const addWordSet = useCallback(async (ws, userId) => {
    const owner = ws.owner || 'shared'
    if (owner === 'shared' && role !== 'parent') {
      throw new Error('Only parent can write shared sets.')
    }

    const id = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const payload = { ...ws, id, createdAt: Date.now() }

    if (!userId || isOffline) {
      setWordSets(prev => {
        const next = [...prev, payload]
        safeSetLocal(wordSetsKey(userId), next)
        return next
      })
      return id
    }

    const colPath = owner === 'shared' ? ['wordSets', 'shared', 'sets', id] : ['wordSets', userId, 'sets', id]
    await setDoc(doc(db, ...colPath), { ...ws, id, createdAt: serverTimestamp() })
    return id
  }, [isOffline, role])

  const deleteWordSet = useCallback(async (ws, userId) => {
    const owner = ws.owner || 'shared'
    if (owner === 'shared' && role !== 'parent') {
      throw new Error('Only parent can delete shared sets.')
    }

    if (!userId || isOffline) {
      setWordSets(prev => {
        const next = prev.filter(x => x.id !== ws.id)
        safeSetLocal(wordSetsKey(userId), next)
        return next
      })
      return
    }

    const colPath = owner === 'shared' ? ['wordSets', 'shared', 'sets', ws.id] : ['wordSets', userId, 'sets', ws.id]
    await deleteDoc(doc(db, ...colPath))
  }, [isOffline, role])

  const bulkAddWordSets = useCallback(async (sets, userId) => {
    if (!Array.isArray(sets) || sets.length === 0) return

    if (!userId || isOffline) {
      setWordSets(prev => {
        const created = sets.map((ws) => ({ ...ws, id: `ws_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, createdAt: Date.now() }))
        const next = [...prev, ...created]
        safeSetLocal(wordSetsKey(userId), next)
        return next
      })
      return
    }

    const batch = writeBatch(db)
    const now = Date.now()
    for (let i = 0; i < sets.length; i += 1) {
      const ws = sets[i]
      const owner = ws.owner || 'shared'
      if (owner === 'shared' && role !== 'parent') {
        throw new Error('Only parent can write shared sets.')
      }
      const id = `ws_${now}_${i}_${Math.random().toString(36).slice(2, 7)}`
      const ref = owner === 'shared'
        ? doc(db, 'wordSets', 'shared', 'sets', id)
        : doc(db, 'wordSets', userId, 'sets', id)
      batch.set(ref, {
        ...ws,
        id,
        createdAt: serverTimestamp()
      })
    }
    await batch.commit()
  }, [isOffline, role])

  return { wordSets, loading, isOffline, addWordSet, deleteWordSet, bulkAddWordSets }
}

// ─── Records ─────────────────────────────────────────────────────────────────

export function useRecords(userId) {
  const [records, setRecords] = useState(() => safeGetLocal(recordsKey(userId), {}))
  const [stats, setStats] = useState(() => safeGetLocal(`${recordsKey(userId)}_stats`, DEFAULT_STATS))
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    if (!userId) {
      setRecords(safeGetLocal(recordsKey(userId), {}))
      setStats(safeGetLocal(`${recordsKey(userId)}_stats`, DEFAULT_STATS))
      setIsOffline(true)
      return
    }
    const ref = doc(db, 'records', userId)
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        const { _stats, ...recs } = data
        setRecords(recs)
        setStats(_stats || DEFAULT_STATS)
        safeSetLocal(recordsKey(userId), recs)
        safeSetLocal(`${recordsKey(userId)}_stats`, _stats || DEFAULT_STATS)
        setIsOffline(false)
      } else {
        setRecords({})
        setStats(DEFAULT_STATS)
        safeSetLocal(recordsKey(userId), {})
        safeSetLocal(`${recordsKey(userId)}_stats`, DEFAULT_STATS)
        setIsOffline(false)
      }
    }, () => {
      setIsOffline(true)
      setRecords(safeGetLocal(recordsKey(userId), {}))
      setStats(safeGetLocal(`${recordsKey(userId)}_stats`, DEFAULT_STATS))
    })
    return unsub
  }, [userId])

  const saveRecord = useCallback(async (userId, wordSetId, newRecord) => {
    if (!userId) return
    const persistLocal = () => {
      const existing = safeGetLocal(recordsKey(userId), {})
      const prev = existing[wordSetId] || {}
      const prevStats = safeGetLocal(`${recordsKey(userId)}_stats`, DEFAULT_STATS)
      const nextStats = {
        totalSessions: (prevStats.totalSessions || 0) + 1,
        totalCorrect: (prevStats.totalCorrect || 0) + ((newRecord.totalCorrect || 0) - (prev.totalCorrect || 0)),
        totalItems: (prevStats.totalItems || 0) + ((newRecord.totalItems || 0) - (prev.totalItems || 0))
      }
      const nextRecords = { ...existing, [wordSetId]: newRecord }
      setRecords(nextRecords)
      setStats(nextStats)
      safeSetLocal(recordsKey(userId), nextRecords)
      safeSetLocal(`${recordsKey(userId)}_stats`, nextStats)
    }

    if (isOffline) {
      persistLocal()
      return
    }

    const ref = doc(db, 'records', userId)
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref)
        const existing = snap.exists() ? snap.data() : {}
        const prev = existing[wordSetId] || {}
        const prevStats = existing._stats || DEFAULT_STATS
        const nextStats = {
          totalSessions: (prevStats.totalSessions || 0) + 1,
          totalCorrect: (prevStats.totalCorrect || 0) + ((newRecord.totalCorrect || 0) - (prev.totalCorrect || 0)),
          totalItems: (prevStats.totalItems || 0) + ((newRecord.totalItems || 0) - (prev.totalItems || 0))
        }
        tx.set(ref, {
          ...existing,
          [wordSetId]: newRecord,
          _stats: nextStats
        }, { merge: true })
      })
    } catch {
      setIsOffline(true)
      persistLocal()
    }
  }, [isOffline])

  return { records, stats, isOffline, saveRecord }
}
