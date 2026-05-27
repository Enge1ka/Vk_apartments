import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Building2, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    // Supabase fires PASSWORD_RECOVERY when the user arrives via the email reset link
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })

    // Also check if there's already an active recovery session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
    })

    // If nothing fires after 8 seconds, the link is likely expired or invalid
    const timer = setTimeout(() => {
      setExpired(prev => !prev ? true : prev)
    }, 8000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [])

  // Don't show expired if ready already fired
  const showExpired = expired && !ready

  async function handleSubmit(e) {
    e.preventDefault()
    if (password !== confirm) {
      toast.error('Passwords do not match')
      return
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Password updated! Please sign in.')
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e3a5f] to-[#2d5a8e] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-2xl mb-4">
            <Building2 size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">VK Luxurious</h1>
          <p className="text-white/70 text-sm mt-1">Apartments Management</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-6">
          {showExpired ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Link expired</h2>
              <p className="text-sm text-gray-500">This reset link is invalid or has expired. Request a new one.</p>
              <a
                href="/forgot-password"
                className="block w-full text-center py-2.5 bg-[#1e3a5f] text-white rounded-xl text-sm font-medium hover:bg-[#2d5a8e] transition-colors"
              >
                Request new link
              </a>
            </div>
          ) : !ready ? (
            <div className="text-center py-6 space-y-3">
              <div className="mx-auto h-8 w-8 rounded-full border-4 border-gray-200 border-t-[#1e3a5f] animate-spin" />
              <p className="text-sm text-gray-500">Verifying reset link…</p>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-5">Set new password</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Min. 6 characters"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      className="pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="confirm">Confirm New Password</Label>
                  <Input
                    id="confirm"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Repeat password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? 'Updating…' : 'Update Password'}
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-white/50 text-xs mt-6">
          VK Luxurious Apartments &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
