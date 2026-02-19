import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const envConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
}

const hasFirebaseConfig =
  Boolean(envConfig.apiKey) &&
  Boolean(envConfig.projectId) &&
  Boolean(envConfig.appId)

const fallbackConfig = {
  apiKey: 'demo-key',
  authDomain: 'demo.firebaseapp.com',
  projectId: 'demo-project',
  storageBucket: 'demo-project.appspot.com',
  messagingSenderId: '0',
  appId: '1:0:web:0'
}

const app = initializeApp(hasFirebaseConfig ? envConfig : fallbackConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
