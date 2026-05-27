import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import { supabase } from '@/lib/supabase'
import { Select } from '@/components/ui/Select'
import { useAuth } from '@/hooks/useAuth'

const LOCATION_COLORS = ['#1e3a5f', '#2d8a4e', '#b45309', '#7c3aed']

export default function CalendarPage() {
  const navigate = useNavigate()
  const { isRestricted, locationId } = useAuth()
  const [events, setEvents] = useState([])
  const [locations, setLocations] = useState([])
  const [filterLocation, setFilterLocation] = useState('')

  // Pre-lock filter to user's location when restricted
  useEffect(() => {
    if (isRestricted && locationId) setFilterLocation(locationId)
  }, [isRestricted, locationId])

  useEffect(() => {
    supabase.from('locations').select('*').order('name').then(({ data }) => setLocations(data || []))
    fetchEvents()
  }, [])

  useEffect(() => { fetchEvents() }, [filterLocation])

  async function fetchEvents() {
    const { data } = await supabase
      .from('bookings')
      .select(`
        id, booking_reference, check_in_date, check_out_date, booking_status,
        client:clients(full_name),
        apartment:apartments(apartment_number, location_id, location:locations(id, name))
      `)
      .neq('booking_status', 'cancelled')

    const apts = (data || []).filter(b =>
      !filterLocation || b.apartment?.location_id === filterLocation
    )

    const colorMap = {}
    locations.forEach((loc, i) => { colorMap[loc.id] = LOCATION_COLORS[i % LOCATION_COLORS.length] })

    const evts = apts.map(b => ({
      id: b.id,
      title: `${b.apartment?.apartment_number} · ${b.client?.full_name}`,
      start: b.check_in_date,
      end: b.check_out_date,
      backgroundColor: colorMap[b.apartment?.location_id] || '#1e3a5f',
      borderColor: 'transparent',
      extendedProps: { bookingId: b.id },
    }))
    setEvents(evts)
  }

  function handleEventClick({ event }) {
    navigate(`/bookings/${event.extendedProps.bookingId}`)
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-xl font-bold text-gray-900">Calendar</h1>
        <Select value={filterLocation} onChange={e => setFilterLocation(e.target.value)} className="w-36 h-9 text-xs" disabled={isRestricted}>
          <option value="">All locations</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {locations.map((loc, i) => (
          <div key={loc.id} className="flex items-center gap-1.5 text-xs text-gray-600">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: LOCATION_COLORS[i % LOCATION_COLORS.length] }} />
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
    </div>
  )
}
