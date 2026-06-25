import { useEffect, useRef } from 'react'
import { useSupabaseQuery } from '@/shared/hooks/useSupabaseQuery'
import { listApartments, subscribeToApartmentChanges } from './api'
import { listLocations } from '@/features/locations/api'

// Combines apartments + locations into one load for the Apartments page,
// scoped to the caller's location when restricted, with realtime refresh.
export function useApartmentsPage({ isRestricted, locationId }) {
  const { data, loading, error, refetch } = useSupabaseQuery(async () => {
    if (isRestricted && !locationId) return { apartments: [], locations: [] }
    const [apartments, locations] = await Promise.all([
      listApartments(isRestricted ? { locationId } : {}),
      listLocations(),
    ])
    return { apartments, locations }
  }, [isRestricted, locationId])

  // Keep a stable reference to the latest refetch so the realtime subscription
  // (set up once) never calls a stale closure bound to an old isRestricted/locationId.
  const refetchRef = useRef(refetch)
  useEffect(() => {
    refetchRef.current = refetch
  })

  useEffect(() => {
    return subscribeToApartmentChanges(() => refetchRef.current())
  }, [])

  return {
    apartments: data?.apartments ?? [],
    locations: data?.locations ?? [],
    loading,
    error,
    refetch,
  }
}
