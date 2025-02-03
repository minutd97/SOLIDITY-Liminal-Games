// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract RelayerVerifier {
    using ECDSA for bytes32;

    address public trustedRelayer;

    event DecryptionVerified(address indexed sender, uint256[] decryptedNumbers);

    constructor(address _trustedRelayer) {
        trustedRelayer = _trustedRelayer;
    }

    function verifyDecryption(
        uint256[] memory decryptedNumbers,
        bytes memory signature
    ) external {
        // Recreate the signed message
        bytes32 messageHash = keccak256(abi.encodePacked(decryptedNumbers));

        // ✅ OpenZeppelin v5.x: Use MessageHashUtils for Ethereum Signed Message Hash
        bytes32 ethSignedMessageHash = MessageHashUtils.toEthSignedMessageHash(messageHash);

        // ✅ Verify signature using ECDSA
        address recoveredSigner = ECDSA.recover(ethSignedMessageHash, signature);
        require(recoveredSigner == trustedRelayer, "Invalid relayer signature");

        emit DecryptionVerified(msg.sender, decryptedNumbers);
    }

    // Allows updating the trusted relayer
    function setTrustedRelayer(address _newRelayer) external {
        require(msg.sender == trustedRelayer, "Only current relayer can update");
        trustedRelayer = _newRelayer;
    }
}
