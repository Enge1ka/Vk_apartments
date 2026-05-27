import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'
import { isSupabaseConfigured } from '@/lib/supabase'
import AppLayout from '@/components/AppLayout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import Login from '@/pages/Login'
import ForgotPassword from '@/pages/ForgotPassword'
import ResetPassword from '@/pages/ResetPassword'
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

function ConfigurationRequired() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#1e3a5f]">Setup required</p>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Connect Supabase to publish</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          Add your Supabase project URL and anon key as environment variables before deploying this app.
        </p>
        <div className="mt-5 rounded-xl bg-gray-950 p-4 text-sm text-gray-100">
          <p>VITE_SUPABASE_URL</p>
          <p>VITE_SUPABASE_ANON_KEY</p>
        </div>
        <p className="mt-4 text-xs text-gray-500">
          For local development, copy .env.example to .env and fill in the values. For Netlify, add them in Site settings.
        </p>
      </div>
    </div>
  )
}

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

  return isSupabaseConfigured ? (
    <>
      <BrowserRouter>
        <AuthInit>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

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
      <Toaster
        position="top-center"
        toastOptions={{
          style: { borderRadius: '12px', fontSize: '14px' },
          success: { iconTheme: { primary: '#1e3a5f', secondary: '#fff' } },
        }}
      />
    </>
  ) : (
    <ConfigurationRequired />
  )
}
