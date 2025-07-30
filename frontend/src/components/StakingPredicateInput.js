import React, { useState } from 'react';
import { ethers } from 'ethers';

export default function StakingPredicateInput({ onChange }) {
  const [stakingAddress, setStakingAddress] = useState('');
  const [userAddress, setUserAddress] = useState('');

  function buildPredicate(stakingAddr, userAddr) {
    if (!ethers.utils.isAddress(stakingAddr) || !ethers.utils.isAddress(userAddr)) {
      return '0x';
    }
    const iface = new ethers.utils.Interface(['function isStaker(address) view returns (bool)']);
    return iface.encodeFunctionData('isStaker', [userAddr]);
  }

  function onInputChange(newStaking, newUser) {
    setStakingAddress(newStaking);
    setUserAddress(newUser);
    const pred = buildPredicate(newStaking, newUser);
    onChange(pred);
  }

  return (
    <div>
      <label htmlFor="staking-input">Staking Contract Address:</label>
      <input
        id="staking-input"
        type="text"
        placeholder="0x..."
        value={stakingAddress}
        onChange={e => onInputChange(e.target.value, userAddress)}
        style={{ width: '100%' }}
      />
      <label htmlFor="user-input">User Address to check:</label>
      <input
        id="user-input"
        type="text"
        placeholder="0x..."
        value={userAddress}
        onChange={e => onInputChange(stakingAddress, e.target.value)}
        style={{ width: '100%' }}
      />
    </div>
  );
}
