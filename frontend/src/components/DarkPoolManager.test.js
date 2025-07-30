import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import DarkPoolManager from './DarkPoolManager';

describe('DarkPoolManager', () => {
  const mockPeerId = '0x123456789abcdef';

  test('renders the join pool form', async () => {
    await act(async () => {
      render(<DarkPoolManager peerId={mockPeerId} />);
    });

    expect(screen.getByText(/Join Dark Pool/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Pool Name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Join Pool/i })).toBeInTheDocument();
  });

  test('does not display peer ID when not provided', async () => {
    await act(async () => {
      render(<DarkPoolManager peerId="" />);
    });

    expect(screen.queryByText(new RegExp(mockPeerId, 'i'))).not.toBeInTheDocument();
  });
});
