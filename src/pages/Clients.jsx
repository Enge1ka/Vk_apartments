import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Search, Users } from 'lucide-react'

export default function Clients() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => { fetchClients() }, [])

  async function fetchClients() {
    setLoading(true)
    const { data } = await supabase
      .from('clients')
      .select('*, bookings(id, booking_reference, total_amount, booking_status, check_in_date)')
      .order('created_at', { ascending: false })
    setClients(data || [])
    setLoading(false)
  }

  const filtered = clients.filter(c => {
    const q = search.toLowerCase()
    return !search || c.full_name?.toLowerCase().includes(q) || c.phone?.includes(q) || c.nrc_or_passport?.toLowerCase().includes(q)
  })

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-gray-900 pt-2">Clients</h1>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input placeholder="Search by name, phone, NRC…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="text-center text-sm text-gray-400 py-8">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Users size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">No clients found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => (
            <Card key={c.id}>
              <CardContent className="p-4">
                <p className="font-semibold text-gray-900">{c.full_name}</p>
                <p className="text-sm text-gray-500">{c.phone}</p>
                {c.nrc_or_passport && <p className="text-xs text-gray-400">NRC: {c.nrc_or_passport}</p>}
                {c.company && <p className="text-xs text-gray-400">{c.company}</p>}
                {c.bookings?.length > 0 && (
                  <p className="text-xs text-gray-400 mt-2">{c.bookings.length} booking{c.bookings.length !== 1 ? 's' : ''}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
