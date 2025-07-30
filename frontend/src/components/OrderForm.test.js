import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import OrderForm from './OrderForm';

jest.mock('../api', () => ({
  submitOrder: jest.fn(() => Promise.resolve({ success: true })),
}));

jest.mock('../utils', () => ({
  signOrder: jest.fn(() => Promise.resolve({
    signature: '0x123',
    makerAsset: '0xmaker',
    takerAsset: '0xtaker',
    maker: '0xmaker',
    expiry: '0',
    salt: '0',
    predicate: '0x',
    permit: '0x',
    interaction: '0x',
  })),
}));

jest.mock('react-toastify', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

jest.mock('ethers', () => {
  const original = jest.requireActual('ethers');
  return {
    ...original,
    constants: {
      ...original.constants,
      AddressZero: '0x0000000000000000000000000000000000000000',
    },
    utils: original.utils,
  };
});

describe('OrderForm', () => {
  beforeEach(() => {
    window.ethereum = { request: jest.fn() };
  });

  test('renders inputs and successfully submits an order', async () => {
    const user = userEvent.setup();

    await act(async () => {
      render(<OrderForm peerId="0x123" />);
    });

    await act(async () => {
      await user.type(screen.getByPlaceholderText(/Maker Asset Address/i), '0xmakeraddress0000000000000000000000');
      await user.type(screen.getByPlaceholderText(/Taker Asset Address/i), '0xtakeraddress0000000000000000000000');
      await user.type(screen.getByPlaceholderText(/Maker Amount/i), '1');
      await user.type(screen.getByPlaceholderText(/Taker Amount/i), '1');
      await user.click(screen.getByRole('button', { name: /Sign & Submit/i }));
    });

    await waitFor(() => {
      expect(require('../api').submitOrder).toHaveBeenCalled();
    });
  });

  test('shows error if MetaMask is missing', async () => {
    delete window.ethereum;
    const user = userEvent.setup();

    await act(async () => {
      render(<OrderForm peerId="0x123" />);
    });

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /Sign & Submit/i }));
    });

    const toast = require('react-toastify').toast;
    expect(toast.error).toHaveBeenCalled();
  });
});
