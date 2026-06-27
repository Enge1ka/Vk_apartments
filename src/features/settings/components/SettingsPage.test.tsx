import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SettingsPage from './SettingsPage'
import * as authApi from '@/features/auth/api'
import type { Profile } from '@/features/auth/api'
import * as locationsApi from '@/features/locations/api'
import type { Location } from '@/features/locations/api'

const USERS = [
  { id: 'u1', full_name: 'Alice Admin', email: 'alice@vk.com', role: 'admin', location_id: null, location: null },
  { id: 'u2', full_name: 'Bob Staff', email: 'bob@vk.com', role: 'employee', location_id: 'loc-1', location: { name: 'Nkana East' } },
] as Profile[]
const LOCATIONS = [{ id: 'loc-1', name: 'Nkana East' }] as Location[]

afterEach(() => {
  vi.restoreAllMocks()
})

function setup() {
  vi.spyOn(authApi, 'listProfiles').mockResolvedValue(USERS)
  vi.spyOn(locationsApi, 'listLocations').mockResolvedValue(LOCATIONS)
  return render(<SettingsPage />)
}

describe('SettingsPage', () => {
  it('lists users with their role and location', async () => {
    setup()
    expect(await screen.findByText('Alice Admin')).toBeInTheDocument()
    expect(screen.getByText('Bob Staff')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('employee')).toBeInTheDocument()
  })

  it('toggles a user role', async () => {
    setup()
    vi.spyOn(authApi, 'setProfileRole').mockResolvedValue()
    await screen.findByText('Alice Admin')

    const toggleButtons = screen.getAllByText('Toggle role')
    await userEvent.click(toggleButtons[0])

    await waitFor(() => expect(authApi.setProfileRole).toHaveBeenCalledWith('u1', 'employee'))
  })

  it('adds a new location through the dialog', async () => {
    setup()
    vi.spyOn(locationsApi, 'createLocation').mockResolvedValue({ id: 'loc-2' })
    await screen.findByText('Alice Admin')

    await userEvent.click(screen.getByText('Locations'))
    await userEvent.click(screen.getByRole('button', { name: /add location/i }))
    await userEvent.type(screen.getByLabelText('Location Name *'), 'Ndola')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(locationsApi.createLocation).toHaveBeenCalledWith({ name: 'Ndola', city: '' }))
  })
})
