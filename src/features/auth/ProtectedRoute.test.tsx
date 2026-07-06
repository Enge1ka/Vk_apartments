import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { ProtectedRoute } from './ProtectedRoute'
import { useAuthStore } from './store'
import type { Profile } from './api'
import type { User } from '@supabase/supabase-js'

const USER = { id: 'u1' } as User
const admin: Profile = { id: 'u1', full_name: 'A', email: null, role: 'admin', location_id: null }
const employeeWithLocation: Profile = { id: 'u1', full_name: 'E', email: null, role: 'employee', location_id: 'loc-1' }
const employeeNoLocation: Profile = { id: 'u1', full_name: 'E', email: null, role: 'employee', location_id: null }

function setAuth(state: { user: User | null; profile: Profile | null; authReady: boolean }) {
  useAuthStore.setState(state)
}

// Guarded content lives at its own path so the two redirect targets
// (/login when unauthenticated, / when an admin-only route rejects a
// non-admin) land on distinct, observable plain routes.
function renderGuarded(adminOnly = false) {
  const guardedPath = adminOnly ? '/settings' : '/app'
  return render(
    <MemoryRouter initialEntries={[guardedPath]}>
      <Routes>
        <Route path="/login" element={<div>Login screen</div>} />
        <Route path="/" element={<div>Dashboard</div>} />
        <Route
          path={guardedPath}
          element={
            <ProtectedRoute adminOnly={adminOnly}>
              <div>Protected content</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => setAuth({ user: null, profile: null, authReady: false }))

describe('ProtectedRoute location gate', () => {
  it('shows a spinner until auth is ready', () => {
    setAuth({ user: null, profile: null, authReady: false })
    renderGuarded()
    expect(screen.getByText('Preparing your workspace...')).toBeInTheDocument()
  })

  it('redirects to /login when unauthenticated', () => {
    setAuth({ user: null, profile: null, authReady: true })
    renderGuarded()
    expect(screen.getByText('Login screen')).toBeInTheDocument()
  })

  it('blocks a non-admin with no assigned location', () => {
    setAuth({ user: USER, profile: employeeNoLocation, authReady: true })
    renderGuarded()
    expect(screen.getByText('No location assigned yet')).toBeInTheDocument()
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })

  it('blocks fail-closed when the profile failed to load', () => {
    setAuth({ user: USER, profile: null, authReady: true })
    renderGuarded()
    expect(screen.getByText('No location assigned yet')).toBeInTheDocument()
  })

  it('lets a non-admin with an assigned location through', () => {
    setAuth({ user: USER, profile: employeeWithLocation, authReady: true })
    renderGuarded()
    expect(screen.getByText('Protected content')).toBeInTheDocument()
  })

  it('never location-gates an admin, even with no location', () => {
    setAuth({ user: USER, profile: admin, authReady: true })
    renderGuarded()
    expect(screen.getByText('Protected content')).toBeInTheDocument()
  })

  it('redirects a located non-admin away from an admin-only route', () => {
    setAuth({ user: USER, profile: employeeWithLocation, authReady: true })
    renderGuarded(true)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })
})
