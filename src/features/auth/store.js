import { create } from 'zustand'

export const useAuthStore = create((set) => ({
  user: null,
  profile: null,
  authReady: false,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setAuthReady: (authReady) => set({ authReady }),
  clearUser: () => set({ user: null, profile: null }),
}))
