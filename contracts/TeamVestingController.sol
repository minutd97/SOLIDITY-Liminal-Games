// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./TeamVestingWallet.sol";

contract TeamVestingController is Ownable, AccessControl, ReentrancyGuard {
    bytes32 public constant WALLET_FUNDER_ROLE = keccak256("WALLET_FUNDER_ROLE");
    address public immutable vault;
    
    struct VestingInfo {
        address wallet;
        address beneficiary;
        uint64 startTimestamp;
        uint64 duration;
    }

    mapping(address => VestingInfo) public vestingWallets;
    address[] public allVestingWallets;
    bool public finalized;

    event VestingWalletCreated(address indexed beneficiary, address vestingWallet, uint64 startTimestamp, uint64 duration, uint64 cliff);
    event TokensFunded(address indexed beneficiary, address indexed token, uint256 amount);

    constructor() Ownable(msg.sender) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @notice Creates a new vesting wallet with cliff and linear vesting
    function createVestingWallet(
        address beneficiary,
        uint64 startTimestamp,          // when vesting starts (TGE for example)
        uint64 duration,                // total duration after start (e.g. 12 months)
        uint64 cliffDuration,           // how long before first tokens unlock (e.g. 30 days)
        address vaultAddress            
    ) external onlyOwner {
        require(beneficiary != address(0), "Invalid beneficiary");
        require(vestingWallets[beneficiary].wallet == address(0), "Already created");
        require(cliffDuration <= duration, "Cliff > duration");

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
            duration: duration
        });

        allVestingWallets.push(address(wallet));

        emit VestingWalletCreated(beneficiary, address(wallet), startTimestamp, duration, cliffDuration);
    }

    function fundERC20ToWallet(address beneficiary, address token, uint256 amount) external onlyRole(WALLET_FUNDER_ROLE) {
        address wallet = vestingWallets[beneficiary].wallet;
        require(wallet != address(0), "Wallet not found");
        bool success = IERC20(token).transferFrom(msg.sender, wallet, amount);
        require(success, "Token transfer failed");
        emit TokensFunded(beneficiary, token, amount);
    }

    function fundETHToWallet(address beneficiary) external payable onlyRole(WALLET_FUNDER_ROLE) {
        address wallet = vestingWallets[beneficiary].wallet;
        require(wallet != address(0), "Wallet not found");
        (bool success, ) = wallet.call{ value: msg.value }("");
        require(success, "ETH transfer failed");
        emit TokensFunded(beneficiary, address(0), msg.value);
    }

    function releaseVestedERC20(address beneficiary, address token) external nonReentrant {
        address wallet = vestingWallets[beneficiary].wallet;
        require(wallet != address(0), "Wallet not found");
        TeamVestingWallet(payable(wallet)).release(token);
    }

    function releaseVestedETH(address beneficiary) external nonReentrant {
        address wallet = vestingWallets[beneficiary].wallet;
        require(wallet != address(0), "Wallet not found");
        TeamVestingWallet(payable(wallet)).release();
    }

    function revokeVesting(address beneficiary) external onlyOwner {
        address wallet = vestingWallets[beneficiary].wallet;
        require(wallet != address(0), "Wallet not found");
        TeamVestingWallet(payable(wallet)).revoke();
    }

    function reclaimUnvestedERC20(address beneficiary, address token) external onlyOwner {
        address wallet = vestingWallets[beneficiary].wallet;
        require(wallet != address(0), "Wallet not found");
        TeamVestingWallet(payable(wallet)).fundVaultWithLeftoverERC20(token);
    }

    function reclaimUnvestedETH(address beneficiary) external onlyOwner {
        address wallet = vestingWallets[beneficiary].wallet;
        require(wallet != address(0), "Wallet not found");
        TeamVestingWallet(payable(wallet)).fundVaultWithLeftoverETH();
    }

    function grantFunderRole(address account) public onlyOwner {
        grantRole(WALLET_FUNDER_ROLE, account);
    }

    function revokeFunderRole(address account) public onlyOwner {
        revokeRole(WALLET_FUNDER_ROLE, account);
    }

    function releasableAmountERC20(address beneficiary, address token) external view returns (uint256) {
        address wallet = vestingWallets[beneficiary].wallet;
        require(wallet != address(0), "Wallet not found");
        return TeamVestingWallet(payable(wallet)).releasable(token);
    }

    function releasableETH(address beneficiary) external view returns (uint256) {
        address wallet = vestingWallets[beneficiary].wallet;
        require(wallet != address(0), "Wallet not found");
        return TeamVestingWallet(payable(wallet)).releasable();
    }

    function getAllVestingWallets() external view returns (address[] memory) {
        return allVestingWallets;
    }

    function getVestingWallet(address beneficiary) external view returns (address) {
        return vestingWallets[beneficiary].wallet;
    }
}
