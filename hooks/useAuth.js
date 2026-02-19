import { useState, useEffect, useCallback } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth'
import { auth } from '../firebase'

const AUTH_KEY = 'es_role_hint_v1'
const PIN_BY_ROLE = { child: '33', parent: '66' }
const ROLE_LABEL = { child: 'Child', parent: 'Parent' }

function getRoleCredentials(role) {
  if (role === 'child') {
    return {
      email: import.meta.env.VITE_CHILD_EMAIL,
      password: import.meta.env.VITE_CHILD_PASSWORD
    }
  }
  return {
    email: import.meta.env.VITE_PARENT_EMAIL,
    password: import.meta.env.VITE_PARENT_PASSWORD
  }
}

function profileFromUser(user) {
  if (!user?.email) return null
  const childEmail = import.meta.env.VITE_CHILD_EMAIL
  const parentEmail = import.meta.env.VITE_PARENT_EMAIL
  if (user.email === childEmail) return { role: 'child', displayName: ROLE_LABEL.child }
  if (user.email === parentEmail) return { role: 'parent', displayName: ROLE_LABEL.parent }
  const hint = localStorage.getItem(AUTH_KEY)
  if (hint === 'child' || hint === 'parent') {
    return { role: hint, displayName: ROLE_LABEL[hint] }
  }
  return { role: 'child', displayName: ROLE_LABEL.child }
}

export function useAuth() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setProfile(profileFromUser(nextUser))
      setLoading(false)
    })
    return unsub
  }, [])

  const login = useCallback(async (role, pin) => {
    setError(null)
    if (role !== 'child' && role !== 'parent') {
      const msg = '無効なアカウントです'
      setError(msg)
      throw new Error(msg)
    }
    if (pin !== PIN_BY_ROLE[role]) {
      const msg = 'PINが違います'
      setError(msg)
      throw new Error(msg)
    }
    const creds = getRoleCredentials(role)
    if (!creds.email || !creds.password) {
      const msg = `環境変数が未設定です: ${role.toUpperCase()}`
      setError(msg)
      throw new Error(msg)
    }
    await signInWithEmailAndPassword(auth, creds.email, creds.password)
    localStorage.setItem(AUTH_KEY, role)
  }, [])

  const register = useCallback(async () => {
    const msg = '新規登録は無効です。child/parent でログインしてください。'
    setError(msg)
    throw new Error(msg)
  }, [])

  const logout = useCallback(async () => {
    await signOut(auth)
    setUser(null)
    setProfile(null)
  }, [])

  return { user, profile, loading, error, login, register, logout }
}
