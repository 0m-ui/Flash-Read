import { Suspense, lazy, useState } from 'react'
import { useWordSets, useRecords } from '../hooks/useFirebase'
import HomeScreen from './HomeScreen'
import BottomNav from './BottomNav'

const SessionScreen = lazy(() => import('./SessionScreen'))
const ManageScreen = lazy(() => import('./ManageScreen'))
const StatsScreen = lazy(() => import('./StatsScreen'))

export default function AuthenticatedApp({ user, profile, logout }) {
  const { wordSets, isOffline: wordSetsOffline, addWordSet, deleteWordSet, bulkAddWordSets } = useWordSets(user?.uid, profile?.role)
  const { records, stats, isOffline: recordsOffline, saveRecord } = useRecords(user?.uid)
  const [screen, setScreen] = useState('home')
  const [sessionConfig, setSessionConfig] = useState(null)
  const isOffline = wordSetsOffline || recordsOffline

  const handleStartSession = (config) => {
    setSessionConfig(config)
    setScreen('session')
  }

  const handleSessionComplete = (results) => {
    // Always return to home immediately; persist records in background.
    setScreen('home')
    Promise.all(
      results.map((r) => saveRecord(user.uid, r.wordSetId, r.record))
    ).catch(() => {
      // Ignore save failures here to avoid blocking navigation.
    })
  }

  return (
    <div className="app">
      {isOffline && (
        <div className="offline-banner">
          📴 オフラインモード — Firebase未設定。データはこのデバイスのみ。
        </div>
      )}

      <div className="screen-container">
        <Suspense fallback={<div className="card muted">読み込み中...</div>}>
          {screen === 'home' && (
            <HomeScreen
              profile={profile}
              wordSets={wordSets}
              records={records}
              stats={stats}
              onStartSession={handleStartSession}
              onLogout={logout}
              userId={user.uid}
            />
          )}
          {screen === 'session' && sessionConfig && (
            <SessionScreen
              config={sessionConfig}
              wordSets={wordSets}
              records={records}
              onComplete={handleSessionComplete}
              onExit={() => setScreen('home')}
            />
          )}
          {screen === 'manage' && (
            <ManageScreen
              wordSets={wordSets}
              userId={user.uid}
              profile={profile}
              onAdd={addWordSet}
              onDelete={deleteWordSet}
              onBulkAdd={bulkAddWordSets}
            />
          )}
          {screen === 'stats' && (
            <StatsScreen
              stats={stats}
              records={records}
              wordSets={wordSets}
              profile={profile}
              userId={user.uid}
            />
          )}
        </Suspense>
      </div>

      {screen !== 'session' && (
        <BottomNav current={screen} onChange={setScreen} />
      )}
    </div>
  )
}
