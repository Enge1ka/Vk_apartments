import { NavLink } from 'react-router-dom'
import { LayoutDashboard, BedDouble, CalendarDays, CreditCard, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/bookings', label: 'Bookings', icon: BedDouble },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/payments', label: 'Payments', icon: CreditCard },
  { to: '/more', label: 'More', icon: MoreHorizontal },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 safe-area-pb">
      <div className="flex items-stretch max-w-screen-sm mx-auto">
        {navItems.map(({ to, label, icon: Icon, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              cn(
                'flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors min-h-[56px]',
                isActive ? 'text-[#1e3a5f]' : 'text-gray-500 hover:text-gray-700'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={22} strokeWidth={isActive ? 2.5 : 1.75} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
