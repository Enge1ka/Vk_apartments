import { useEffect, useRef } from 'react'
import { useSupabaseQuery } from '@/shared/hooks/useSupabaseQuery'
import { listApartments } from '@/features/apartments/api'
import { listLocations } from '@/features/locations/api'
import { listInHouse, listUpcomingCheckIns, listUpcomingCheckOuts, subscribeToBookingChanges } from '@/features/bookings/api'
import { listPayments } from '@/features/payments/api'
import { APARTMENT_STATUS } from '@/shared/constants/status'
import { toLocalISODate, todayLocalISO } from '@/shared/lib/bookingUtils'

interface UseDashboardDataArgs {
  isRestricted: boolean
  locationId: string | null
}

function todayIsoRange(days = 0) {
  const today = todayLocalISO()
  const to = toLocalISODate(new Date(Date.now() + days * 86400000))
  return { today, to }
}

// Composes apartments/locations/bookings/payments into the dashboard's
// view model. Doesn't own a table itself — every read goes through the
// owning feature's api.ts.
export function useDashboardData({ isRestricted, locationId }: UseDashboardDataArgs) {
  const { data, loading, error, refetch } = useSupabaseQuery(async () => {
    const { today, to: in3Days } = todayIsoRange(3)
    // Upcoming check-ins start tomorrow: a booking whose stay covers today
    // belongs under "Currently in-house", not "upcoming" (fixes bookings for
    // a current stay reading as upcoming even after their check-in date).
    const tomorrow = toLocalISODate(new Date(Date.now() + 86400000))
    const locationFilter = isRestricted && locationId ? locationId : undefined

    const [apartments, locations, inHouse, checkIns, checkOuts, todaysPayments, recentPayments] = await Promise.all([
      listApartments(locationFilter ? { locationId: locationFilter } : {}),
      listLocations(),
      listInHouse(locationFilter ?? null),
      listUpcomingCheckIns({ locationId: locationFilter, fromDate: tomorrow, toDate: in3Days }),
      listUpcomingCheckOuts({ locationId: locationFilter, fromDate: today, toDate: in3Days }),
      listPayments({ locationId: locationFilter, dateFrom: today, dateTo: today }),
      listPayments({ locationId: locationFilter, limit: 5 }),
    ])

    const visibleLocations = isRestricted && locationId ? locations.filter(l => l.id === locationId) : locations
    const locationStats = visibleLocations.map(loc => {
      const locApartments = apartments.filter(a => a.location_id === loc.id)
      return {
        ...loc,
        total: locApartments.length,
        occupied: locApartments.filter(a => a.status === APARTMENT_STATUS.OCCUPIED).length,
      }
    })

    return {
      stats: {
        total: apartments.length,
        occupied: apartments.filter(a => a.status === APARTMENT_STATUS.OCCUPIED).length,
        available: apartments.filter(a => a.status === APARTMENT_STATUS.AVAILABLE).length,
        maintenance: apartments.filter(a => a.status === APARTMENT_STATUS.MAINTENANCE).length,
        todayRevenue: todaysPayments.reduce((sum, p) => sum + Number(p.amount), 0),
      },
      locationStats,
      inHouse,
      upcomingCheckIns: checkIns,
      upcomingCheckOuts: checkOuts,
      recentPayments,
    }
  }, [isRestricted, locationId], 'dashboard.loadAll')

  // Stable ref so the realtime subscription (set up once) never calls a
  // stale closure bound to an old isRestricted/locationId (mirrors useApartmentsPage).
  const refetchRef = useRef(refetch)
  useEffect(() => { refetchRef.current = refetch })
  useEffect(() => subscribeToBookingChanges(() => refetchRef.current()), [])

  return {
    stats: data?.stats ?? { total: 0, occupied: 0, available: 0, maintenance: 0, todayRevenue: 0 },
    locationStats: data?.locationStats ?? [],
    inHouse: data?.inHouse ?? [],
    upcomingCheckIns: data?.upcomingCheckIns ?? [],
    upcomingCheckOuts: data?.upcomingCheckOuts ?? [],
    recentPayments: data?.recentPayments ?? [],
    loading,
    error,
    refetch,
  }
}
