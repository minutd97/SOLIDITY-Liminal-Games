// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract RelayerVerifier {
    using ECDSA for bytes32;

    address public trustedRelayer;
    mapping(uint256 => uint256[]) public decryptedNumbersByRound; // Stores decrypted numbers per round
    mapping(uint256 => bool) public roundProcessed; // Prevents duplicate processing

    event DecryptionSubmitted(uint256 roundId, uint256[] decryptedNumbers, bytes signature);

    modifier onlyRelayer() {
        require(msg.sender == trustedRelayer, "Only relayer can submit decryption");
        _;
    }

    constructor(address _trustedRelayer) {
        trustedRelayer = _trustedRelayer;
    }

    function submitDecryptedNumbers(
        uint256 roundId,
        uint256[] memory decryptedNumbers,
        bytes memory signature
    ) external onlyRelayer {
        require(!roundProcessed[roundId], "Round already processed");

        // Verify the relayer's signature
        bytes32 messageHash = keccak256(abi.encodePacked(roundId, decryptedNumbers));
        bytes32 ethSignedMessageHash = MessageHashUtils.toEthSignedMessageHash(messageHash);
        require(ECDSA.recover(ethSignedMessageHash, signature) == trustedRelayer, "Invalid relayer signature");

        decryptedNumbersByRound[roundId] = decryptedNumbers;
        roundProcessed[roundId] = true;

        emit DecryptionSubmitted(roundId, decryptedNumbers, signature);
    }

    function getDecryptedNumbers(uint256 roundId) external view returns (uint256[] memory) {
        require(roundProcessed[roundId], "Decrypted numbers not available yet");
        return decryptedNumbersByRound[roundId];
    }
}
