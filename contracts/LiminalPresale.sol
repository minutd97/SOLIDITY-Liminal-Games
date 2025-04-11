// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./LiminalToken.sol";

/// @dev Only include this during Hardhat testing
import "hardhat/console.sol";

interface IV4PoolHelper {
    function createPoolAndAddLiquidity() external;
}

contract LiminalPresale is Ownable {
    LiminalToken public immutable limToken;
    address public immutable v4PoolHelper;
    
    uint256 public constant presaleCap = 10 ether;
    uint256 public startTime;
    uint256 public endTime;
    uint256 public modificationCount = 0;
    uint256 public maxModifications = 2;

    uint256 public constant WALLET_MAX_CONTRIBUTION = 0.5 ether;
    uint256 public constant WALLET_MIN_CONTRIBUTION = 0.02 ether;

    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant MIN_CAP_BPS = 7000; // 70%
    uint256 public constant LIM_TOKEN_RATE = 3000000; // 3000000 LIM per ETH

    bool public presaleEnded = false;
    uint256 public processedBuyersCount = 0;

    uint256 public totalPoolTokens;
    uint256 public totalPresaleTokens;
    uint256 public totalContributions;

    mapping(address => uint256) public presaleContributions;
    address[] public buyers;

    event PresaleStarted(uint256 startTime, uint256 endTime);
    event ContributionReceived(address indexed buyer, uint256 amount);
    event PresaleFinalized(bool success, uint256 totalContributed);
    event EndTimeExtended(uint256 newEndTime);
    event PresaleTokensDeposited(uint256 amount);
    event RewardTokensDeposited(uint256 amount);

    modifier onlyWhileActive() {
        require(startTime > 0 && block.timestamp >= startTime, "Presale not started");
        require(block.timestamp <= endTime, "Presale ended");
        require(!presaleEnded, "Presale ended");
        _;
    }

    constructor(address _limToken, address _v4PoolHelper) Ownable(msg.sender) {
        limToken = LiminalToken(_limToken);
        v4PoolHelper = _v4PoolHelper;
    }

    function startPresale(uint256 _durationInSeconds) external onlyOwner {
        require(endTime == 0, "Already started");
        require(_durationInSeconds > 0, "Invalid duration in seconds");

        startTime = block.timestamp;
        endTime = startTime + _durationInSeconds;

        emit PresaleStarted(startTime, endTime);
    }

    function contribute() external payable onlyWhileActive {
        require(msg.value >= WALLET_MIN_CONTRIBUTION, "Contribution is below minimum");
        require(totalContributions + msg.value <= presaleCap, "Contribution exceeds cap");
        require(presaleContributions[msg.sender] + msg.value <= WALLET_MAX_CONTRIBUTION, "Contribution exceeds wallet limit");

        if (presaleContributions[msg.sender] == 0) {
            buyers.push(msg.sender);
        }

        presaleContributions[msg.sender] += msg.value;
        totalContributions += msg.value;
        emit ContributionReceived(msg.sender, msg.value);
    }

    function endPresale() external onlyOwner {
        require(endTime > 0 && block.timestamp > endTime, "Not ended yet");
        require(!presaleEnded, "Already ended");

        presaleEnded = true;
        emit PresaleFinalized(minCapReached(), totalContributions);
    }

    function distributeTokens(uint256 batchCount) external onlyOwner {
        require(presaleEnded, "Presale not ended");
        require(minCapReached(), "Min cap not reached");

        uint256 remaining = buyers.length - processedBuyersCount;
        uint256 count = batchCount < remaining ? batchCount : remaining;

        for (uint256 i = 0; i < count; i++) {
            address buyer = buyers[processedBuyersCount];     
            uint256 contribution = presaleContributions[buyer];
            uint256 tokensToTransfer = (contribution * LIM_TOKEN_RATE * 1e18) / 1 ether;
            require(tokensToTransfer <= totalPresaleTokens, "Insufficient reward tokens");

            limToken.transfer(buyer, tokensToTransfer);
            totalPresaleTokens -= tokensToTransfer;
            processedBuyersCount++;
        }
    }

    function refundUsers(uint256 batchCount) external onlyOwner {
        require(presaleEnded && !minCapReached(), "Refund not allowed");

        uint256 remaining = buyers.length - processedBuyersCount;
        uint256 count = batchCount < remaining ? batchCount : remaining;

        for (uint256 i = 0; i < count; i++) {
            address buyer = buyers[processedBuyersCount];
            uint256 contribution = presaleContributions[buyer];
            if (contribution > 0) {
                payable(buyer).transfer(contribution);
                totalContributions -= contribution;
            }
            processedBuyersCount++;
        }
    }

    function depositPoolTokens(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        limToken.transferFrom(msg.sender, address(this), amount);
        totalPoolTokens += amount;
        emit PresaleTokensDeposited(amount);
    }

    function depositPresaleTokens(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        limToken.transferFrom(msg.sender, address(this), amount);
        totalPresaleTokens += amount;
        emit RewardTokensDeposited(amount);
    }

    function extendEndTime(uint256 _extraSeconds) external onlyOwner {
        require(endTime > 0 && block.timestamp <= endTime, "Cannot extend");
        require(modificationCount < maxModifications, "Max extensions reached");
        require(_extraSeconds > 0, "Invalid time");

        endTime += _extraSeconds;
        modificationCount++;
        emit EndTimeExtended(endTime);
    }

    function getAllowedContribution(address buyer) external view returns (uint256) {
        return WALLET_MAX_CONTRIBUTION - presaleContributions[buyer];
    }

    function getRemainingTime() external view returns (uint256) {
        return block.timestamp >= endTime ? 0 : endTime - block.timestamp;
    }

    function getRemainingCap() external view returns (uint256) {
        return totalContributions >= presaleCap ? 0 : presaleCap - totalContributions;
    }

    function getBuyersCount() external view returns (uint256) {
        return buyers.length;
    }

    function minCapReached() public view returns (bool) {
        return totalContributions >= (presaleCap * MIN_CAP_BPS) / BPS_DENOMINATOR;
    }
}
