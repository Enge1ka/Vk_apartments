import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventClickArg } from '@fullcalendar/core'
import { Select } from '@/shared/ui/Select'
import { Label } from '@/shared/ui/Label'
import { ErrorBanner } from '@/shared/ui/ErrorBanner'
import { useAuth } from '@/features/auth/useAuth'
import { useSupabaseQuery } from '@/shared/hooks/useSupabaseQuery'
import { listLocations } from '@/features/locations/api'
import { listRoomsForCalendar, subscribeToBookingChanges } from '@/features/bookings/api'
import AvailabilityGrid from './AvailabilityGrid'

const LOCATION_COLORS = ['#1e3a5f', '#2d8a4e', '#b45309', '#7c3aed']

// LOCATION_COLORS only covers the common case; beyond that, generate
// visually distinct colors instead of cycling back and reusing one.
function getLocationColor(i: number): string {
  if (i < LOCATION_COLORS.length) return LOCATION_COLORS[i]
  const hue = (i * 137.508) % 360 // golden angle keeps hues spread apart
  return `hsl(${hue}, 55%, 35%)`
}

export default function CalendarPage() {
  const navigate = useNavigate()
  const { isRestricted, locationId } = useAuth()
  const [filterLocation, setFilterLocation] = useState('')
  const [view, setView] = useState<'calendar' | 'grid'>('calendar')

  // Restricted users are locked to their assigned location.
  const effectiveLocation = isRestricted && locationId ? locationId : filterLocation

  const { data, error, refetch } = useSupabaseQuery(async () => {
    const [locations, rooms] = await Promise.all([
      listLocations(),
      listRoomsForCalendar(effectiveLocation || null),
    ])
    return { locations, rooms }
  }, [effectiveLocation], 'calendar.listLocationsAndRooms')

  // Stable ref so the realtime subscription (set up once) never calls a
  // stale closure bound to an old effectiveLocation (mirrors useApartmentsPage).
  const refetchRef = useRef(refetch)
  useEffect(() => { refetchRef.current = refetch })
  useEffect(() => subscribeToBookingChanges(() => refetchRef.current()), [])

  const locations = data?.locations ?? []
  const rooms = data?.rooms ?? []

  const colorMap: Record<string, string> = {}
  locations.forEach((loc, i) => { colorMap[loc.id] = getLocationColor(i) })

  // One event per room — each apartment's own stay within a booking.
  const events = rooms.map(r => ({
    id: r.id,
    title: `${r.apartment?.apartment_number} · ${r.client?.full_name}`,
    start: r.check_in_date,
    end: r.check_out_date,
    backgroundColor: (r.apartment?.location_id && colorMap[r.apartment.location_id]) || '#1e3a5f',
    borderColor: 'transparent',
    extendedProps: { bookingId: r.booking_id },
  }))

  function handleEventClick({ event }: EventClickArg) {
    navigate(`/bookings/${event.extendedProps.bookingId}`)
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-xl font-bold text-gray-900">Calendar</h1>
        <Label htmlFor="calendar-location-filter" className="sr-only">Filter by location</Label>
        <Select id="calendar-location-filter" value={effectiveLocation} onChange={e => setFilterLocation(e.target.value)} className="w-36 h-9 text-xs" disabled={isRestricted}>
          <option value="">All locations</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
      </div>

      {error && <ErrorBanner error={error} />}

      <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
        {(['calendar', 'grid'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${view === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
          >
            {v === 'calendar' ? 'Calendar' : 'Availability grid'}
          </button>
        ))}
      </div>

      {view === 'grid' ? (
        <AvailabilityGrid locationId={effectiveLocation || null} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {locations.map((loc, i) => (
              <div key={loc.id} className="flex items-center gap-1.5 text-xs text-gray-600">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getLocationColor(i) }} />
                {loc.name}
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <FullCalendar
              plugins={[dayGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              events={events}
              eventClick={handleEventClick}
              headerToolbar={{
                left: 'prev',
                center: 'title',
                right: 'next today',
              }}
              height="auto"
              eventDisplay="block"
              dayMaxEvents={3}
              eventTextColor="#fff"
              eventClassNames="text-xs cursor-pointer"
            />
          </div>
        </>
      )}
    </div>
  )
}
