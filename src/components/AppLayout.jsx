import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'

export default function AppLayout() {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50 max-w-screen-sm mx-auto">
      <main className="flex-1 pb-20 overflow-y-auto">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
