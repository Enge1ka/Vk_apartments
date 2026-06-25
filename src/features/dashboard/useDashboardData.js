import { useSupabaseQuery } from '@/shared/hooks/useSupabaseQuery'
import { listApartments } from '@/features/apartments/api'
import { listLocations } from '@/features/locations/api'
import { listUpcomingCheckIns, listUpcomingCheckOuts } from '@/features/bookings/api'
import { listPayments } from '@/features/payments/api'
import { APARTMENT_STATUS } from '@/shared/constants/status'

function todayIsoRange(days = 0) {
  const today = new Date().toISOString().split('T')[0]
  const to = new Date(Date.now() + days * 86400000).toISOString().split('T')[0]
  return { today, to }
}

// Composes apartments/locations/bookings/payments into the dashboard's
// view model. Doesn't own a table itself — every read goes through the
// owning feature's api.js.
export function useDashboardData({ isRestricted, locationId }) {
  const { data, loading, refetch } = useSupabaseQuery(async () => {
    const { today, to: in3Days } = todayIsoRange(3)
    const locationFilter = isRestricted && locationId ? locationId : undefined

    const [apartments, locations, checkIns, checkOuts, todaysPayments, recentPayments] = await Promise.all([
      listApartments(locationFilter ? { locationId: locationFilter } : {}),
      listLocations(),
      listUpcomingCheckIns({ locationId: locationFilter, fromDate: today, toDate: in3Days }),
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
      upcomingCheckIns: checkIns,
      upcomingCheckOuts: checkOuts,
      recentPayments,
    }
  }, [isRestricted, locationId])

  return {
    stats: data?.stats ?? { total: 0, occupied: 0, available: 0, maintenance: 0, todayRevenue: 0 },
    locationStats: data?.locationStats ?? [],
    upcomingCheckIns: data?.upcomingCheckIns ?? [],
    upcomingCheckOuts: data?.upcomingCheckOuts ?? [],
    recentPayments: data?.recentPayments ?? [],
    loading,
    refetch,
  }
}
