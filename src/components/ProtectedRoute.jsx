import { Navigate } from 'react-router-dom'
import { useAppStore } from '@/store/useAppStore'

export function ProtectedRoute({ children, adminOnly = false }) {
  const { user, profile } = useAppStore()

  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && profile && profile.role !== 'admin') return <Navigate to="/" replace />

  return children
}
