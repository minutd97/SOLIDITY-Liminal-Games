// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {ConfirmedOwner} from "@chainlink/contracts/src/v0.8/shared/access/ConfirmedOwner.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";

contract DecryptNumbers is FunctionsClient, ConfirmedOwner {
    using FunctionsRequest for FunctionsRequest.Request;

    bytes32 public s_lastRequestId;
    bytes public s_lastResponse;
    bytes public s_lastError;
    uint[] public decryptedNumbers;

    event DecryptionComplete(uint[] decryptedNumbers);
    event Response(bytes32 indexed requestId, bytes response, bytes err);

    string source =
        "const encryptedData = {"
        "    iv: args[0],"
        "    ephemPublicKey: args[1],"
        "    ciphertext: args[2],"
        "    mac: args[3]"
        "};"
        "const apiUrl = 'https://your-decryption-api.com/decrypt';"
        "const response = await Functions.makeHttpRequest({"
        "    url: apiUrl,"
        "    method: 'POST',"
        "    headers: { 'Content-Type': 'application/json' },"
        "    data: JSON.stringify({ encryptedData })"
        "});"
        "if (!response.error) {"
        "    return response.data.decryptedNumber;"
        "} else {"
        "    throw new Error('Decryption failed');"
        "}";

    uint32 gasLimit = 300000;
    bytes32 donID = 0x66756e2d657468657265756d2d7365706f6c69612d3100000000000000000000;

    constructor(address router) FunctionsClient(router) ConfirmedOwner(msg.sender) {}

    function sendRequest(
        uint64 subscriptionId,
        string calldata iv,
        string calldata ephemPublicKey,
        string calldata ciphertext,
        string calldata mac
    ) external onlyOwner returns (bytes32 requestId) {
        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(source);

        string[] memory args;
        args[0] = iv;
        args[1] = ephemPublicKey;
        args[2] = ciphertext;
        args[3] = mac;

        req.setArgs(args);

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

        // Decode decrypted number
        uint decryptedNumber = abi.decode(response, (uint));
        decryptedNumbers.push(decryptedNumber);

        emit DecryptionComplete(decryptedNumbers);
    }
}
