import { useEffect, useState } from 'react'

// Replaces the repeated `useState(loading/error/data) + useEffect` pattern
// that was hand-rolled in every page (see useApartments/useBookings, which
// this mirrors). `queryFn` is an async function (usually a feature's api.js
// call) re-run whenever `deps` change.
export function useSupabaseQuery(queryFn, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  async function fetchData() {
    setLoading(true)
    try {
      const result = await queryFn()
      setData(result)
      setError(null)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  return { data, loading, error, refetch: fetchData }
}
