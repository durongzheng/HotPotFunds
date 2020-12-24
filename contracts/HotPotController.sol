pragma solidity >=0.5.0;

import './interfaces/IHotPotFund.sol';
import './interfaces/IERC20.sol';
import './interfaces/IHotPot.sol';
import './interfaces/IUniswapV2Router.sol';
import './interfaces/IUniswapV2Factory.sol';
import './libraries/SafeERC20.sol';
import './ReentrancyGuard.sol';

contract HotPotController is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address constant UNISWAP_V2_ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address constant UNISWAP_FACTORY = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;

    address public hotpot;
    address public manager;
    address public governance;
    mapping (address => bool) public trustedToken;

    event ChangeTrustedToken(address indexed token, bool isTrusted);

    modifier onlyManager {
        require(msg.sender == manager, 'Only called by Manager.');
        _;
    }

    modifier onlyGovernance{
        require(msg.sender == governance, 'Only called by Governance.');
        _;
    }

    constructor(
        address _hotpot,
        address _manager,
        address _governance
    ) public {
        hotpot = _hotpot;
        manager = _manager;
        governance = _governance;
    }

    function harvest(
        address token,
        uint amount
    ) public nonReentrant returns(uint burned) {
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

    function invest(address fund, uint amount, uint[] calldata proportions) external onlyManager {
        IHotPotFund(fund).invest(amount, proportions);
    }

    function addPair(address fund, address token) external onlyManager{
        require(trustedToken[token], "The token is not trusted.");
        IHotPotFund(fund).addPair(token);
    }

    function removePair(address fund, uint index)  external onlyManager {
        IHotPotFund(fund).removePair(index);
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
        IHotPotFund.SwapPath path
    ) external onlyManager {
        IHotPotFund(fund).setSwapPath(tokenIn, tokenOut, path);
    }

    function mineUNI(address fund, address pair) external onlyManager {
        IHotPotFund(fund).mineUNI(pair);
    }

    function mineUNIAll(address fund) external onlyManager {
        IHotPotFund(fund).mineUNIAll();
    }

    function setGovernance(address account) onlyGovernance external {
        require(account != address(0), "invalid governance address.");
        governance = account;
    }

    function setManager(address account) onlyGovernance external{
        require(account != address(0), "invalid manager address.");
        manager = account;
    }

    function setUNIPool(address fund, address pair, address uniPool) external onlyGovernance {
        IHotPotFund(fund).setUNIPool(pair, uniPool);
    }

    function setTrustedToken(address token, bool isTrusted) external onlyGovernance {
        trustedToken[token] = isTrusted;
        emit ChangeTrustedToken(token, isTrusted);
    }
}
