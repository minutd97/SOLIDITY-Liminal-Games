// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract V4HookFactory {
    event Deployed(address addr, uint256 salt);

    function create(bytes memory bytecode, uint256 salt) external returns (address addr) {
        assembly {
            addr := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
            if iszero(extcodesize(addr)) { revert(0, 0) }
        }
        emit Deployed(addr, salt);
    }

    function computeAddress(bytes memory bytecode, uint256 salt) external view returns (address) {
        bytes32 hash = keccak256(bytecode);
        return address(uint160(uint(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            hash
        )))));
    }
}
