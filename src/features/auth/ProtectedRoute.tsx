import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from './store'

interface ProtectedRouteProps {
  children: ReactNode
  adminOnly?: boolean
}

export function ProtectedRoute({ children, adminOnly = false }: ProtectedRouteProps) {
  const { user, profile, authReady } = useAuthStore()

  if (!authReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 rounded-full border-4 border-gray-200 border-t-[#1e3a5f] animate-spin" />
          <p className="text-sm font-medium text-gray-600">Preparing your workspace...</p>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && profile?.role !== 'admin') return <Navigate to="/" replace />

  return children
}
