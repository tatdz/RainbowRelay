import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { act } from 'react';
import '@testing-library/jest-dom';
import StakingPredicateInput from './StakingPredicateInput';

// Mock ethers to provide a longer hex string for encodeFunctionData to pass length check
jest.mock('ethers', () => {
  const original = jest.requireActual('ethers');
  class MockInterface {
    encodeFunctionData() {
      return '0x1234567890abcdef1234'; // > 10 chars long
    }
  }
  return {
    ...original,
    utils: {
      isAddress: addr => /^0x[a-fA-F0-9]{40}$/.test(addr),
      Interface: MockInterface,
    },
  };
});

describe('StakingPredicateInput', () => {
  test('renders input fields', () => {
    render(<StakingPredicateInput onChange={() => {}} />);
    expect(screen.getByLabelText(/Staking Contract Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/User Address to check/i)).toBeInTheDocument();
  });

  test('calls onChange with "0x" for invalid addresses', () => {
    const onChange = jest.fn();
    render(<StakingPredicateInput onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/Staking Contract Address/i), { target: { value: 'invalid' } });
    fireEvent.change(screen.getByLabelText(/User Address to check/i), { target: { value: 'alsoInvalid' } });

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall).toBe('0x');
  });

  test('calls onChange with encoded predicate for valid addresses', () => {
    const onChange = jest.fn();
    render(<StakingPredicateInput onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/Staking Contract Address/i), {
      target: { value: '0x0000000000000000000000000000000000000001' },
    });
    fireEvent.change(screen.getByLabelText(/User Address to check/i), {
      target: { value: '0x0000000000000000000000000000000000000002' },
    });

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.startsWith('0x')).toBe(true);
    expect(lastCall.length).toBeGreaterThan(10);
  });
});
