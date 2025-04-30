// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "hardhat/console.sol";

contract LiminalToken is ERC20Votes, Pausable, Ownable {
    
    constructor() ERC20("Liminal Token", "$LIM") EIP712("Liminal Token", "1") Ownable(msg.sender) {
        _mint(msg.sender, 1_000_000_000 * 10 ** decimals());
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    function transfer(address to, uint256 amount) public override whenNotPaused returns (bool) {
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override whenNotPaused returns (bool) {
        console.log("transferFrom called");
        console.log("msg.sender:", msg.sender);
        console.log("from:", from);
        console.log("to:", to);
        console.log("amount:", amount);
        console.log("allowance from->msg.sender:", allowance(from, msg.sender));

        return super.transferFrom(from, to, amount);
    }

    function burn(uint256 amount) public {
        _burn(msg.sender, amount);
    }

    function burnFrom(address from, uint256 amount) public {
        _spendAllowance(from, msg.sender, amount);
        _burn(from, amount);
    }

    function _update(address from, address to, uint256 value) internal override(ERC20Votes) {
        super._update(from, to, value);
    }
}
