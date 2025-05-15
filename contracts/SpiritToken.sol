// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title Spirit Token (SPIRIT)
/// @notice ERC20 token designed exclusively for in-game usage within the Liminal Games ecosystem.
/// The only minter will be the Spirit Token Factory contract, which is granted the minter role early,
/// after which the owner renounces admin rights to ensure protocol fairness and decentralization.
contract SpiritToken is ERC20, Ownable, Pausable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE"); // Role hash for authorized minters

    bool public adminRenounced = false; // Indicates if the admin role has been permanently renounced
    event AdminRoleRenounced(address indexed previousAdmin); // Emitted when admin role is renounced

    /// @notice Deploys the SPIRIT token and assigns the deployer as both owner and admin.
    constructor() ERC20("Spirit Token", "SPIRIT") Ownable(msg.sender) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @notice Pauses all token transfers. Only callable by the owner.
    function pause() public onlyOwner {
        _pause();
    }

    /// @notice Unpauses token transfers. Only callable by the owner.
    function unpause() public onlyOwner {
        _unpause();
    }

    /// @notice Transfers tokens when not paused.
    function transfer(address to, uint256 amount) public override whenNotPaused returns (bool) {
        return super.transfer(to, amount);
    }

    /// @notice Transfers tokens from another address when not paused.
    function transferFrom(address from, address to, uint256 amount) public override whenNotPaused returns (bool) {
        return super.transferFrom(from, to, amount);
    }

    /// @notice Mints tokens to the given address. Only callable by addresses with MINTER_ROLE.
    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /// @notice Burns tokens from the caller's address.
    function burn(uint256 amount) public {
        _burn(msg.sender, amount);
    }

    /// @notice Burns tokens from another address using allowance.
    function burnFrom(address from, uint256 amount) public {
        _spendAllowance(from, msg.sender, amount);
        _burn(from, amount);
    }

    /// @notice Grants the MINTER_ROLE to the specified account. Callable only by the owner.
    function grantMinterRole(address account) public onlyOwner {
        grantRole(MINTER_ROLE, account);
    }

    /// @notice Permanently renounces the DEFAULT_ADMIN_ROLE from the owner. Irreversible.
    function renounceAdmin() external onlyOwner {
        require(!adminRenounced, "Admin role already renounced");
        adminRenounced = true;
        _revokeRole(DEFAULT_ADMIN_ROLE, msg.sender);
        emit AdminRoleRenounced(msg.sender);
    }
}
