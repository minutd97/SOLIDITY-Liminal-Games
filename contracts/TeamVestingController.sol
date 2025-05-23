// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./TeamVestingWallet.sol";

/// @title Team Vesting Controller
/// @notice Creates, manages, and funds TeamVestingWallets with cliff and linear vesting logic.
/// @dev Allows owner or funder roles to distribute and reclaim tokens across multiple vesting wallets.
contract TeamVestingController is Ownable, AccessControl, ReentrancyGuard {
    bytes32 public constant WALLET_FUNDER_ROLE = keccak256("WALLET_FUNDER_ROLE");
    address public vaultAddress;

    struct VestingInfo {
        address wallet;
        address beneficiary;
        uint64 startTimestamp;
        uint64 duration;
        bool funded;
    }

    mapping(address => VestingInfo) public vestingWallets;
    address[] public allVestingWallets;
    bool public finalized;

    event VestingWalletCreated(address indexed beneficiary, address vestingWallet, uint64 startTimestamp, uint64 duration, uint64 cliff);
    event TokensFunded(address indexed beneficiary, address indexed token, uint256 amount);

    constructor() Ownable(msg.sender) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @notice Creates a new TeamVestingWallet for a beneficiary with a cliff and linear vesting schedule.
    function createVestingWallet(
        address beneficiary,
        uint64 duration,                // total duration after start (e.g. 12 months)
        uint64 cliffDuration           // how long before first tokens unlock (e.g. 30 days)       
    ) external onlyOwner {
        require(beneficiary != address(0), "Invalid beneficiary");
        require(vestingWallets[beneficiary].wallet == address(0), "Already created");
        require(cliffDuration <= duration, "Cliff > duration");

        uint64 startTimestamp = uint64(block.timestamp);

        TeamVestingWallet wallet = new TeamVestingWallet(
            beneficiary,
            startTimestamp + cliffDuration,
            duration,
            vaultAddress
        );

        vestingWallets[beneficiary] = VestingInfo({
            wallet: address(wallet),
            beneficiary: beneficiary,
            startTimestamp: startTimestamp,
            duration: duration,
            funded: false
        });

        allVestingWallets.push(address(wallet));

        emit VestingWalletCreated(beneficiary, address(wallet), startTimestamp, duration, cliffDuration);
    }

    function setVaultAddress(address _vault) external onlyOwner {
        require(_vault != address(0), "Invalid valut address");
        vaultAddress = _vault;
    }

    /// @notice Transfers ERC20 tokens from the caller to the beneficiary's vesting wallet.
    function fundERC20ToWallet(address beneficiary, address token, uint256 amount) external onlyRole(WALLET_FUNDER_ROLE) {
        require(token != address(0), "Invalid token");
        require(amount > 0, "Amount must be greater than 0");
        
        VestingInfo storage info = vestingWallets[beneficiary];
        require(info.wallet != address(0), "Wallet not found");
        require(!info.funded, "Wallet already funded");

        info.funded = true;

        bool success = IERC20(token).transferFrom(msg.sender, info.wallet, amount);
        require(success, "Token transfer failed");

        emit TokensFunded(beneficiary, token, amount);
    }

    /// @notice Sends native ETH to the beneficiary's vesting wallet.
    function fundETHToWallet(address beneficiary) external payable onlyRole(WALLET_FUNDER_ROLE) {
        require(msg.value > 0, "Value must be greater than 0");
        VestingInfo storage info = vestingWallets[beneficiary];
        require(info.wallet != address(0), "Wallet not found");
        require(!info.funded, "Wallet already funded");

        info.funded = true;

        (bool success, ) = info.wallet.call{ value: msg.value }("");
        require(success, "ETH transfer failed");

        emit TokensFunded(beneficiary, address(0), msg.value);
    }

    /// @notice Triggers release of vested ERC20 tokens from the beneficiary's wallet to the beneficiary.
    function releaseVestedERC20(address beneficiary, address token) external nonReentrant {
        address wallet = vestingWallets[beneficiary].wallet;
        require(wallet != address(0), "Wallet not found");
        TeamVestingWallet(payable(wallet)).release(token);
    }

    /// @notice Triggers release of vested native ETH from the beneficiary's wallet to the beneficiary.
    function releaseVestedETH(address beneficiary) external nonReentrant {
        address wallet = vestingWallets[beneficiary].wallet;
        require(wallet != address(0), "Wallet not found");
        TeamVestingWallet(payable(wallet)).release();
    }

    /// @notice Revokes a beneficiary's vesting wallet and disables further vesting.
    function revokeVesting(address beneficiary) external onlyOwner {
        address wallet = vestingWallets[beneficiary].wallet;
        require(wallet != address(0), "Wallet not found");
        TeamVestingWallet(payable(wallet)).revoke();
    }

    /// @notice Transfers remaining unvested ERC20 tokens from the revoked vesting wallet to the vault.
    function reclaimUnvestedERC20(address beneficiary, address token) external onlyOwner {
        require(token != address(0), "Invalid token");
        address wallet = vestingWallets[beneficiary].wallet;
        require(wallet != address(0), "Wallet not found");
        TeamVestingWallet(payable(wallet)).fundVaultWithLeftoverERC20(token);
    }

    /// @notice Transfers remaining unvested native ETH from the revoked vesting wallet to the vault.
    function reclaimUnvestedETH(address beneficiary) external onlyOwner {
        address wallet = vestingWallets[beneficiary].wallet;
        require(wallet != address(0), "Wallet not found");
        TeamVestingWallet(payable(wallet)).fundVaultWithLeftoverETH();
    }

    /// @notice Returns the amount of ERC20 tokens currently releasable from a beneficiary's wallet.
    function releasableAmountERC20(address beneficiary, address token) external view returns (uint256) {
        address wallet = vestingWallets[beneficiary].wallet;
        require(wallet != address(0), "Wallet not found");
        return TeamVestingWallet(payable(wallet)).releasable(token);
    }

    /// @notice Returns the amount of native ETH currently releasable from a beneficiary's wallet.
    function releasableETH(address beneficiary) external view returns (uint256) {
        address wallet = vestingWallets[beneficiary].wallet;
        require(wallet != address(0), "Wallet not found");
        return TeamVestingWallet(payable(wallet)).releasable();
    }

    /// @notice Returns a list of all vesting wallet addresses created by the controller.
    function getAllVestingWallets() external view returns (address[] memory) {
        return allVestingWallets;
    }

    /// @notice Returns the vesting wallet address associated with a given beneficiary.
    function getVestingWallet(address beneficiary) external view returns (address) {
        return vestingWallets[beneficiary].wallet;
    }

    /// @notice Grants the WALLET_FUNDER_ROLE to an address.
    function grantFunderRole(address account) public onlyOwner {
        grantRole(WALLET_FUNDER_ROLE, account);
    }

    /// @notice Revokes the WALLET_FUNDER_ROLE from an address.
    function revokeFunderRole(address account) public onlyOwner {
        revokeRole(WALLET_FUNDER_ROLE, account);
    }
}
