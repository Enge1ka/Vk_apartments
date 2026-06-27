import type { User } from '@supabase/supabase-js'
import { create } from 'zustand'
import type { Profile } from './api'

interface AuthState {
  user: User | null
  profile: Profile | null
  authReady: boolean
  setUser: (user: User | null) => void
  setProfile: (profile: Profile | null) => void
  setAuthReady: (authReady: boolean) => void
  clearUser: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  authReady: false,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setAuthReady: (authReady) => set({ authReady }),
  clearUser: () => set({ user: null, profile: null }),
}))
