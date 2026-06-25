import { useSupabaseQuery } from '@/shared/hooks/useSupabaseQuery'
import { getBooking } from './api'
import { listPaymentsForBooking } from '@/features/payments/api'

// Waits for auth to resolve before fetching (isRestricted/locationId aren't
// reliable until the profile loads), then enforces location-scoped access
// for restricted staff before loading payment history.
export function useBookingDetail(id, { isRestricted, locationId, authReady }) {
  const { data, loading, error, refetch } = useSupabaseQuery(async () => {
    if (!authReady) return null
    const booking = await getBooking(id)
    const accessDenied = !!(isRestricted && locationId && booking.apartment?.location?.id !== locationId)
    if (accessDenied) return { booking: null, payments: [], accessDenied: true }
    const payments = await listPaymentsForBooking(id)
    return { booking, payments, accessDenied: false }
  }, [id, authReady], 'bookings.getBookingAndPayments')

  return {
    booking: data?.booking ?? null,
    payments: data?.payments ?? [],
    accessDenied: data?.accessDenied ?? false,
    loading: loading || !authReady,
    error,
    refetch,
  }
}
