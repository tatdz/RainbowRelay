// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../src/GasStationOnFill.sol";

contract CallOnFillScript is Script {
    function run() public {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        // Replace with your deployed contract address
        GasStationOnFill gasStation = GasStationOnFill(0x14D4dFc203f1a1a748cBecdC2ac70A60d7F9d010);

        // Call onFill() — this example calls without sending ETH.
        gasStation.onFill();

        vm.stopBroadcast();
    }
}
