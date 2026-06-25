import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ClientsPage from './ClientsPage'
import * as clientsApi from '../api'

const CLIENTS = [
  { id: '1', full_name: 'John Banda', phone: '+260970000001', nrc_or_passport: '123456/10/1', bookings: [] },
  { id: '2', full_name: 'Mary Phiri', phone: '+260970000002', nrc_or_passport: null, bookings: [{ id: 'b1' }] },
]

describe('ClientsPage', () => {
  it('renders all clients, then narrows the list as the user searches', async () => {
    vi.spyOn(clientsApi, 'listClients').mockResolvedValue(CLIENTS)
    render(<ClientsPage />)

    await waitFor(() => expect(screen.getByText('John Banda')).toBeInTheDocument())
    expect(screen.getByText('Mary Phiri')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Search clients'), 'Mary')

    expect(screen.queryByText('John Banda')).not.toBeInTheDocument()
    expect(screen.getByText('Mary Phiri')).toBeInTheDocument()
  })

  it('shows an empty state when no client matches', async () => {
    vi.spyOn(clientsApi, 'listClients').mockResolvedValue(CLIENTS)
    render(<ClientsPage />)
    await waitFor(() => expect(screen.getByText('John Banda')).toBeInTheDocument())

    await userEvent.type(screen.getByLabelText('Search clients'), 'nobody')

    expect(screen.getByText('No clients found')).toBeInTheDocument()
  })
})
