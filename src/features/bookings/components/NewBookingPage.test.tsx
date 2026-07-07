import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NewBookingPage from './NewBookingPage'
import * as authHook from '@/features/auth/useAuth'
import * as locationsApi from '@/features/locations/api'
import type { Location } from '@/features/locations/api'
import * as apartmentsApi from '@/features/apartments/api'
import type { Apartment } from '@/features/apartments/api'
import * as bookingsApi from '../api'

const LOCATIONS = [{ id: 'loc-1', name: 'Nkana East' }] as Location[]
const APARTMENTS = [
  { id: 'apt-1', apartment_number: 'A01', type: 'Studio', daily_rate: 100 },
  { id: 'apt-2', apartment_number: 'A02', type: 'One-bed', daily_rate: 150 },
] as Apartment[]

function setup() {
  vi.spyOn(authHook, 'useAuth').mockReturnValue({
    user: { id: 'user-1', email: 'staff@vk.com' },
    isRestricted: false,
    locationId: null,
  } as unknown as ReturnType<typeof authHook.useAuth>)
  vi.spyOn(locationsApi, 'listLocations').mockResolvedValue(LOCATIONS)
  vi.spyOn(apartmentsApi, 'listApartments').mockResolvedValue(APARTMENTS)
  return render(<MemoryRouter><NewBookingPage /></MemoryRouter>)
}

// Fills the client step and advances to the Rooms step (whose location
// selector is what reveals the "Add a room" sub-form once chosen).
async function toRoomsStep() {
  await userEvent.type(screen.getByLabelText('Full Name *'), 'John Banda')
  await userEvent.type(screen.getByLabelText('Phone Number *'), '0970000000')
  await userEvent.click(screen.getByRole('button', { name: /next/i }))
  await waitFor(() => expect(screen.getByLabelText('Location *')).toBeInTheDocument())
}

// Adds one room (apt-1, 3 nights) on the Rooms step.
async function addOneRoom() {
  await userEvent.selectOptions(screen.getByLabelText('Location *'), 'loc-1')
  await waitFor(() => expect(apartmentsApi.listApartments).toHaveBeenCalledWith({ locationId: 'loc-1', status: 'available' }))
  await userEvent.selectOptions(screen.getByLabelText('Apartment'), 'apt-1')
  await userEvent.type(screen.getByLabelText('Check-in'), '2026-01-01')
  await userEvent.type(screen.getByLabelText('Check-out'), '2026-01-04')
  await userEvent.click(screen.getByRole('button', { name: /add room/i }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('NewBookingPage', () => {
  it('blocks advancing past the client step until name and phone are filled', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /next/i }))

    expect(await screen.findByText('Full name is required')).toBeInTheDocument()
    expect(screen.queryByText('Add a room')).not.toBeInTheDocument()
  })

  it('will not leave the Rooms step with no rooms added', async () => {
    setup()
    await toRoomsStep()
    await userEvent.selectOptions(screen.getByLabelText('Location *'), 'loc-1')

    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    // Still on Rooms (Payment step not reached).
    expect(screen.queryByText('Initial Payment')).not.toBeInTheDocument()
  })

  it('adds a room then creates the booking with the room list', async () => {
    setup()
    vi.spyOn(bookingsApi, 'createBooking').mockResolvedValue({ bookingId: 'b1', bookingRef: 'VKL-2026-0001' })
    await toRoomsStep()
    await addOneRoom()

    // The added room shows in the list with its computed line total (3 × 100).
    await waitFor(() => expect(screen.getByText(/A01/)).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(screen.getByText('Initial Payment')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(screen.getByText('Booking Summary')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /confirm booking/i }))

    await waitFor(() => expect(bookingsApi.createBooking).toHaveBeenCalledWith(expect.objectContaining({
      rooms: [expect.objectContaining({ apartmentId: 'apt-1', checkInDate: '2026-01-01', checkOutDate: '2026-01-04', ratePerDay: 100 })],
    })))
  })

  it('surfaces a createBooking overlap error without crashing', async () => {
    setup()
    vi.spyOn(bookingsApi, 'createBooking').mockRejectedValue(new Error('One of the selected apartments is already booked for those dates.'))
    await toRoomsStep()
    await addOneRoom()
    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(screen.getByText('Initial Payment')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(screen.getByText('Booking Summary')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /confirm booking/i }))

    // The confirm button re-enables (not stuck on "Creating…") after the error.
    await waitFor(() => expect(screen.getByRole('button', { name: /confirm booking/i })).toBeEnabled())
    expect(bookingsApi.createBooking).toHaveBeenCalled()
  })
})
