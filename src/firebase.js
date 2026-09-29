import { initializeApp } from 'firebase/app'
import { getAnalytics, isSupported } from 'firebase/analytics'

const firebaseConfig = {
  apiKey: 'AIzaSyC3s4czhLgkweZNmU_5Ux0X-RfCVEAlEYY',
  authDomain: 'flow-zone-chart.firebaseapp.com',
  projectId: 'flow-zone-chart',
  storageBucket: 'flow-zone-chart.firebasestorage.app',
  messagingSenderId: '517413238041',
  appId: '1:517413238041:web:e7e91011db2f4885480188',
  measurementId: 'G-WYG7TYMC4F',
}

export const app = initializeApp(firebaseConfig)

// Analytics only works once Google Analytics is linked to the Firebase
// project (Console > Project settings > Integrations), which adds a
// measurementId to this config. Until then this safely does nothing.
const analyticsSupported = firebaseConfig.measurementId ? await isSupported() : false
export const analyticsReady = analyticsSupported ? getAnalytics(app) : null
