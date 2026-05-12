import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import { Toaster } from 'react-hot-toast'

export default function AppLayout() {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50 max-w-screen-sm mx-auto">
      <main className="flex-1 pb-20 overflow-y-auto">
        <Outlet />
      </main>
      <BottomNav />
      <Toaster
        position="top-center"
        toastOptions={{
          style: { borderRadius: '12px', fontSize: '14px' },
          success: { iconTheme: { primary: '#1e3a5f', secondary: '#fff' } },
        }}
      />
    </div>
  )
}
