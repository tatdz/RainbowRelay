import React from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import userEvent from '@testing-library/user-event'
import OrderForm from './OrderForm'
import { ethers } from 'ethers'

jest.mock('../api', () => ({
  submitOrder: jest.fn()
}))

jest.mock('../utils', () => ({
  signOrder: jest.fn()
}))

jest.mock('ethers', () => {
  const original = jest.requireActual('ethers')
  return {
    ...original,
    BrowserProvider: jest.fn().mockImplementation(() => ({
      send: jest.fn().mockResolvedValue(null),
      getSigner: jest.fn().mockImplementation(() => ({
        getAddress: jest.fn().mockResolvedValue('0x123')
      }))
    }))
  }
})

describe('OrderForm component', () => {
  beforeEach(() => {
    window.ethereum = { request: jest.fn() }
  })

  test('renders form inputs and submits order', async () => {
    const user = userEvent.setup()
    const mockSignOrder = require('../utils').signOrder
    const mockSubmitOrder = require('../api').submitOrder
    
    mockSignOrder.mockResolvedValue({ 
      signature: '0xsig', 
      makerToken: 't', 
      takerToken: 't', 
      makerAmount: '1', 
      takerAmount: '1', 
      maker: '0x1', 
      taker: '0x0', 
      expiry: 1, 
      nonce: 1 
    })
    mockSubmitOrder.mockResolvedValue({success: true})

    await act(async () => {
      render(<OrderForm peerId="0x1" />)
    })
    
    // Fill out form
    await act(async () => {
      await user.type(screen.getByLabelText(/Maker Token Address/i), '0xmaker')
      await user.type(screen.getByLabelText(/Taker Token Address/i), '0xtaker')
      await user.type(screen.getByLabelText(/Maker Amount/i), '1')
      await user.type(screen.getByLabelText(/Taker Amount/i), '1')
    })

    // Submit form
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /Sign & Submit/i }))
    })

    // Verify success message
    await waitFor(() => {
      expect(screen.getByText(/successfully submitted/i)).toBeInTheDocument()
    })
  })

  test('shows error if MetaMask missing', async () => {
    const user = userEvent.setup()
    delete window.ethereum
    
    await act(async () => {
      render(<OrderForm peerId="0x1" />)
    })

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /Sign & Submit/i }))
    })
    
    expect(await screen.findByText(/MetaMask wallet is required/i)).toBeInTheDocument()
  })
})