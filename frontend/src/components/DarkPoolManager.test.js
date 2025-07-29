import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import DarkPoolManager from './DarkPoolManager';

jest.mock('../api', () => ({
  joinPool: jest.fn()
}));

describe('DarkPoolManager', () => {
  const mockPeerId = '0x1234567890abcdef';

  beforeEach(() => {
    jest.clearAllMocks();
    window.alert = jest.fn();
  });

  test('renders the pool manager form', async () => {
    await act(async () => {
      render(<DarkPoolManager peerId={mockPeerId} />);
    });

    expect(screen.getByPlaceholderText(/Pool Name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Join Pool/i })).toBeInTheDocument();
  });

  test('handles pool joining successfully', async () => {
    const mockJoinPool = require('../api').joinPool;
    const poolName = 'whales';
    mockJoinPool.mockResolvedValue({ success: true });

    await act(async () => {
      render(<DarkPoolManager peerId={mockPeerId} />);
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/Pool Name/i), {
        target: { value: poolName }
      });
      fireEvent.click(screen.getByRole('button', { name: /Join Pool/i }));
    });

    expect(mockJoinPool).toHaveBeenCalledTimes(1);
    expect(mockJoinPool).toHaveBeenCalledWith(poolName, mockPeerId);
    expect(window.alert).toHaveBeenCalledWith(`Joined ${poolName}`);
  });

  test('shows error when joining fails', async () => {
    const errorMessage = 'Failed to join pool';
    require('../api').joinPool.mockRejectedValue(new Error(errorMessage));

    await act(async () => {
      render(<DarkPoolManager peerId={mockPeerId} />);
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/Pool Name/i), {
        target: { value: 'whales' }
      });
      fireEvent.click(screen.getByRole('button', { name: /Join Pool/i }));
    });

    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });
});