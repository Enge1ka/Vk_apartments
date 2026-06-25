import { useState, useEffect } from 'react'
import { supabase } from '@/shared/lib/supabase'

export function useBookings(filters = {}) {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchBookings()
  }, [JSON.stringify(filters)])

  async function fetchBookings() {
    setLoading(true)
    let query = supabase
      .from('bookings')
      .select(`
        *,
        client:clients(id, full_name, phone, nrc_or_passport, company),
        apartment:apartments(id, apartment_number, type, daily_rate, location:locations(id, name, city))
      `)
      .order('created_at', { ascending: false })

    if (filters.status) query = query.eq('booking_status', filters.status)
    if (filters.paymentStatus) query = query.eq('payment_status', filters.paymentStatus)
    if (filters.locationId) query = query.eq('apartment.location_id', filters.locationId)
    if (filters.search) {
      query = query.or(`booking_reference.ilike.%${filters.search}%`)
    }

    const { data, error } = await query
    if (error) setError(error)
    else setBookings(data || [])
    setLoading(false)
  }

  return { bookings, loading, error, refetch: fetchBookings }
}
