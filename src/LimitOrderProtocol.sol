// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

import "./OrderMixin.sol";
import "solidity-utils/contracts/interfaces/IWETH.sol";

/// @title 1inch Limit Order Protocol v4
/// @notice Implements limit and RFQ order matching with predicates and callbacks.
contract LimitOrderProtocol is EIP712, Ownable, Pausable, OrderMixin {
    /// @notice Constructs the LimitOrderProtocol contract
    /// @param _weth Address of the Wrapped ETH contract (IWETH)
    constructor(IWETH _weth) 
        EIP712("1inch Limit Order Protocol", "4") 
        OrderMixin(_weth) 
        Ownable(msg.sender)  // Pass deployer as owner here
    {
        // Initialization logic if needed
    }

    /// @notice Returns current EIP-712 domain separator
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice Pauses the protocol (onlyOwner)
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpauses the protocol (onlyOwner)
    function unpause() external onlyOwner {
        _unpause();
    }

    // Additional protocol logic should be implemented in OrderMixin or below here.
}
