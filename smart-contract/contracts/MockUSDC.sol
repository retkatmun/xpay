// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title TestUSDC
 * @notice A faucet token for local Hardhat tests ONLY.
 *
 * XPay uses the official Circle USDC on Base Sepolia:
 *   0x036CbD53842c5426634e7929541eC2318f3dCF7e
 *
 * This contract is NEVER deployed by XPay in any environment where real USDC
 * is available. It exists solely so the full XPay flow can be exercised on a
 * local Hardhat node without needing a faucet or Circle approval.
 *
 * When running against Base Sepolia testnet, point USDC_ADDRESS at the
 * official Circle address above — this contract is ignored entirely.
 *
 * @dev ⚠️ MINTING IS OPEN. Anyone can call `mint`. Never deploy to mainnet.
 */
contract TestUSDC is ERC20 {
    constructor() ERC20("XPay Test USDC", "tUSDC") {}

    /// @dev USDC is a 6-decimal token. Match it exactly.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /**
     * @notice Mint tokens to any address.
     * @param to     Recipient address.
     * @param amount Base units — 1_000_000 = $1.00 tUSDC.
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Mint to yourself. Convenience for local testing.
    function mintTo(uint256 amount) external {
        _mint(msg.sender, amount);
    }
}
