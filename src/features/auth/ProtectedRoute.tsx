import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { MapPinOff } from 'lucide-react'
import { useAuthStore } from './store'
import { useAuth } from './useAuth'

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

  // A non-admin must have an assigned location before ANY data is visible.
  // Enforced once here rather than per-page so a restricted user with no
  // location can never fall through a missed guard to another location's
  // data — and so a newly created employee gets a clear "ask an admin"
  // screen instead of empty pages (or, as before, everything). Admins are
  // never location-gated. Fails closed: if the profile couldn't load
  // (role/location unknown), access is withheld until a refresh succeeds.
  const isAdmin = profile?.role === 'admin'
  if (!isAdmin && !profile?.location_id) return <NoLocationAssigned />

  if (adminOnly && !isAdmin) return <Navigate to="/" replace />

  return children
}

// Shown to an authenticated non-admin who hasn't been assigned a location
// yet. Gives them a way to retry (in case an admin just assigned one, or the
// profile fetch failed) and to sign out of the wrong account.
function NoLocationAssigned() {
  const { signOut } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <MapPinOff size={24} className="text-amber-600" />
        </div>
        <h1 className="text-lg font-bold text-gray-900">No location assigned yet</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Your account isn't linked to a location, so there's no data to show yet.
          Ask an administrator to assign you a location in Settings, then refresh.
        </p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={() => window.location.reload()}
            className="flex-1 rounded-xl bg-[#1e3a5f] text-white py-2.5 text-sm font-medium hover:bg-[#2d5a8e] transition-colors"
          >
            Refresh
          </button>
          <button
            onClick={() => signOut()}
            className="flex-1 rounded-xl border border-gray-200 text-gray-700 py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
