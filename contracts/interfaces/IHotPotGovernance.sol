pragma solidity >=0.5.0;
import './IHotPotFund.sol';

interface IHotPotGovernance {
    function hotpot() external view returns (address);
    function manager() external view returns (address);
    function multiSigner() external view returns (address);

    function harvest(address token, uint amount) external returns(uint burned);

    function invest(address fund, uint amount) external;
    function addPool(address fund, address token, uint proportion) external;
    function adjustPool(address fund, uint up_index, uint down_index, uint proportion) external;
    function reBalance(address fund, uint add_index, uint remove_index, uint liquidity) external;
    function setSwapPath(address fund, address tokenIn, address tokenOut, IHotPotFund.SwapPath path) external;
    function setManager(address account) external;
    function setMultiSigner(address account) external;

    function setMintingUNIPool(address fund, address pair, address mintingPool) external;
    function stakeMintingUNI(address fund, address pair) external;
    function stakeMintingUNIAll(address fund) external;
}
