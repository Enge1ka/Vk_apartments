import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/useAuth'
import { Card, CardContent } from '@/shared/ui/Card'
import { CalendarDays, Users, BarChart3, Settings, ChevronRight, LogOut } from 'lucide-react'

export default function More() {
  const { profile, signOut, isAdmin } = useAuth()

  const items = [
    { to: '/calendar', label: 'Calendar', icon: CalendarDays, desc: 'View arrivals, stays, and check-outs' },
    { to: '/clients', label: 'Clients', icon: Users, desc: 'Search & view client profiles' },
    { to: '/reports', label: 'Reports', icon: BarChart3, desc: 'Revenue & occupancy reports' },
    ...(isAdmin ? [{ to: '/settings', label: 'Admin Settings', icon: Settings, desc: 'Users, locations, audit log' }] : []),
  ]

  return (
    <div className="p-4 space-y-4">
      <div className="pt-2">
        <h1 className="text-xl font-bold text-gray-900">More</h1>
        {profile && (
          <p className="text-sm text-gray-500 mt-0.5">
            {profile.full_name} · <span className="capitalize">{profile.role}</span>
          </p>
        )}
      </div>

      <Card>
        <CardContent className="divide-y divide-gray-100 p-0">
          {items.map(({ to, label, icon: Icon, desc }) => (
            <Link key={to} to={to} className="flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors first:rounded-t-2xl last:rounded-b-2xl">
              <div className="p-2 rounded-xl bg-gray-100">
                <Icon size={20} className="text-gray-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{label}</p>
                <p className="text-xs text-gray-400">{desc}</p>
              </div>
              <ChevronRight size={16} className="text-gray-300" />
            </Link>
          ))}
        </CardContent>
      </Card>

      <button
        onClick={signOut}
        className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
      >
        <LogOut size={18} />
        <span className="font-medium">Sign Out</span>
      </button>
    </div>
  )
}
