// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {ConfirmedOwner} from "@chainlink/contracts/src/v0.8/shared/access/ConfirmedOwner.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";

contract LiminalDecryptNumbers is FunctionsClient, ConfirmedOwner {
    using FunctionsRequest for FunctionsRequest.Request;

    bytes32 public s_lastRequestId;
    bytes public s_lastResponse;
    bytes public s_lastError;
    uint[] private decryptedNumbers;

    event DecryptionComplete(uint[] decryptedNumbers);
    event Response(bytes32 indexed requestId, bytes response, bytes err);

    string source =
        "const apiUrl = 'https://paperbacks-antique-tumor-hood.trycloudflare.com/decrypt';"
        "const response = await Functions.makeHttpRequest({"
        "    url: apiUrl,"
        "    method: 'POST',"
        "    headers: { 'Content-Type': 'application/json' },"
        "    data: { encryptedDataArray: args }"
        "});"
        "if (!response.error) {"
        "    const base64String = response.data.decryptedNumbers;"
        "    if (typeof base64String !== 'string') { throw new Error('Response is not a valid Base64 string'); }"
        "    const decodedArray = Uint8Array.from(atob(base64String), c => c.charCodeAt(0));"
        "    return decodedArray;"
        "} else {"
        "    throw new Error('Decryption failed');"
        "}";

    uint32 gasLimit = 300000;
    bytes32 donID = 0x66756e2d617262697472756d2d7365706f6c69612d3100000000000000000000;
    address router = 0x234a5fb5Bd614a7AA2FfAB244D603abFA0Ac5C5C;

    constructor() FunctionsClient(router) ConfirmedOwner(msg.sender) {}

    function sendRequest(
        uint64 subscriptionId,
        string[] calldata encryptedData
    ) external onlyOwner returns (bytes32 requestId) {
        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(source);
        req.setArgs(encryptedData);

        s_lastRequestId = _sendRequest(req.encodeCBOR(), subscriptionId, gasLimit, donID);
        return s_lastRequestId;
    }

    function fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        require(s_lastRequestId == requestId, "Unexpected request ID");

        s_lastResponse = response;
        s_lastError = err;

        // Decode multiple decrypted numbers from the response
        uint[] memory numbers = abi.decode(response, (uint[]));

        // Store the decrypted numbers on-chain
        for (uint i = 0; i < numbers.length; i++) {
            decryptedNumbers.push(numbers[i]);
        }

        emit DecryptionComplete(numbers);
    }

    function getDecryptedNumbers() external view returns (uint[] memory) {
        return decryptedNumbers;
    }
}