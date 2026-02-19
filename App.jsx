import { Suspense, lazy } from 'react'
import { useAuth } from './hooks/useAuth'
import AuthScreen from './components/AuthScreen'
import './App.css'

const AuthenticatedApp = lazy(() => import('./components/AuthenticatedApp'))

export default function App() {
  const { user, profile, loading, error, login, logout } = useAuth()

  if (loading) {
    return (
      <div className="splash">
        <div className="splash-logo">⚡</div>
        <div className="splash-text">英語瞬読</div>
      </div>
    )
  }

  if (!user) {
    return <AuthScreen login={login} error={error} />
  }

  return (
    <Suspense fallback={<div className="app"><div className="card muted">読み込み中...</div></div>}>
      <AuthenticatedApp user={user} profile={profile} logout={logout} />
    </Suspense>
  )
}
