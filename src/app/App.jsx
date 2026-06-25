import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, Suspense, lazy } from 'react'
import { Toaster } from 'react-hot-toast'
import { useAuth } from '@/features/auth/useAuth'
import { isSupabaseConfigured } from '@/shared/lib/supabase'
import AppLayout from '@/components/AppLayout'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import Login from '@/features/auth/components/Login'
import ForgotPassword from '@/features/auth/components/ForgotPassword'
import ResetPassword from '@/features/auth/components/ResetPassword'

const Dashboard = lazy(() => import('@/features/dashboard/components/DashboardPage'))
const Apartments = lazy(() => import('@/features/apartments/components/ApartmentsPage'))
const Bookings = lazy(() => import('@/features/bookings/components/BookingsPage'))
const BookingDetail = lazy(() => import('@/features/bookings/components/BookingDetailPage'))
const NewBooking = lazy(() => import('@/features/bookings/components/NewBookingPage'))
const Payments = lazy(() => import('@/features/payments/components/PaymentsPage'))
const CalendarPage = lazy(() => import('@/features/calendar/components/CalendarPage'))
const Reports = lazy(() => import('@/features/reports/components/ReportsPage'))
const Clients = lazy(() => import('@/features/clients/components/ClientsPage'))
const Settings = lazy(() => import('@/features/settings/components/SettingsPage'))
const More = lazy(() => import('@/components/More'))

function PageFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-[#1e3a5f]" />
    </div>
  )
}

function ConfigurationRequired() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#1e3a5f]">Setup required</p>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Connect Supabase to publish</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          Add your Supabase project URL and anon key as environment variables before deploying this app.
        </p>
        <div className="mt-5 rounded-xl bg-gray-950 p-4 text-sm text-gray-100 space-y-1">
          <p className="text-gray-400 text-xs mb-1">Vite / standard:</p>
          <p>VITE_SUPABASE_URL</p>
          <p>VITE_SUPABASE_ANON_KEY</p>
          <p className="text-gray-400 text-xs mt-3 mb-1">Next.js / Netlify:</p>
          <p>NEXT_PUBLIC_SUPABASE_URL</p>
          <p>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</p>
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
              <Route path="/" element={<Suspense fallback={<PageFallback />}><Dashboard /></Suspense>} />
              <Route path="/apartments" element={<Suspense fallback={<PageFallback />}><Apartments /></Suspense>} />
              <Route path="/bookings" element={<Suspense fallback={<PageFallback />}><Bookings /></Suspense>} />
              <Route path="/bookings/new" element={<Suspense fallback={<PageFallback />}><NewBooking /></Suspense>} />
              <Route path="/bookings/:id" element={<Suspense fallback={<PageFallback />}><BookingDetail /></Suspense>} />
              <Route path="/payments" element={<Suspense fallback={<PageFallback />}><Payments /></Suspense>} />
              <Route path="/calendar" element={<Suspense fallback={<PageFallback />}><CalendarPage /></Suspense>} />
              <Route path="/reports" element={<Suspense fallback={<PageFallback />}><Reports /></Suspense>} />
              <Route path="/clients" element={<Suspense fallback={<PageFallback />}><Clients /></Suspense>} />
              <Route path="/more" element={<Suspense fallback={<PageFallback />}><More /></Suspense>} />
              <Route path="/settings" element={<ProtectedRoute adminOnly><Suspense fallback={<PageFallback />}><Settings /></Suspense></ProtectedRoute>} />
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
