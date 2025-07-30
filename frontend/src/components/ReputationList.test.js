import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ReputationList from './ReputationList';

jest.mock('../api', () => ({
  fetchPeerReputations: jest.fn(() => Promise.resolve([
    { peerId: '0xabc', score: 150 },
    { peerId: '0xdef', score: 100 },
  ])),
}));

describe('ReputationList', () => {
  test('renders the reputation list', async () => {
    await act(async () => {
      render(<ReputationList />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Relay Node Reputations/i)).toBeInTheDocument();
      expect(screen.getByText('0xabc')).toBeInTheDocument();
      expect(screen.getByText('150')).toBeInTheDocument();
      expect(screen.getByText('0xdef')).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument();
    });
  });

  test('handles fetch rejection gracefully without crashing', async () => {
    const fetchPeerReputations = require('../api').fetchPeerReputations;
    fetchPeerReputations.mockImplementationOnce(() => Promise.reject(new Error('Network error')));

    await act(async () => {
      render(<ReputationList />);
    });

    // Should still render header (no crash)
    await waitFor(() => {
      expect(screen.getByText(/Relay Node Reputations/i)).toBeInTheDocument();
    });
  });
});
