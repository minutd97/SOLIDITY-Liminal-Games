// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract KNYRelayerVerifier {
    using ECDSA for bytes32;

    address public trustedRelayer;
    mapping(bytes32 => uint[]) public decryptedNumbers; // Stores decrypted numbers using a compact key
    mapping(bytes32 => bool) public roundProcessed; // Prevents duplicate processing

    event DecryptionSubmitted(uint gameId, uint roundId, uint[] decryptedNumbers, bytes signature);

    modifier onlyRelayer() {
        require(msg.sender == trustedRelayer, "Only relayer can submit decryption");
        _;
    }

    function getRoundKey(uint gameId, uint roundId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(gameId, roundId));
    }

    constructor(address _trustedRelayer) {
        require(_trustedRelayer != address(0), "Invalid trusted relayer address");
        trustedRelayer = _trustedRelayer;
    }

    function submitDecryptedNumbers(
        uint gameId,
        uint roundId,
        uint[] memory decryptedNumbersData,
        bytes memory signature
    ) external onlyRelayer {
        bytes32 key = getRoundKey(gameId, roundId);
        require(!roundProcessed[key], "Round already processed");

        // Verify the relayer's signature
        bytes32 messageHash = keccak256(abi.encodePacked(gameId, roundId, decryptedNumbersData));
        bytes32 ethSignedMessageHash = MessageHashUtils.toEthSignedMessageHash(messageHash);
        require(ECDSA.recover(ethSignedMessageHash, signature) == trustedRelayer, "Invalid relayer signature");

        decryptedNumbers[key] = decryptedNumbersData;
        roundProcessed[key] = true;

        emit DecryptionSubmitted(gameId, roundId, decryptedNumbersData, signature);
    }

    function getDecryptedNumbers(uint gameId, uint roundId) external view returns (uint[] memory) {
        bytes32 key = getRoundKey(gameId, roundId);
        require(roundProcessed[key], "Decrypted numbers not available yet");
        return decryptedNumbers[key];
    }

    function setTrustedRelayer(address newTrustedRelayer) external onlyRelayer {
        require(newTrustedRelayer != address(0), "Invalid trusted relayer address");
        trustedRelayer = newTrustedRelayer;
    }
}
