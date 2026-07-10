import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/shared/ui/Card'
import { Input } from '@/shared/ui/Input'
import { Label } from '@/shared/ui/Label'
import { Search, Users, ChevronRight } from 'lucide-react'
import { useSupabaseQuery } from '@/shared/hooks/useSupabaseQuery'
import { ErrorBanner } from '@/shared/ui/ErrorBanner'
import { listClients } from '../api'

export default function ClientsPage() {
  const { data: clients, loading, error } = useSupabaseQuery(listClients, [], 'clients.listClients')
  const [search, setSearch] = useState('')

  const filtered = (clients ?? []).filter(c => {
    const q = search.toLowerCase()
    return !search || c.full_name?.toLowerCase().includes(q) || c.phone?.includes(q) || c.nrc_or_passport?.toLowerCase().includes(q)
  })

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-gray-900 pt-2">Clients</h1>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        <Label htmlFor="client-search" className="sr-only">Search clients</Label>
        <Input id="client-search" placeholder="Search by name, phone, NRC…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {error ? (
        <ErrorBanner error={error} />
      ) : loading ? (
        <div className="text-center text-sm text-gray-400 py-8">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Users size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">No clients found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => (
            <Link key={c.id} to={`/clients/${c.id}`}>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{c.full_name}</p>
                    <p className="text-sm text-gray-500">{c.phone}</p>
                    {c.nrc_or_passport && <p className="text-xs text-gray-400">NRC: {c.nrc_or_passport}</p>}
                    {c.company && <p className="text-xs text-gray-400">{c.company}</p>}
                    {(c.bookings?.length ?? 0) > 0 && (
                      <p className="text-xs text-gray-400 mt-2">{c.bookings?.length} booking{c.bookings?.length !== 1 ? 's' : ''}</p>
                    )}
                  </div>
                  <ChevronRight size={18} className="text-gray-300 shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
