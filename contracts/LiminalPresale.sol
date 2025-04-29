// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./LiminalToken.sol";

/// @dev Only include this during Hardhat testing
import "hardhat/console.sol";

struct PoolInput {
    address token0;
    address token1;
    uint256 amount0;
    uint256 amount1;
    uint24 fee;
    int24 tickSpacing;
    int24 tickLower;
    int24 tickUpper;
}

interface IV4PoolHelper {
    function setupPermit2Approvals(address token0, address token1) external;
    function createPoolAndAddLiquidity(PoolInput calldata input) external payable;
}

contract LiminalPresale is Ownable {
    LiminalToken public immutable limToken;
    address public immutable v4PoolHelper;
    
    uint256 public constant MIN_ETH_REQUIERED = 7 ether;
    uint256 public constant WALLET_MAX_CONTRIBUTION = 0.5 ether;
    uint256 public constant WALLET_MIN_CONTRIBUTION = 0.02 ether;

    uint256 public startTime;
    uint256 public endTime;
    uint256 public modificationCount = 0;
    uint256 public maxModifications = 2;

    uint256 public totalPoolTokens;
    uint256 public totalPresaleTokens;
    uint256 public totalContributions;

    mapping(address => uint256) public presaleContributions;
    address[] public buyers;

    bool public presaleEnded = false;
    uint256 public processedBuyersCount = 0;
    bool public tokensDistributed = false;

    event PresaleStarted(uint256 startTime, uint256 endTime);
    event ContributionReceived(address indexed buyer, uint256 amount);
    event PresaleFinalized(bool success, uint256 totalContributed);
    event EndTimeExtended(uint256 newEndTime);
    event PoolTokensDeposited(uint256 amount);
    event PresaleTokensDeposited(uint256 amount);

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
            uint256 tokensToTransfer = (contribution * totalPresaleTokens) / totalContributions;

            limToken.transfer(buyer, tokensToTransfer);
            processedBuyersCount++;
        }

        if (processedBuyersCount >= buyers.length) {
            tokensDistributed = true;
            totalPresaleTokens = 0;
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

    function createUniswapV4Pool() external onlyOwner {
        require(tokensDistributed, "Tokens are not distributed");
        IV4PoolHelper(v4PoolHelper).setupPermit2Approvals(address(0), address(limToken));
        limToken.transfer(v4PoolHelper, totalPoolTokens);

        (int24 tickSpacing, int24 tickLower, int24 tickUpper) = calculateTicks();

        PoolInput memory input = PoolInput({
            token0: address(0),
            token1: address(limToken),
            amount0: totalContributions,
            amount1: totalPoolTokens,
            fee: 300,
            tickSpacing: tickSpacing,
            tickLower: tickLower,
            tickUpper: tickUpper
        });

        IV4PoolHelper(v4PoolHelper).createPoolAndAddLiquidity{value: totalContributions}(input);
        totalContributions = 0;
        totalPoolTokens = 0;
    }

    function calculateTicks() internal view returns (int24 tickSpacing, int24 tickLower, int24 tickUpper) {   
        tickSpacing = 60;
        int24 baseCenterTick;

        if (totalContributions == 0 || totalPoolTokens == 0) {
            baseCenterTick = 150000; // fallback default
        } else {
            // Simple rough estimation: scale center tick around 150000
            // You can tune this based on your expected ETH/LIM ratio
            uint256 priceInWei = (totalContributions * 1e18) / totalPoolTokens; // price = ETH per LIM

            if (priceInWei >= 1e15) {
                // Very expensive LIM, higher center tick
                baseCenterTick = 155000;
            } else if (priceInWei >= 1e13) {
                // Medium priced LIM
                baseCenterTick = 150000;
            } else {
                // Cheap LIM, lower center tick
                baseCenterTick = 145000;
            }
        }

        // Align center tick
        int24 centerTick = (baseCenterTick / tickSpacing) * tickSpacing;

        // How wide the range should be
        int24 rangeSize = 40080; // wide range
        int24 halfRange = rangeSize / 2;

        tickLower = centerTick - halfRange;
        tickUpper = centerTick + halfRange;

        // Align tickLower and tickUpper safely
        tickLower = (tickLower / tickSpacing) * tickSpacing;
        tickUpper = (tickUpper / tickSpacing) * tickSpacing;

        require(tickLower < tickUpper, "Invalid ticks calculated");
    }

    function extendEndTime(uint256 _extraSeconds) external onlyOwner {
        require(endTime > 0 && block.timestamp <= endTime, "Cannot extend");
        require(modificationCount < maxModifications, "Max extensions reached");
        require(_extraSeconds > 0, "Invalid time");

        endTime += _extraSeconds;
        modificationCount++;
        emit EndTimeExtended(endTime);
    }

    function depositPoolTokens(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        limToken.transferFrom(msg.sender, address(this), amount);
        totalPoolTokens += amount;
        emit PoolTokensDeposited(amount);
    }

    function depositPresaleTokens(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        limToken.transferFrom(msg.sender, address(this), amount);
        totalPresaleTokens += amount;
        emit PresaleTokensDeposited(amount);
    }

    function minCapReached() public view returns (bool) {
        return totalContributions >= MIN_ETH_REQUIERED;
    }

    function getAllowedContribution(address buyer) external view returns (uint256) {
        return WALLET_MAX_CONTRIBUTION - presaleContributions[buyer];
    }

    function getRemainingTime() external view returns (uint256) {
        return block.timestamp >= endTime ? 0 : endTime - block.timestamp;
    }

    function getBuyersCount() external view returns (uint256) {
        return buyers.length;
    }
}
