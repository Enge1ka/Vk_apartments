import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import AppLayout from '@/components/AppLayout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Apartments from '@/pages/Apartments'
import Bookings from '@/pages/Bookings'
import BookingDetail from '@/pages/BookingDetail'
import NewBooking from '@/pages/NewBooking'
import Payments from '@/pages/Payments'
import CalendarPage from '@/pages/CalendarPage'
import Reports from '@/pages/Reports'
import Clients from '@/pages/Clients'
import Settings from '@/pages/Settings'
import More from '@/pages/More'

function AuthInit({ children }) {
  useAuth()
  return children
}

export default function App() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  return (
    <BrowserRouter>
      <AuthInit>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/apartments" element={<Apartments />} />
            <Route path="/bookings" element={<Bookings />} />
            <Route path="/bookings/new" element={<NewBooking />} />
            <Route path="/bookings/:id" element={<BookingDetail />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/more" element={<More />} />
            <Route path="/settings" element={<ProtectedRoute adminOnly><Settings /></ProtectedRoute>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthInit>
    </BrowserRouter>
  )
}
