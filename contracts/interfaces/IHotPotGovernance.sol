pragma solidity >=0.5.0;

interface IHotPotGovernance {
    function hotpot() external view returns (address);
    function manager() external view returns (address);

    function harvest(address token, uint amount) external returns(uint burned);

    function invest(address fund, uint amount) external;    
    function addPool(address fund, address token, uint proportion) external;
    function adjustPool(address fund, uint up_index, uint down_index, uint proportion) external;
    function reBalance(address fund, uint add_index, uint remove_index, uint liquidity) external;
    function setSwapPath(address fund, address tokenIn, address tokenOut, uint path) external;
    function setGovernance(address fund, address governance) external;   
} 