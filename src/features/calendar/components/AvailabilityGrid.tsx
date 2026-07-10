import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSupabaseQuery } from '@/shared/hooks/useSupabaseQuery'
import { listApartments } from '@/features/apartments/api'
import { listRoomOccupancy } from '@/features/bookings/api'
import { toLocalISODate } from '@/shared/lib/bookingUtils'
import { ErrorBanner } from '@/shared/ui/ErrorBanner'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const WINDOW_DAYS = 14

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toLocalISODate(d)
}

// Room-per-row, day-per-column availability grid for one location, so staff
// can answer "which apartments are free next week?" at a glance. A cell is
// booked when a non-cancelled room covers that day (half-open: check-out day
// itself is free, ready for a same-day turnover).
export default function AvailabilityGrid({ locationId }: { locationId: string | null }) {
  const navigate = useNavigate()
  const [startDate, setStartDate] = useState(() => toLocalISODate(new Date()))
  const endDate = addDays(startDate, WINDOW_DAYS) // exclusive upper bound

  const { data, loading, error } = useSupabaseQuery(async () => {
    if (!locationId) return { apartments: [], occ: [] }
    const [apartments, occ] = await Promise.all([
      listApartments({ locationId }),
      listRoomOccupancy(locationId, startDate, endDate),
    ])
    return { apartments, occ }
  }, [locationId, startDate], 'calendar.availabilityGrid')

  const days = useMemo(() => Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(startDate, i)), [startDate])

  if (!locationId) {
    return <div className="text-center text-sm text-gray-400 py-10">Pick a location to see its availability grid.</div>
  }
  if (error) return <ErrorBanner error={error} />
  if (loading) return <div className="text-center text-sm text-gray-400 py-8">Loading…</div>

  const apartments = data?.apartments ?? []
  const occ = data?.occ ?? []

  const bookingOn = (apartmentId: string, day: string) =>
    occ.find(o => o.apartment_id === apartmentId && o.check_in_date <= day && o.check_out_date > day)

  const fmtDay = (iso: string) => {
    const d = new Date(iso + 'T00:00:00')
    return { dow: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2), dom: d.getDate() }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button onClick={() => setStartDate(addDays(startDate, -WINDOW_DAYS))} aria-label="Previous two weeks" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronLeft size={18} /></button>
        <span className="text-sm font-medium text-gray-700">{startDate} → {addDays(startDate, WINDOW_DAYS - 1)}</span>
        <button onClick={() => setStartDate(addDays(startDate, WINDOW_DAYS))} aria-label="Next two weeks" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronRight size={18} /></button>
      </div>

      {apartments.length === 0 ? (
        <div className="text-center text-sm text-gray-400 py-8">No apartments at this location.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-600 border-b border-r border-gray-100">Apartment</th>
                {days.map(d => {
                  const { dow, dom } = fmtDay(d)
                  return (
                    <th key={d} className="px-1 py-1.5 text-center font-medium text-gray-400 border-b border-gray-100 min-w-[30px]">
                      <div>{dow}</div><div className="text-gray-700">{dom}</div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {apartments.map(a => (
                <tr key={a.id}>
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-gray-700 border-r border-gray-100 whitespace-nowrap">{a.apartment_number}</td>
                  {days.map(d => {
                    const b = bookingOn(a.id, d)
                    return (
                      <td key={d} className="p-0.5 border-b border-gray-50">
                        {b ? (
                          <button
                            onClick={() => navigate(`/bookings/${b.booking_id}`)}
                            title={`${b.client_name ?? 'Booked'} — tap for booking`}
                            aria-label={`${a.apartment_number} booked on ${d}`}
                            className="w-full h-6 rounded bg-[#1e3a5f]/80 hover:bg-[#1e3a5f] cursor-pointer"
                          />
                        ) : (
                          <div aria-label={`${a.apartment_number} free on ${d}`} className="w-full h-6 rounded bg-green-50" />
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-50 border border-green-200" /> Free</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#1e3a5f]/80" /> Booked</span>
      </div>
    </div>
  )
}
