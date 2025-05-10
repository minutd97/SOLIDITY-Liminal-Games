// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title V4HookFactory – Deterministic Contract Deployer Using CREATE2
contract V4HookFactory {
    event Deployed(address addr, uint256 salt); // Emitted when a contract is deployed via CREATE2 with the resulting address and salt

    /// @notice Deploys a contract using CREATE2 with the provided bytecode and salt
    function create(bytes memory bytecode, uint256 salt) external returns (address addr) {
        // Deploy contract using CREATE2: addr := create2(0, codeStart, codeSize, salt)
        // Ensure contract was successfully deployed
        assembly {
            addr := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
            if iszero(extcodesize(addr)) { revert(0, 0) }
        }
        emit Deployed(addr, salt);
    }

    /// @notice Computes the deterministic address of a contract deployed via CREATE2
    function computeAddress(bytes memory bytecode, uint256 salt) external view returns (address) {
        // Hash of the bytecode used to compute the final address
        // Return the computed CREATE2 address using keccak256(...)
        bytes32 hash = keccak256(bytecode);
        return address(uint160(uint(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            hash
        )))));
    }
}
