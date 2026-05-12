import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '@/components/ui/Dialog'
import { Label } from '@/components/ui/Label'
import { formatCurrency } from '@/lib/bookingUtils'
import { Plus, Search, Building2 } from 'lucide-react'
import toast from 'react-hot-toast'

const statusBadge = {
  available: { variant: 'success', label: 'Available' },
  occupied: { variant: 'danger', label: 'Occupied' },
  maintenance: { variant: 'default', label: 'Maintenance' },
}

function ApartmentCard({ apt, isAdmin, onEdit }) {
  const badge = statusBadge[apt.status] || { variant: 'default', label: apt.status }
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="font-bold text-gray-900 text-lg">{apt.apartment_number}</p>
            <p className="text-sm text-gray-500">{apt.type} · {apt.location?.name}</p>
          </div>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        <div className="flex gap-3 text-sm text-gray-600 mt-3">
          <span>{formatCurrency(apt.daily_rate)}/day</span>
          {apt.monthly_rate && <span>{formatCurrency(apt.monthly_rate)}/month</span>}
        </div>
        {apt.notes && <p className="text-xs text-gray-400 mt-2">{apt.notes}</p>}
        {isAdmin && (
          <button onClick={() => onEdit(apt)} className="mt-3 text-xs text-[#1e3a5f] font-medium hover:underline">
            Edit
          </button>
        )}
      </CardContent>
    </Card>
  )
}

const EMPTY_FORM = {
  location_id: '', apartment_number: '', type: 'Studio',
  daily_rate: '', weekly_rate: '', monthly_rate: '', status: 'available', notes: '',
}

export default function Apartments() {
  const { isAdmin } = useAuth()
  const [apartments, setApartments] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterLocation, setFilterLocation] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchAll()
    const channel = supabase
      .channel('apts-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'apartments' }, fetchAll)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  async function fetchAll() {
    setLoading(true)
    const [aptRes, locRes] = await Promise.all([
      supabase.from('apartments').select('*, location:locations(id, name)').order('apartment_number'),
      supabase.from('locations').select('*').order('name'),
    ])
    setApartments(aptRes.data || [])
    setLocations(locRes.data || [])
    setLoading(false)
  }

  const filtered = apartments.filter(a => {
    const matchSearch = !search || a.apartment_number.toLowerCase().includes(search.toLowerCase())
    const matchLoc = !filterLocation || a.location_id === filterLocation
    const matchStatus = !filterStatus || a.status === filterStatus
    return matchSearch && matchLoc && matchStatus
  })

  const grouped = locations.reduce((acc, loc) => {
    const apts = filtered.filter(a => a.location_id === loc.id)
    if (apts.length > 0 || !filterLocation) acc[loc.id] = { name: loc.name, apts }
    return acc
  }, {})

  function openNew() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, location_id: locations[0]?.id || '' })
    setDialogOpen(true)
  }

  function openEdit(apt) {
    setEditing(apt)
    setForm({
      location_id: apt.location_id,
      apartment_number: apt.apartment_number,
      type: apt.type,
      daily_rate: apt.daily_rate,
      weekly_rate: apt.weekly_rate || '',
      monthly_rate: apt.monthly_rate || '',
      status: apt.status,
      notes: apt.notes || '',
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.location_id || !form.apartment_number || !form.daily_rate) {
      toast.error('Fill in all required fields')
      return
    }
    setSaving(true)
    const payload = {
      location_id: form.location_id,
      apartment_number: form.apartment_number,
      type: form.type,
      daily_rate: Number(form.daily_rate),
      weekly_rate: form.weekly_rate ? Number(form.weekly_rate) : null,
      monthly_rate: form.monthly_rate ? Number(form.monthly_rate) : null,
      status: form.status,
      notes: form.notes || null,
    }

    let error
    if (editing) {
      ({ error } = await supabase.from('apartments').update(payload).eq('id', editing.id))
    } else {
      ({ error } = await supabase.from('apartments').insert(payload))
    }
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(editing ? 'Apartment updated' : 'Apartment added')
    setDialogOpen(false)
    fetchAll()
  }

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm(f => ({ ...f, [key]: e.target.value })),
  })

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-xl font-bold text-gray-900">Apartments</h1>
        {isAdmin && (
          <Button size="sm" onClick={openNew}><Plus size={16} /> Add</Button>
        )}
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input placeholder="Search apartment…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Select value={filterLocation} onChange={e => setFilterLocation(e.target.value)} className="flex-1 h-10 text-xs">
            <option value="">All locations</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
          <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="flex-1 h-10 text-xs">
            <option value="">All statuses</option>
            <option value="available">Available</option>
            <option value="occupied">Occupied</option>
            <option value="maintenance">Maintenance</option>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-sm text-gray-400 py-8">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Building2 size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">No apartments found</p>
        </div>
      ) : (
        Object.values(grouped).map(({ name, apts }) => apts.length > 0 && (
          <div key={name}>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">{name}</h2>
            <div className="grid grid-cols-1 gap-3">
              {apts.map(apt => (
                <ApartmentCard key={apt.id} apt={apt} isAdmin={isAdmin} onEdit={openEdit} />
              ))}
            </div>
          </div>
        ))
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogHeader onClose={() => setDialogOpen(false)}>
          <DialogTitle>{editing ? 'Edit Apartment' : 'Add Apartment'}</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div>
            <Label>Location *</Label>
            <Select {...field('location_id')}>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Apartment No. *</Label>
              <Input placeholder="e.g. A01" {...field('apartment_number')} />
            </div>
            <div>
              <Label>Type</Label>
              <Select {...field('type')}>
                <option>Studio</option>
                <option>1 Bedroom</option>
                <option>2 Bedroom</option>
                <option>3 Bedroom</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Daily Rate *</Label>
              <Input type="number" placeholder="0.00" {...field('daily_rate')} />
            </div>
            <div>
              <Label>Weekly</Label>
              <Input type="number" placeholder="0.00" {...field('weekly_rate')} />
            </div>
            <div>
              <Label>Monthly</Label>
              <Input type="number" placeholder="0.00" {...field('monthly_rate')} />
            </div>
          </div>
          <div>
            <Label>Status</Label>
            <Select {...field('status')}>
              <option value="available">Available</option>
              <option value="occupied">Occupied</option>
              <option value="maintenance">Maintenance</option>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Input placeholder="Optional notes" {...field('notes')} />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}
