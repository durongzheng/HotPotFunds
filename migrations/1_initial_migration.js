const HotPotFund = artifacts.require("HotPotFund");
const HotPotFundETH = artifacts.require("HotPotFundETH");

module.exports = function(deployer) {
  deployer.deploy(HotPotFund);
  deployer.deploy(HotPotFundETH);
};
