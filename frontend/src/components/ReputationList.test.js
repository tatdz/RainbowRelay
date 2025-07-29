import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ReputationList from './ReputationList';

jest.mock('../api', () => ({
  fetchPeerReputations: jest.fn()
}));

describe('ReputationList', () => {
  const mockReputations = [
    { peerId: '0xabcdef1234567890', score: 150 },
    { peerId: '0x1234567890abcdef', score: 100 }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders loading state initially', async () => {
    require('../api').fetchPeerReputations.mockImplementation(
      () => new Promise(() => {})
    );

    await act(async () => {
      render(<ReputationList />);
    });

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  test('renders reputation list after loading', async () => {
    require('../api').fetchPeerReputations.mockResolvedValue(mockReputations);

    await act(async () => {
      render(<ReputationList />);
    });

    expect(screen.getByRole('heading', { name: /Relay Node Reputations/i })).toBeInTheDocument();
    
    for (const rep of mockReputations) {
      const peerIdShort = rep.peerId.slice(0, 8);
      expect(screen.getByText(new RegExp(peerIdShort))).toBeInTheDocument();
      expect(screen.getByText(rep.score.toString())).toBeInTheDocument();
    }
  });

  test('handles API errors gracefully', async () => {
    const errorMessage = 'Failed to fetch reputations';
    require('../api').fetchPeerReputations.mockRejectedValue(new Error(errorMessage));

    await act(async () => {
      render(<ReputationList />);
    });

    expect(screen.getByText(/error/i)).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });
});