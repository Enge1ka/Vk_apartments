import { useState, type ChangeEvent } from 'react'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Input'
import { Select } from '@/shared/ui/Select'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '@/shared/ui/Dialog'
import { Label } from '@/shared/ui/Label'
import { Plus, Search, Building2, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@/features/auth/useAuth'
import { APARTMENT_STATUS } from '@/shared/constants/status'
import { createApartment, updateApartment, deleteApartment, type Apartment } from '../api'
import { createLocation } from '@/features/locations/api'
import { validateApartment } from '../validators'
import { validateLocation } from '@/features/locations/validators'
import { useApartmentsPage } from '../useApartmentsPage'
import { ApartmentCard } from './ApartmentCard'

interface ApartmentFormState {
  location_id: string
  apartment_number: string
  type: string
  daily_rate: string
  weekly_rate: string
  monthly_rate: string
  status: string
  notes: string
}

const EMPTY_FORM: ApartmentFormState = {
  location_id: '',
  apartment_number: '',
  type: 'Studio',
  daily_rate: '',
  weekly_rate: '',
  monthly_rate: '',
  status: APARTMENT_STATUS.AVAILABLE,
  notes: '',
}

export default function ApartmentsPage() {
  const { isRestricted, locationId } = useAuth()
  const { apartments, locations, loading, error, refetch } = useApartmentsPage({ isRestricted, locationId })

  const [search, setSearch] = useState('')
  const [filterLocation, setFilterLocation] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [locationDialogOpen, setLocationDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Apartment | null>(null)
  const [form, setForm] = useState<ApartmentFormState>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [locationForm, setLocationForm] = useState({ name: '', city: '' })
  const [locationFormErrors, setLocationFormErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const filtered = apartments.filter(a => {
    const matchSearch = !search || a.apartment_number.toLowerCase().includes(search.toLowerCase())
    const matchLoc = !filterLocation || a.location_id === filterLocation
    const matchStatus = !filterStatus || a.status === filterStatus
    return matchSearch && matchLoc && matchStatus
  })

  const grouped = locations.reduce<Record<string, { name: string; apts: Apartment[] }>>((acc, loc) => {
    const apts = filtered.filter(a => a.location_id === loc.id)
    if (apts.length > 0 || !filterLocation) acc[loc.id] = { name: loc.name, apts }
    return acc
  }, {})

  function openNew() {
    setEditing(null)
    setFormErrors({})
    const defaultLoc = isRestricted ? (locationId ?? '') : (locations[0]?.id || '')
    setForm({ ...EMPTY_FORM, location_id: defaultLoc })
    setDialogOpen(true)
  }

  function openEdit(apt: Apartment) {
    setEditing(apt)
    setFormErrors({})
    setForm({
      location_id: apt.location_id,
      apartment_number: apt.apartment_number,
      type: apt.type,
      daily_rate: String(apt.daily_rate),
      weekly_rate: apt.weekly_rate ? String(apt.weekly_rate) : '',
      monthly_rate: apt.monthly_rate ? String(apt.monthly_rate) : '',
      status: apt.status,
      notes: apt.notes || '',
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const { valid, data, errors } = validateApartment(form)
    setFormErrors(errors)
    if (!valid) {
      toast.error('Fix the highlighted fields')
      return
    }

    setSaving(true)
    const payload = {
      ...data,
      apartment_number: data.apartment_number,
      weekly_rate: data.weekly_rate ?? null,
      monthly_rate: data.monthly_rate ?? null,
      notes: data.notes || null,
    }

    try {
      if (editing) await updateApartment(editing.id, payload)
      else await createApartment(payload)
    } catch (err) {
      setSaving(false)
      toast.error(err instanceof Error ? err.message : String(err))
      return
    }

    setSaving(false)
    toast.success(editing ? 'Apartment updated' : 'Apartment added')
    setDialogOpen(false)
    refetch()
  }

  async function handleDelete(apt: Apartment) {
    if (!window.confirm(`Delete apartment ${apt.apartment_number}? This can't be undone.`)) return
    try {
      await deleteApartment(apt.id)
      toast.success('Apartment deleted')
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function saveLocation() {
    const { valid, data, errors } = validateLocation(locationForm)
    setLocationFormErrors(errors)
    if (!valid) {
      toast.error('Location name is required')
      return
    }

    setSaving(true)
    let created
    try {
      created = await createLocation(data)
    } catch (err) {
      setSaving(false)
      toast.error(err instanceof Error ? err.message : String(err))
      return
    }

    setSaving(false)
    toast.success('Location added')
    setLocationDialogOpen(false)
    setLocationForm({ name: '', city: '' })
    await refetch()
    setForm(f => ({ ...f, location_id: created?.id || f.location_id }))
  }

  function field(key: keyof ApartmentFormState) {
    return {
      value: form[key],
      onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [key]: e.target.value })),
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-xl font-bold text-gray-900">Apartments</h1>
        <Button size="sm" onClick={openNew}><Plus size={16} /> Add</Button>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <Label htmlFor="apartment-search" className="sr-only">Search apartment</Label>
          <Input id="apartment-search" placeholder="Search apartment..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Label htmlFor="filter-location" className="sr-only">Filter by location</Label>
          <Select id="filter-location" value={filterLocation} onChange={e => setFilterLocation(e.target.value)} className="flex-1 h-10 text-xs">
            <option value="">All locations</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
          <Label htmlFor="filter-status" className="sr-only">Filter by status</Label>
          <Select id="filter-status" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="flex-1 h-10 text-xs">
            <option value="">All statuses</option>
            <option value={APARTMENT_STATUS.AVAILABLE}>Available</option>
            <option value={APARTMENT_STATUS.OCCUPIED}>Occupied</option>
            <option value={APARTMENT_STATUS.MAINTENANCE}>Maintenance</option>
          </Select>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <MapPin size={32} className="text-amber-500 mb-3" />
          <h2 className="font-semibold text-amber-950">Database setup required</h2>
          <p className="text-sm text-amber-800 mt-2">
            Supabase does not have the required locations/apartments tables yet. Run supabase-schema.sql in your Supabase SQL Editor, then refresh this page.
          </p>
          <p className="mt-3 rounded-xl bg-white/70 p-3 text-xs font-mono text-amber-900">
            {error.message}
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
                <ApartmentCard key={apt.id} apt={apt} onEdit={openEdit} onDelete={handleDelete} />
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
              <Label htmlFor="apt-location">Location *</Label>
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
              <Select id="apt-location" {...field('location_id')} disabled={isRestricted} aria-invalid={!!formErrors.location_id}>
                {(isRestricted ? locations.filter(l => l.id === locationId) : locations).map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </Select>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Create a location before saving this apartment.
              </div>
            )}
            {formErrors.location_id && <p className="text-xs text-red-500 mt-1">{formErrors.location_id}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="apt-number">Apartment No. *</Label>
              <Input id="apt-number" placeholder="e.g. A01" {...field('apartment_number')} aria-invalid={!!formErrors.apartment_number} />
              {formErrors.apartment_number && <p className="text-xs text-red-500 mt-1">{formErrors.apartment_number}</p>}
            </div>
            <div>
              <Label htmlFor="apt-type">Type</Label>
              <Select id="apt-type" {...field('type')}>
                <option>Studio</option>
                <option>1 Bedroom</option>
                <option>2 Bedroom</option>
                <option>3 Bedroom</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="apt-daily-rate">Daily Rate *</Label>
              <Input id="apt-daily-rate" type="number" min="0" step="0.01" placeholder="0.00" {...field('daily_rate')} aria-invalid={!!formErrors.daily_rate} />
              {formErrors.daily_rate && <p className="text-xs text-red-500 mt-1">{formErrors.daily_rate}</p>}
            </div>
            <div>
              <Label htmlFor="apt-weekly-rate">Weekly</Label>
              <Input id="apt-weekly-rate" type="number" min="0" step="0.01" placeholder="0.00" {...field('weekly_rate')} aria-invalid={!!formErrors.weekly_rate} />
              {formErrors.weekly_rate && <p className="text-xs text-red-500 mt-1">{formErrors.weekly_rate}</p>}
            </div>
            <div>
              <Label htmlFor="apt-monthly-rate">Monthly</Label>
              <Input id="apt-monthly-rate" type="number" min="0" step="0.01" placeholder="0.00" {...field('monthly_rate')} aria-invalid={!!formErrors.monthly_rate} />
              {formErrors.monthly_rate && <p className="text-xs text-red-500 mt-1">{formErrors.monthly_rate}</p>}
            </div>
          </div>
          <div>
            <Label htmlFor="apt-status">Status</Label>
            <Select id="apt-status" {...field('status')}>
              <option value={APARTMENT_STATUS.AVAILABLE}>Available</option>
              <option value={APARTMENT_STATUS.OCCUPIED}>Occupied</option>
              <option value={APARTMENT_STATUS.MAINTENANCE}>Maintenance</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="apt-notes">Notes</Label>
            <Input id="apt-notes" placeholder="Optional notes" {...field('notes')} />
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
            <Label htmlFor="loc-name">Location Name *</Label>
            <Input
              id="loc-name"
              placeholder="e.g. Nkana East"
              value={locationForm.name}
              onChange={e => setLocationForm(f => ({ ...f, name: e.target.value }))}
              aria-invalid={!!locationFormErrors.name}
            />
            {locationFormErrors.name && <p className="text-xs text-red-500 mt-1">{locationFormErrors.name}</p>}
          </div>
          <div>
            <Label htmlFor="loc-city">City</Label>
            <Input
              id="loc-city"
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
