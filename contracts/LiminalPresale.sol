// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./LiminalToken.sol";

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

/// @title LiminalPresale - Handles the contribution, distribution, and liquidity setup for LIM token presale
contract LiminalPresale is Ownable {
    LiminalToken public immutable limToken; // LiminalToken contract used for presale and liquidity
    address public immutable v4PoolHelper; // Address of the Uniswap V4 pool helper contract
    
    uint256 public constant MIN_ETH_REQUIERED = 7 ether; // Minimum ETH required for presale to be valid
    uint256 public constant WALLET_MAX_CONTRIBUTION = 0.5 ether; // Maximum ETH a single wallet can contribute
    uint256 public constant WALLET_MIN_CONTRIBUTION = 0.02 ether; // Minimum ETH a single wallet must contribute

    uint256 public startTime; // Timestamp when the presale starts
    uint256 public endTime; // Timestamp when the presale ends
    uint256 public modificationCount = 0; // Number of times the end time has been extended
    uint256 public maxModifications = 2; // Maximum number of allowed extensions

    uint256 public totalPoolTokens; // Total tokens reserved for Uniswap V4 liquidity
    uint256 public totalPresaleTokens; // Total tokens allocated for presale participants
    uint256 public totalContributions; // Total ETH contributed by all buyers

    mapping(address => uint256) public presaleContributions; // Mapping of buyer to amount contributed
    address[] public buyers; // List of all buyers in the presale

    bool public presaleEnded = false; // Indicates whether the presale has ended
    uint256 public processedBuyersCount = 0; // Number of buyers already processed for refund or token distribution
    bool public tokensDistributed = false; // Indicates whether presale tokens have been fully distributed

    event PresaleStarted(uint256 startTime, uint256 endTime);
    event ContributionReceived(address indexed buyer, uint256 amount);
    event PresaleFinalized(bool success, uint256 totalContributed);
    event EndTimeExtended(uint256 newEndTime);
    event PoolTokensDeposited(uint256 amount);
    event PresaleTokensDeposited(uint256 amount);

    /// @notice Restricts function access to only when presale is active and not yet ended
    modifier onlyWhileActive() {
        require(startTime > 0 && block.timestamp >= startTime, "Presale not started");
        require(block.timestamp <= endTime, "Presale ended");
        require(!presaleEnded, "Presale ended");
        _;
    }

    /// @notice Initializes the presale contract with token and helper contract addresses
    /// @param _limToken The address of the LIM token contract
    /// @param _v4PoolHelper The address of the Uniswap V4 pool helper contract
    constructor(address _limToken, address _v4PoolHelper) Ownable(msg.sender) {
        limToken = LiminalToken(_limToken);
        v4PoolHelper = _v4PoolHelper;
    }

    /// @notice Starts the presale with a given duration in seconds
    function startPresale(uint256 _durationInSeconds) external onlyOwner {
        require(endTime == 0, "Already started");
        require(_durationInSeconds > 0, "Invalid duration in seconds");

        startTime = block.timestamp;
        endTime = startTime + _durationInSeconds;

        emit PresaleStarted(startTime, endTime);
    }

    /// @notice Allows users to contribute ETH to the presale within limits
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

    /// @notice Ends the presale after the end time has passed
    function endPresale() external onlyOwner {
        require(endTime > 0 && block.timestamp > endTime, "Not ended yet");
        require(!presaleEnded, "Already ended");

        presaleEnded = true;
        emit PresaleFinalized(minCapReached(), totalContributions);
    }

    /// @notice Distributes presale tokens to contributors in batches
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

    /// @notice Refunds ETH to contributors if minimum cap was not reached
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

    /// @notice Creates the Uniswap V4 pool and adds liquidity using ETH and LIM tokens
    function createUniswapV4Pool() external onlyOwner {
        require(tokensDistributed, "Tokens are not distributed");
        IV4PoolHelper(v4PoolHelper).setupPermit2Approvals(address(0), address(limToken));
        limToken.transfer(v4PoolHelper, totalPoolTokens);

        // Ticks will be determined in the V4PoolHelper contract
        PoolInput memory input = PoolInput({
            token0: address(0),
            token1: address(limToken),
            amount0: totalContributions,
            amount1: totalPoolTokens,
            fee: 300,
            tickSpacing: 60,
            tickLower: 0,
            tickUpper: 0
        });

        IV4PoolHelper(v4PoolHelper).createPoolAndAddLiquidity{value: totalContributions}(input);
        totalContributions = 0;
        totalPoolTokens = 0;
    }

    /// @notice Extends the presale end time by a specified number of seconds (limited times)
    function extendEndTime(uint256 _extraSeconds) external onlyOwner {
        require(endTime > 0 && block.timestamp <= endTime, "Cannot extend");
        require(modificationCount < maxModifications, "Max extensions reached");
        require(_extraSeconds > 0, "Invalid time");

        endTime += _extraSeconds;
        modificationCount++;
        emit EndTimeExtended(endTime);
    }

    /// @notice Deposits tokens into the contract to be used for liquidity
    function depositPoolTokens(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        limToken.transferFrom(msg.sender, address(this), amount);
        totalPoolTokens += amount;
        emit PoolTokensDeposited(amount);
    }

    /// @notice Deposits tokens into the contract to be distributed to presale buyers
    function depositPresaleTokens(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        limToken.transferFrom(msg.sender, address(this), amount);
        totalPresaleTokens += amount;
        emit PresaleTokensDeposited(amount);
    }

    /// @notice Checks whether the minimum ETH cap has been reached
    function minCapReached() public view returns (bool) {
        return totalContributions >= MIN_ETH_REQUIERED;
    }

    /// @notice Returns the remaining amount a buyer is allowed to contribute
    function getAllowedContribution(address buyer) external view returns (uint256) {
        return WALLET_MAX_CONTRIBUTION - presaleContributions[buyer];
    }

    /// @notice Returns how many seconds are left before the presale ends
    function getRemainingTime() external view returns (uint256) {
        return block.timestamp >= endTime ? 0 : endTime - block.timestamp;
    }

    /// @notice Returns the total number of presale buyers
    function getBuyersCount() external view returns (uint256) {
        return buyers.length;
    }
}
