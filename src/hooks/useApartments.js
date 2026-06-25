import { useState, useEffect } from 'react'
import { supabase } from '@/shared/lib/supabase'

export function useApartments(filters = {}) {
  const [apartments, setApartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchApartments()

    const channel = supabase
      .channel('apartments-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'apartments' }, fetchApartments)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [JSON.stringify(filters)])

  async function fetchApartments() {
    setLoading(true)
    let query = supabase
      .from('apartments')
      .select('*, location:locations(id, name, city)')
      .order('apartment_number')

    if (filters.locationId) query = query.eq('location_id', filters.locationId)
    if (filters.status) query = query.eq('status', filters.status)
    if (filters.type) query = query.eq('type', filters.type)

    const { data, error } = await query
    if (error) setError(error)
    else setApartments(data || [])
    setLoading(false)
  }

  return { apartments, loading, error, refetch: fetchApartments }
}
