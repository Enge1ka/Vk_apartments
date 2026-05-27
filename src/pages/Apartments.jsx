import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '@/components/ui/Dialog'
import { Label } from '@/components/ui/Label'
import { formatCurrency } from '@/lib/bookingUtils'
import { useAuth } from '@/hooks/useAuth'
import { Plus, Search, Building2, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'

const statusBadge = {
  available: { variant: 'success', label: 'Available' },
  occupied: { variant: 'danger', label: 'Occupied' },
  maintenance: { variant: 'default', label: 'Maintenance' },
}

const EMPTY_FORM = {
  location_id: '',
  apartment_number: '',
  type: 'Studio',
  daily_rate: '',
  weekly_rate: '',
  monthly_rate: '',
  status: 'available',
  notes: '',
}

function ApartmentCard({ apt, onEdit }) {
  const badge = statusBadge[apt.status] || { variant: 'default', label: apt.status }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="font-bold text-gray-900 text-lg">{apt.apartment_number}</p>
            <p className="text-sm text-gray-500">{apt.type} - {apt.location?.name}</p>
          </div>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        <div className="flex gap-3 text-sm text-gray-600 mt-3">
          <span>{formatCurrency(apt.daily_rate)}/day</span>
          {apt.monthly_rate && <span>{formatCurrency(apt.monthly_rate)}/month</span>}
        </div>
        {apt.notes && <p className="text-xs text-gray-400 mt-2">{apt.notes}</p>}
        <button onClick={() => onEdit(apt)} className="mt-3 text-xs text-[#1e3a5f] font-medium hover:underline">
          Edit
        </button>
      </CardContent>
    </Card>
  )
}

export default function Apartments() {
  const { isRestricted, locationId } = useAuth()
  const [apartments, setApartments] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterLocation, setFilterLocation] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [locationDialogOpen, setLocationDialogOpen] = useState(false)
  const [dbError, setDbError] = useState(null)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [locationForm, setLocationForm] = useState({ name: '', city: '' })
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
    let aptQuery = supabase.from('apartments').select('*, location:locations(id, name)').order('apartment_number')
    if (isRestricted && locationId) aptQuery = aptQuery.eq('location_id', locationId)

    const [aptRes, locRes] = await Promise.all([
      aptQuery,
      supabase.from('locations').select('*').order('name'),
    ])

    const setupError = aptRes.error || locRes.error
    if (setupError) {
      setDbError(setupError)
      setApartments([])
      setLocations([])
      setLoading(false)
      return
    }

    setDbError(null)
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
    const defaultLoc = isRestricted ? locationId : (locations[0]?.id || '')
    setForm({ ...EMPTY_FORM, location_id: defaultLoc })
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
      apartment_number: form.apartment_number.trim(),
      type: form.type,
      daily_rate: Number(form.daily_rate),
      weekly_rate: form.weekly_rate ? Number(form.weekly_rate) : null,
      monthly_rate: form.monthly_rate ? Number(form.monthly_rate) : null,
      status: form.status,
      notes: form.notes.trim() || null,
    }

    const { error } = editing
      ? await supabase.from('apartments').update(payload).eq('id', editing.id)
      : await supabase.from('apartments').insert(payload)

    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }

    toast.success(editing ? 'Apartment updated' : 'Apartment added')
    setDialogOpen(false)
    fetchAll()
  }

  async function saveLocation() {
    const name = locationForm.name.trim()
    if (!name) {
      toast.error('Location name is required')
      return
    }

    setSaving(true)
    const { data, error } = await supabase
      .from('locations')
      .insert({ name, city: locationForm.city.trim() || null })
      .select('id')
      .single()

    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }

    toast.success('Location added')
    setLocationDialogOpen(false)
    setLocationForm({ name: '', city: '' })
    await fetchAll()
    setForm(f => ({ ...f, location_id: data?.id || f.location_id }))
  }

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm(f => ({ ...f, [key]: e.target.value })),
  })

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-xl font-bold text-gray-900">Apartments</h1>
        <Button size="sm" onClick={openNew}><Plus size={16} /> Add</Button>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input placeholder="Search apartment..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
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

      {dbError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <MapPin size={32} className="text-amber-500 mb-3" />
          <h2 className="font-semibold text-amber-950">Database setup required</h2>
          <p className="text-sm text-amber-800 mt-2">
            Supabase does not have the required locations/apartments tables yet. Run supabase-schema.sql in your Supabase SQL Editor, then refresh this page.
          </p>
          <p className="mt-3 rounded-xl bg-white/70 p-3 text-xs font-mono text-amber-900">
            {dbError.message}
          </p>
        </div>
      ) : loading ? (
        <div className="text-center text-sm text-gray-400 py-8">Loading...</div>
      ) : locations.length === 0 ? (
        <div className="text-center py-12">
          <MapPin size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Add a location first</p>
          <p className="text-sm text-gray-400 mt-1 mb-4">Apartments belong to a location such as Nkana East or Ndola.</p>
          <Button onClick={() => setLocationDialogOpen(true)}>
            <Plus size={16} /> Add Location
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Building2 size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">No apartments found</p>
          <Button className="mt-4" onClick={openNew}>
            <Plus size={16} /> Add Apartment
          </Button>
        </div>
      ) : (
        Object.values(grouped).map(({ name, apts }) => apts.length > 0 && (
          <div key={name}>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">{name}</h2>
            <div className="grid grid-cols-1 gap-3">
              {apts.map(apt => (
                <ApartmentCard key={apt.id} apt={apt} onEdit={openEdit} />
              ))}
            </div>
          </div>
        ))
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogHeader onClose={() => setDialogOpen(false)}>
          <DialogTitle>{editing ? 'Edit Apartment' : 'Add Apartment'}</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div>
            <div className="flex items-center justify-between">
              <Label>Location *</Label>
              {!isRestricted && (
                <button
                  type="button"
                  onClick={() => setLocationDialogOpen(true)}
                  className="text-xs font-medium text-[#1e3a5f] hover:underline"
                >
                  Add location
                </button>
              )}
            </div>
            {locations.length > 0 ? (
              <Select {...field('location_id')} disabled={isRestricted}>
                {(isRestricted ? locations.filter(l => l.id === locationId) : locations).map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </Select>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Create a location before saving this apartment.
              </div>
            )}
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
              <Input type="number" min="0" step="0.01" placeholder="0.00" {...field('daily_rate')} />
            </div>
            <div>
              <Label>Weekly</Label>
              <Input type="number" min="0" step="0.01" placeholder="0.00" {...field('weekly_rate')} />
            </div>
            <div>
              <Label>Monthly</Label>
              <Input type="number" min="0" step="0.01" placeholder="0.00" {...field('monthly_rate')} />
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
          <Button className="flex-1" onClick={handleSave} disabled={saving || locations.length === 0}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={locationDialogOpen} onClose={() => setLocationDialogOpen(false)}>
        <DialogHeader onClose={() => setLocationDialogOpen(false)}>
          <DialogTitle>Add Location</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div>
            <Label>Location Name *</Label>
            <Input
              placeholder="e.g. Nkana East"
              value={locationForm.name}
              onChange={e => setLocationForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <Label>City</Label>
            <Input
              placeholder="e.g. Kitwe"
              value={locationForm.city}
              onChange={e => setLocationForm(f => ({ ...f, city: e.target.value }))}
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" className="flex-1" onClick={() => setLocationDialogOpen(false)}>Cancel</Button>
          <Button className="flex-1" onClick={saveLocation} disabled={saving}>
            {saving ? 'Saving...' : 'Save Location'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}
