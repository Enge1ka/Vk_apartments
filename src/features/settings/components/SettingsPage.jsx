import { useState } from 'react'
import { assignProfileLocation, listProfiles, setProfileRole } from '@/features/auth/api'
import { listLocations, createLocation } from '@/features/locations/api'
import { validateLocation } from '@/features/locations/validators'
import { useSupabaseQuery } from '@/shared/hooks/useSupabaseQuery'
import { Card, CardContent } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Input'
import { Label } from '@/shared/ui/Label'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '@/shared/ui/Dialog'
import { Badge } from '@/shared/ui/Badge'
import { Select } from '@/shared/ui/Select'
import { Plus, MapPin, ClipboardList } from 'lucide-react'
import toast from 'react-hot-toast'
import PerformanceTab from '@/features/monitoring/components/PerformanceTab'

const TABS = ['Users', 'Locations', 'Audit Log', 'Performance']

export default function SettingsPage() {
  // Route-level access control: this page is only ever rendered inside
  // <ProtectedRoute adminOnly>, which reactively redirects non-admins —
  // no need to duplicate that check here.
  const [tab, setTab] = useState('Users')
  const [userDialog, setUserDialog] = useState(false)
  const [locDialog, setLocDialog] = useState(false)
  const [locForm, setLocForm] = useState({ name: '', city: '' })
  const [locFormErrors, setLocFormErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const { data, refetch } = useSupabaseQuery(async () => {
    const [users, locations] = await Promise.all([listProfiles(), listLocations()])
    return { users, locations }
  }, [], 'settings.listUsersAndLocations')

  const users = data?.users ?? []
  const locations = data?.locations ?? []

  async function saveLocation() {
    const { valid, data: locData, errors } = validateLocation(locForm)
    setLocFormErrors(errors)
    if (!valid) {
      toast.error('Location name is required')
      return
    }
    setSaving(true)
    try {
      await createLocation(locData)
      toast.success('Location added')
      setLocDialog(false)
      setLocForm({ name: '', city: '' })
      setLocFormErrors({})
      refetch()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleUserRole(user) {
    const newRole = user.role === 'admin' ? 'employee' : 'admin'
    try {
      await setProfileRole(user.id, newRole)
      toast.success(`${user.full_name || user.email || 'User'} is now ${newRole}`)
      refetch()
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function assignLocation(userId, locationId) {
    try {
      await assignProfileLocation(userId, locationId)
      toast.success(locationId ? 'Location assigned' : 'Location restriction removed')
      refetch()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-gray-900 pt-2">Admin Settings</h1>

      <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Users' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setUserDialog(true)}><Plus size={14} /> Invite User</Button>
          </div>
          {users.map(u => (
            <Card key={u.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{u.full_name || u.email || 'Unnamed'}</p>
                    {u.email && <p className="text-xs text-blue-500">{u.email}</p>}
                    <p className="text-xs text-gray-400">{u.location?.name || 'All locations (no restriction)'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={u.role === 'admin' ? 'info' : 'default'}>{u.role}</Badge>
                    <button onClick={() => toggleUserRole(u)} className="text-xs text-[#1e3a5f] hover:underline">
                      Toggle role
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`user-location-${u.id}`} className="text-xs text-gray-500 w-24 shrink-0">Location access</Label>
                  <Select
                    id={`user-location-${u.id}`}
                    value={u.location_id || ''}
                    onChange={e => assignLocation(u.id, e.target.value)}
                    className="flex-1 h-8 text-xs"
                  >
                    <option value="">All locations (admin/unrestricted)</option>
                    {locations.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === 'Locations' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setLocDialog(true)}><Plus size={14} /> Add Location</Button>
          </div>
          {locations.map(l => (
            <Card key={l.id}>
              <CardContent className="p-4 flex items-center gap-3">
                <MapPin size={20} className="text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900">{l.name}</p>
                  {l.city && <p className="text-xs text-gray-400">{l.city}</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === 'Audit Log' && (
        <Card>
          <CardContent className="p-6 text-center">
            <ClipboardList size={36} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Audit log requires a custom Supabase trigger to populate.</p>
          </CardContent>
        </Card>
      )}

      {tab === 'Performance' && <PerformanceTab />}

      <Dialog open={locDialog} onClose={() => setLocDialog(false)}>
        <DialogHeader onClose={() => setLocDialog(false)}>
          <DialogTitle>Add Location</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div>
            <Label htmlFor="settings-loc-name">Location Name *</Label>
            <Input id="settings-loc-name" placeholder="e.g. Nkana East" value={locForm.name} onChange={e => setLocForm(f => ({ ...f, name: e.target.value }))} aria-invalid={!!locFormErrors.name} />
            {locFormErrors.name && <p className="text-xs text-red-500 mt-1">{locFormErrors.name}</p>}
          </div>
          <div>
            <Label htmlFor="settings-loc-city">City</Label>
            <Input id="settings-loc-city" placeholder="e.g. Kitwe" value={locForm.city} onChange={e => setLocForm(f => ({ ...f, city: e.target.value }))} />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" className="flex-1" onClick={() => setLocDialog(false)}>Cancel</Button>
          <Button className="flex-1" onClick={saveLocation} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={userDialog} onClose={() => setUserDialog(false)}>
        <DialogHeader onClose={() => setUserDialog(false)}>
          <DialogTitle>Invite User</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <p className="text-sm text-gray-500">
            To invite a new user, create their account in Supabase Authentication, then update their profile record with their name and role.
          </p>
        </DialogContent>
        <DialogFooter>
          <Button className="w-full" onClick={() => setUserDialog(false)}>Close</Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}
