import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import OrderForm from './OrderForm';

jest.mock('../api', () => ({
  submitOrder: jest.fn()
}));

jest.mock('../utils', () => ({
  signOrder: jest.fn()
}));

jest.mock('ethers', () => {
  const original = jest.requireActual('ethers');
  return {
    ...original,
    BrowserProvider: jest.fn().mockImplementation(() => ({
      getSigner: jest.fn().mockImplementation(() => ({
        getAddress: jest.fn().mockResolvedValue('0x123')
      }))
    })),
    ZeroAddress: '0x0000000000000000000000000000000000000000'
  };
});

describe('OrderForm', () => {
  const mockPeerId = '0x1234567890abcdef';

  beforeEach(() => {
    jest.clearAllMocks();
    window.ethereum = { request: jest.fn() };
  });

  test('renders all form fields', async () => {
    await act(async () => {
      render(<OrderForm peerId={mockPeerId} />);
    });

    expect(screen.getByLabelText(/Maker Token Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Taker Token Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Maker Amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Taker Amount/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign & Submit/i })).toBeInTheDocument();
  });

  test('submits order successfully', async () => {
    const user = userEvent.setup();
    const mockSubmitOrder = require('../api').submitOrder;
    const mockSignOrder = require('../utils').signOrder;
    
    mockSignOrder.mockResolvedValue({ 
      signature: '0xsig',
      makerToken: '0xmaker',
      takerToken: '0xtaker',
      makerAmount: '100',
      takerAmount: '200',
      maker: '0x123',
      taker: '0x000',
      expiry: 1234567890,
      nonce: 1
    });
    mockSubmitOrder.mockResolvedValue({ success: true });

    await act(async () => {
      render(<OrderForm peerId={mockPeerId} />);
    });

    await act(async () => {
      await user.type(screen.getByLabelText(/Maker Token Address/i), '0xmaker');
      await user.type(screen.getByLabelText(/Taker Token Address/i), '0xtaker');
      await user.type(screen.getByLabelText(/Maker Amount/i), '100');
      await user.type(screen.getByLabelText(/Taker Amount/i), '200');
    });

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /Sign & Submit/i }));
    });

    await waitFor(() => {
      expect(mockSubmitOrder).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/successfully submitted/i)).toBeInTheDocument();
    });
  });

  test('shows error when MetaMask is not available', async () => {
    const user = userEvent.setup();
    delete window.ethereum;

    await act(async () => {
      render(<OrderForm peerId={mockPeerId} />);
    });

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /Sign & Submit/i }));
    });

    expect(screen.getByText(/MetaMask wallet is required/i)).toBeInTheDocument();
  });

  test('shows error when submission fails', async () => {
    const user = userEvent.setup();
    const errorMessage = 'Submission failed';
    require('../api').submitOrder.mockRejectedValue(new Error(errorMessage));

    await act(async () => {
      render(<OrderForm peerId={mockPeerId} />);
    });

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /Sign & Submit/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });
});