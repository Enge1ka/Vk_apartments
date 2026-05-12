import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '@/components/ui/Dialog'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/bookingUtils'
import { Plus, Users, MapPin, ClipboardList } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

const TABS = ['Users', 'Locations', 'Audit Log']

export default function Settings() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('Users')
  const [users, setUsers] = useState([])
  const [locations, setLocations] = useState([])
  const [auditLog, setAuditLog] = useState([])
  const [loading, setLoading] = useState(false)
  const [userDialog, setUserDialog] = useState(false)
  const [locDialog, setLocDialog] = useState(false)
  const [userForm, setUserForm] = useState({ email: '', full_name: '', role: 'employee', location_id: '' })
  const [locForm, setLocForm] = useState({ name: '', city: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isAdmin) { navigate('/'); return }
    fetchAll()
  }, [isAdmin])

  async function fetchAll() {
    setLoading(true)
    const [uRes, lRes] = await Promise.all([
      supabase.from('profiles').select('*, location:locations(name)').order('created_at'),
      supabase.from('locations').select('*').order('name'),
    ])
    setUsers(uRes.data || [])
    setLocations(lRes.data || [])
    setLoading(false)
  }

  async function saveLocation() {
    if (!locForm.name) { toast.error('Location name required'); return }
    setSaving(true)
    const { error } = await supabase.from('locations').insert({ name: locForm.name, city: locForm.city || null })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Location added')
    setLocDialog(false)
    setLocForm({ name: '', city: '' })
    fetchAll()
  }

  async function toggleUserRole(user) {
    const newRole = user.role === 'admin' ? 'employee' : 'admin'
    await supabase.from('profiles').update({ role: newRole }).eq('id', user.id)
    toast.success(`${user.full_name} is now ${newRole}`)
    fetchAll()
  }

  if (!isAdmin) return null

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

      {/* Users */}
      {tab === 'Users' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setUserDialog(true)}><Plus size={14} /> Invite User</Button>
          </div>
          {users.map(u => (
            <Card key={u.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{u.full_name || 'Unnamed'}</p>
                  <p className="text-xs text-gray-400">{u.location?.name || 'All locations'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={u.role === 'admin' ? 'info' : 'default'}>{u.role}</Badge>
                  <button onClick={() => toggleUserRole(u)} className="text-xs text-[#1e3a5f] hover:underline">
                    Toggle
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Locations */}
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

      {/* Audit log placeholder */}
      {tab === 'Audit Log' && (
        <Card>
          <CardContent className="p-6 text-center">
            <ClipboardList size={36} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Audit log requires a custom Supabase trigger to populate.</p>
          </CardContent>
        </Card>
      )}

      {/* Add Location Dialog */}
      <Dialog open={locDialog} onClose={() => setLocDialog(false)}>
        <DialogHeader onClose={() => setLocDialog(false)}>
          <DialogTitle>Add Location</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div>
            <Label>Location Name *</Label>
            <Input placeholder="e.g. Nkana East" value={locForm.name} onChange={e => setLocForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label>City</Label>
            <Input placeholder="e.g. Kitwe" value={locForm.city} onChange={e => setLocForm(f => ({ ...f, city: e.target.value }))} />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" className="flex-1" onClick={() => setLocDialog(false)}>Cancel</Button>
          <Button className="flex-1" onClick={saveLocation} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </Dialog>

      {/* Invite User Dialog — placeholder (Supabase admin API required) */}
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
