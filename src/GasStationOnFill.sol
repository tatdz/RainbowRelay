// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/// @title GasStationOnFill - atomic gas repayment callback called on fill
contract GasStationOnFill {
    address payable public relayer;
    address public token;
    uint256 public repayAmount;

    constructor(address payable _relayer, address _token, uint256 _repayAmount) {
        relayer = _relayer;
        token = _token;
        repayAmount = _repayAmount;
    }

    // Called during fill via Limit Order Protocol interaction
    function onFill() external payable {
        if (msg.value > 0) {
            relayer.transfer(msg.value);
        } else if (token != address(0)) {
            (bool success, ) = token.call(abi.encodeWithSignature("transfer(address,uint256)", relayer, repayAmount));
            require(success, "Token repayment failed");
        }
    }
}
