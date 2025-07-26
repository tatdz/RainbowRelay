// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../src/LimitOrderProtocol.sol";
import "../src/GasStationOnFill.sol";
import "solidity-utils/contracts/interfaces/IWETH.sol";

contract DeployScript is Script {
    function run() public {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        address wethAddress = 0xdd13E55209Fd76AfE204dBda4007C227904f0a81;
        LimitOrderProtocol protocol = new LimitOrderProtocol(IWETH(wethAddress));
        console.log("LimitOrderProtocol deployed at:", address(protocol));

        address payable relayerAddress = payable(0xfa321eed1c2808506D4389414ddC798C43CE9a5E);
        address tokenAddress = address(0);
        uint256 repayAmount = 1e15;

        GasStationOnFill gasStation = new GasStationOnFill(relayerAddress, tokenAddress, repayAmount);
        console.log("GasStationOnFill deployed at:", address(gasStation));

        vm.stopBroadcast();
    }
}
