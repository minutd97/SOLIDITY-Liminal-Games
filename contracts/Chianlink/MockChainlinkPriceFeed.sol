// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockChainlinkPriceFeed {
    int256  private _answer;
    uint80  private _roundId;
    uint256 private _startedAt;
    uint256 private _updatedAt;
    uint80  private _answeredInRound;

    constructor(int256 initialAnswer) {
        _answer          = initialAnswer;
        _roundId         = 1;
        _startedAt       = block.timestamp;
        _updatedAt       = block.timestamp;
        _answeredInRound = 1;
    }

    // same signature your factory expects
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (_roundId, _answer, _startedAt, _updatedAt, _answeredInRound);
    }

    function setAnswer(int256 newAnswer) external {
        _answer          = newAnswer;
        _updatedAt       = block.timestamp;
        _roundId        += 1;
        _answeredInRound = _roundId;
    }
}
