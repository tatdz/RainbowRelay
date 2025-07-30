import React, { useState, useEffect } from 'react'
import StakingPredicateInput from './StakingPredicateInput'
import { ethers } from 'ethers'
import { signOrder } from '../utils'
import { submitOrder } from '../api'
import { toast } from 'react-toastify'

export default function OrderForm({ peerId }) {
  const [makerAsset, setMakerAsset] = useState('')
  const [takerAsset, setTakerAsset] = useState('')
  const [makerAmount, setMakerAmount] = useState('')
  const [takerAmount, setTakerAmount] = useState('')
  const [privateOrder, setPrivateOrder] = useState(false)
  const [encryptKey, setEncryptKey] = useState('')
  const [vestingPredicateEnabled, setVestingPredicateEnabled] = useState(false)
  const [vestingPredicate, setVestingPredicate] = useState('0x')
  const [gasStationEnabled, setGasStationEnabled] = useState(false)
  const [gasStationAddress, setGasStationAddress] = useState('')
  const [stakingPredicateHex, setStakingPredicateHex] = useState('0x')

  // Compose predicates if vesting or staking enabled (simple or combined via 1inch predicate sdk can be added)
  function composePredicate() {
    if (vestingPredicateEnabled && stakingPredicateHex !== '0x') {
      // Simple concatenation or better predicate composition with sdk can be done here
      return stakingPredicateHex
    }
    if (vestingPredicateEnabled) return vestingPredicate
    if (stakingPredicateHex !== '0x') return stakingPredicateHex
    return '0x'
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (!makerAsset || !takerAsset || !makerAmount || !takerAmount) {
      toast.error('Fill all form fields')
      return
    }

    const predicate = composePredicate()
    let interaction = '0x'
    if (gasStationEnabled) {
      if (!ethers.utils.isAddress(gasStationAddress)) {
        toast.error('Invalid Gas Station Contract Address')
        return
      }
      interaction = '0x43e8eb1a' // onFill selector
    }

    const limitOrder = {
      makerAsset,
      takerAsset,
      maker: peerId,
      receiver: ethers.constants.AddressZero,
      allowedSender: ethers.constants.AddressZero,
      makingAmount: ethers.utils.parseUnits(makerAmount, 18).toString(),
      takingAmount: ethers.utils.parseUnits(takerAmount, 18).toString(),
      salt: ethers.BigNumber.from(ethers.utils.randomBytes(32)).toString(),
      predicate,
      permit: '0x',
      interaction,
    }

    try {
      const orderWithSignature = await signOrder(limitOrder)
      const payload = privateOrder
        ? {
            order: null,
            signature: null,
            metadata: null,
            encrypted: true,
            encryptKey,
            data: /* encrypt with encryptKey */ JSON.stringify(orderWithSignature),
          }
        : {
            order: orderWithSignature,
            signature: orderWithSignature.signature,
            metadata: { submittedAt: Date.now() },
            encrypted: false,
            encryptKey: '',
          }

      const res = await submitOrder(payload, null)
      if (res.success) toast.success('Order submitted successfully!')
      else toast.error('Order submission failed')
    } catch (err) {
      toast.error('Error signing/submitting order: ' + err.message)
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <h2>Create Limit Order</h2>
      <input placeholder="Maker Asset Address" value={makerAsset} onChange={e => setMakerAsset(e.target.value)} />
      <input placeholder="Taker Asset Address" value={takerAsset} onChange={e => setTakerAsset(e.target.value)} />
      <input placeholder="Maker Amount (decimals)" value={makerAmount} onChange={e => setMakerAmount(e.target.value)} />
      <input placeholder="Taker Amount (decimals)" value={takerAmount} onChange={e => setTakerAmount(e.target.value)} />
      <label>
        Private Order? <input type="checkbox" checked={privateOrder} onChange={e => setPrivateOrder(e.target.checked)} />
      </label>
      {privateOrder && (
        <input
          type="password"
          placeholder="Encryption Key"
          value={encryptKey}
          onChange={e => setEncryptKey(e.target.value)}
        />
      )}
      <label>
        Enable Vesting Predicate? <input type="checkbox" checked={vestingPredicateEnabled} onChange={e => setVestingPredicateEnabled(e.target.checked)} />
      </label>
      {vestingPredicateEnabled && (
        <input
          type="text"
          placeholder="Enter vesting predicate hex"
          value={vestingPredicate}
          onChange={e => setVestingPredicate(e.target.value)}
        />
      )}
      <label>
        Enable Staking Predicate? {/* Controlled in separate component */}
      </label>
      <StakingPredicateInput onChange={setStakingPredicateHex} />
      <label>
        Use Gas Station Extension? <input type="checkbox" checked={gasStationEnabled} onChange={e => setGasStationEnabled(e.target.checked)} />
      </label>
      {gasStationEnabled && (
        <input
          placeholder="Gas Station Contract Address"
          value={gasStationAddress}
          onChange={e => setGasStationAddress(e.target.value)}
        />
      )}
      <button type="submit">Sign & Submit Order</button>
    </form>
  )
}
