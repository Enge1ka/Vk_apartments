import { useSupabaseQuery } from '@/shared/hooks/useSupabaseQuery'
import { listApartments } from '@/features/apartments/api'
import { getBookingStatusSummary, listOutstandingBookings } from '@/features/bookings/api'
import { listPayments } from '@/features/payments/api'
import { summarizeOccupancy, summarizeOutstanding, summarizeRevenue } from './selectors'

interface UseReportsDataArgs {
  isRestricted: boolean
  locationId: string | null
  dateFrom?: string
  dateTo?: string
}

export function useReportsData({ isRestricted, locationId, dateFrom, dateTo }: UseReportsDataArgs) {
  const locationFilter = isRestricted && locationId ? locationId : undefined

  const { data, loading, error } = useSupabaseQuery(async () => {
    const [payments, outstandingBookings, apartments, bookingSummary] = await Promise.all([
      listPayments({ locationId: locationFilter, dateFrom, dateTo }),
      listOutstandingBookings(locationFilter ?? null),
      listApartments(locationFilter ? { locationId: locationFilter } : {}),
      getBookingStatusSummary(locationFilter ?? null),
    ])

    return {
      revenue: summarizeRevenue(payments),
      outstanding: summarizeOutstanding(outstandingBookings),
      occupancy: summarizeOccupancy(apartments),
      bookingSummary,
    }
  }, [isRestricted, locationId, dateFrom, dateTo], 'reports.loadAll')

  return {
    revenue: data?.revenue ?? { total: 0, byMethod: [], byLocation: [], byApartment: [], daily: [] },
    outstanding: data?.outstanding ?? { total: 0, bookings: [] },
    occupancy: data?.occupancy ?? { current: 0, total: 0, byLocation: [] },
    bookingSummary: data?.bookingSummary ?? { active: 0, upcoming: 0, checkouts: 0, cancelled: 0 },
    loading,
    error,
  }
}
