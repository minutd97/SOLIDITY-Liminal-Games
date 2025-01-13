// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract LotteryToken is ERC20, Ownable, Pausable, AccessControl {
  
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor() ERC20("LotteryToken", "$LOT") Ownable(msg.sender) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender); // Owner has the admin role by default
        _mint(msg.sender, 300_000 * 10 ** decimals()); // Mint initial supply to owner
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    function transfer(address _to, uint256 _value) public override whenNotPaused returns (bool) {
        return super.transfer(_to, _value);
    }

    function transferFrom(address _from, address _to, uint256 _value) public override whenNotPaused returns (bool) {
        return super.transferFrom(_from, _to, _value);
    }

    function mint(address _to, uint256 _amount) public onlyRole(MINTER_ROLE) {
        _mint(_to, _amount);
    }

    function burn(uint256 _amount) public {
        _burn(msg.sender, _amount);
    }

    function grantMinterRole(address _account) public onlyOwner {
        grantRole(MINTER_ROLE, _account);
    }

    function revokeMinterRole(address _account) public onlyOwner {
        revokeRole(MINTER_ROLE, _account);
    }
}
