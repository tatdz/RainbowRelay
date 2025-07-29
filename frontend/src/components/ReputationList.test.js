import React from 'react'
import { render, screen } from '@testing-library/react'
import ReputationList from '../../frontend/src/components/ReputationList'
import * as api from '../../frontend/src/api'

jest.mock('../../frontend/src/api')

test('renders reputation list', async () => {
  const mockReps = [{ peerId: '0xabcdef123456', score: 150 }, { peerId: '0x1234567890ab', score: 100 }]
  api.fetchPeerReputations.mockResolvedValue(mockReps)

  render(<ReputationList />)
  expect(await screen.findByText(/Relay Node Reputations/i)).toBeInTheDocument()
  for (const rep of mockReps) {
    expect(await screen.findByText(new RegExp(rep.peerId.slice(0, 8), 'i'))).toBeInTheDocument()
  }
})
