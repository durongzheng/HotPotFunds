pragma solidity >=0.5.0;

import './interfaces/IHotPotFund.sol';
import './interfaces/IERC20.sol';
import './interfaces/IHotPot.sol';
import './interfaces/IUniswapV2Router.sol';
import './interfaces/IUniswapV2Factory.sol';
import './libraries/SafeERC20.sol';

contract HotPotGovernance {
    using SafeERC20 for IERC20;

    address constant UNISWAP_V2_ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address constant UNISWAP_FACTORY = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;

    address public hotpot;
    address public manager;

    modifier onlyManager {
        require(msg.sender == manager, 'Only called by Manager.');
        _;
    }

    function harvest(address token, uint amount) public returns(uint burned) {
        uint value = amount <= IERC20(token).balanceOf(address(this)) ? amount : IERC20(token).balanceOf(address(this));

        address pair = IUniswapV2Factory(UNISWAP_FACTORY).getPair(token, hotpot);
        require(pair != address(0), 'Pair not exist.');

        IERC20(token).safeApprove(UNISWAP_V2_ROUTER, value);
        address[] memory path = new address[](2);
        path[0] = token;
        path[1] = hotpot;
        uint[] memory amounts = IUniswapV2Router(UNISWAP_V2_ROUTER).swapExactTokensForTokens(
            value, 
            0, 
            path, 
            address(this), block.timestamp);
        IHotPot(hotpot).burn(amounts[1]);
        return amounts[1];
    }

    function invest(address fund, uint amount) external onlyManager {
        IHotPotFund(fund).invest(amount);
    }     

    function addPool(address fund, address token, uint proportion) external onlyManager{
        IHotPotFund(fund).addPool(token, proportion);
    }

    function adjustPool(
        address fund, 
        uint up_index, 
        uint down_index, 
        uint proportion
    ) external onlyManager {
        IHotPotFund(fund).adjustPool(up_index, down_index, proportion);
    }

    function reBalance(
        address fund, 
        uint add_index, 
        uint remove_index, 
        uint liquidity
    ) external onlyManager {
        IHotPotFund(fund).reBalance(add_index, remove_index, liquidity);
    }

    function setSwapPath(
        address fund, 
        address tokenIn, 
        address tokenOut, 
        uint path
    ) external onlyManager {
        IHotPotFund(fund).setSwapPath(tokenIn, tokenOut, path);
    }
}