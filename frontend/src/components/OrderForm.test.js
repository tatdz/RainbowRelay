import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import OrderForm from '../../frontend/src/components/OrderForm'
import * as api from '../../frontend/src/api'
import * as utils from '../../frontend/src/utils'

jest.mock('../../frontend/src/api')
jest.mock('../../frontend/src/utils')

describe('OrderForm component', () => {
  beforeEach(() => {
    window.ethereum = { request: jest.fn() }
  })

  test('renders form inputs and submits order', async () => {
    utils.signOrder.mockResolvedValue({ signature: '0xsig', makerToken: 't', takerToken: 't', makerAmount: '1', takerAmount: '1', maker: '0x1', taker: '0x0', expiry: 1, nonce: 1 })
    api.submitOrder.mockResolvedValue({success: true})

    render(<OrderForm peerId="0x1" />)
    fireEvent.change(screen.getByPlaceholderText(/Maker Token Address/i), { target: { value: '0xmaker' } })
    fireEvent.change(screen.getByPlaceholderText(/Taker Token Address/i), { target: { value: '0xtaker' } })
    fireEvent.change(screen.getByPlaceholderText(/Maker Amount/i), { target: { value: '1' } })
    fireEvent.change(screen.getByPlaceholderText(/Taker Amount/i), { target: { value: '1' } })

    fireEvent.click(screen.getByText(/Sign & Submit/i))

    await waitFor(() => expect(screen.getByText(/Order submitted!/i)).toBeInTheDocument())
  })

  test('shows error if MetaMask missing', async () => {
    delete window.ethereum
    render(<OrderForm peerId="0x1" />)

    fireEvent.click(screen.getByText(/Sign & Submit/i))
    expect(await screen.findByText(/MetaMask not detected/i)).toBeInTheDocument()
  })
})
