import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import DarkPoolManager from '../../frontend/src/components/DarkPoolManager'
import * as api from '../../frontend/src/api'

jest.mock('../../frontend/src/api')

test('join pool triggers API and shows alert', async () => {
  api.joinPool.mockResolvedValue({ success: true })

  window.alert = jest.fn()

  render(<DarkPoolManager peerId="0x1" />)
  fireEvent.change(screen.getByPlaceholderText(/Pool Name/i), { target: { value: 'whales' } })
  fireEvent.click(screen.getByText(/Join Pool/i))

  // Await alert call
  await new Promise(process.nextTick)

  expect(api.joinPool).toHaveBeenCalledWith('whales', '0x1')
  expect(window.alert).toHaveBeenCalledWith('Joined whales')
})
