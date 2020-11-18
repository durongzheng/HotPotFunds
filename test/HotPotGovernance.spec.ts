import chai, {expect} from 'chai'
import {Contract} from 'ethers'
import {BigNumber} from 'ethers/utils'
import {AddressZero} from 'ethers/constants'
import {createFixtureLoader, MockProvider, solidity} from 'ethereum-waffle'
import {expandTo18Decimals, expandTo6Decimals, sleep} from './shared/utilities'
import {getAmountOut, getPair, HotPotFixture, mintAndDepositHotPotFund} from './shared/fixtures'


chai.use(require('chai-shallow-deep-equal'));
chai.use(solidity);

const INIT_DEPOSIT_AMOUNT_18 = expandTo18Decimals(1e3);
const INIT_DEPOSIT_AMOUNT_6 = expandTo6Decimals(1e3);
const INIT_HARVEST_AMOUNT_18 = expandTo18Decimals(25);
const INIT_HARVEST_AMOUNT_6 = expandTo6Decimals(25);

describe('HotPotGovernance: ERC20', () => {
    //获取provider环境
    const provider = new MockProvider({
        hardfork: 'istanbul',
        mnemonic: 'hotpot hotpot hotpot hotpot hotpot hotpot hotpot hotpot hotpot hotpot hotpot hotpot',
        gasLimit: 9999999
    });
    const [manager, depositor, trader, other] = provider.getWallets();
    const loadFixture = createFixtureLoader(provider, [manager]);

    let fixture: HotPotFixture;
    let governance: Contract;
    let hotPotFund: Contract;
    let investToken: Contract;
    let tokenHotPot: Contract;
    let pool1: Contract;
    let pool2: Contract;
    let INIT_DEPOSIT_AMOUNT: BigNumber;
    let INIT_HARVEST_AMOUNT: BigNumber;

    before(async () => {
        fixture = await loadFixture(HotPotFixture);
        governance = fixture.hotPotGovernance;
        tokenHotPot = fixture.tokenHotPot;

        const TOKEN_TYPE = "DAI";//case DAI/USDT/USDC
        hotPotFund = (<any>fixture)["hotPotFund" + TOKEN_TYPE];
        investToken = (<any>fixture)["token" + TOKEN_TYPE];

        let pools = [fixture.tokenDAI, fixture.tokenUSDC, fixture.tokenUSDT, fixture.tokenWETH];
        const index = pools.findIndex(value => value.address == investToken.address);
        pools.splice(index, 1);
        pool1 = pools[0];
        pool2 = pools[1];

        INIT_DEPOSIT_AMOUNT = await investToken.decimals() == 18 ? INIT_DEPOSIT_AMOUNT_18 : INIT_DEPOSIT_AMOUNT_6;
        INIT_HARVEST_AMOUNT = await investToken.decimals() == 18 ? INIT_HARVEST_AMOUNT_18 : INIT_HARVEST_AMOUNT_6;

        await mintAndDepositHotPotFund(hotPotFund, investToken, depositor, INIT_DEPOSIT_AMOUNT);
    });

    beforeEach(async () => {
        Object.keys(fixture).forEach(key => {
            (fixture as any)[key].connect(manager);
        });
    });

    it('hotpot, manager', async () => {
        await expect(await governance.hotpot()).to.eq(tokenHotPot.address);
        await expect(await governance.manager()).to.eq(manager.address);
    });

    function harvest(builder: () => any) {
        return async () => {
            const {amountIn} = await builder();
            const {amountOut, pair} = await getAmountOut(fixture.factory, fixture.router,
                investToken.address, tokenHotPot.address, amountIn);

            //transfer token to hotPotGovernance for testing harvest
            await expect(investToken.transfer(governance.address, amountIn))
                .to.not.be.reverted;
            //token balance of governance = amountIn
            await expect(await investToken.balanceOf(governance.address))
                .to.eq(amountIn);

            //error pair
            await expect(governance.harvest(tokenHotPot.address, amountIn))
                .to.be.revertedWith("Pair not exist.");

            //amountIn = 0
            await expect(governance.harvest(investToken.address, 0))
                .to.be.reverted;

            //amountIn = daiAmountIn
            await expect(governance.harvest(investToken.address, amountIn))
                //uniswap
                .to.emit(tokenHotPot, "Transfer")
                .withArgs(pair.address, governance.address, amountOut)
                //burn
                .to.emit(tokenHotPot, "Transfer")
                .withArgs(governance.address, AddressZero, amountOut);
        }
    }

    it("harvest", harvest(() => {
        return {
            amountIn: INIT_HARVEST_AMOUNT
        }
    }));


    function addPool(builder: () => any) {
        return async () => {
            const {pool1, pool2} = await builder();

            //Non-Manager operation
            await expect(governance.connect(depositor).addPool(hotPotFund.address, pool1.address, 100))
                .to.be.revertedWith("Only called by Manager.");

            //init proportion pool1=100
            await expect(governance.addPool(hotPotFund.address, pool1.address, 100))
                .to.not.be.reverted;

            //proportion pool1=50、poo2=50
            await expect(governance.addPool(hotPotFund.address, pool2.address, 50))
                .to.not.be.reverted;
        }
    }

    it('addPool', addPool(async () => {
        return {pool1, pool2};
    }));

    function setSwapPath(builder: () => any) {
        return async () => {
            const {tokenIn, tokenOut, path} = await builder();
            //Non-Manager operation
            await expect(governance.connect(depositor).setSwapPath(hotPotFund.address, tokenIn.address, tokenOut.address, path))
                .to.be.revertedWith("Only called by Manager.");

            //DAi->USDC = Uniswap(0)
            await expect(governance.connect(manager).setSwapPath(hotPotFund.address, tokenIn.address, tokenOut.address, path))
                .to.not.be.reverted;
        }
    }

    it('setSwapPath: Uniswap', setSwapPath(async () => {
        return {
            tokenIn: investToken,
            tokenOut: pool1,
            path: 0 //Uniswap(0) Curve(1)
        }
    }));

    it('setSwapPath: Curve', setSwapPath(async () => {
        return {
            tokenIn: investToken,
            tokenOut: pool2,
            path: 1 //Uniswap(0) Curve(1)
        }
    }));

    function invest(builder: () => any) {
        return async () => {
            const {amount} = await builder();
            //Non-Manager operation
            await expect(governance.connect(depositor).invest(hotPotFund.address, amount))
                .to.be.revertedWith("Only called by Manager.");

            //invest amount
            await expect(governance.connect(manager).invest(hotPotFund.address, amount))
                .to.not.be.reverted;
        }
    }

    it('invest', invest(async () => {
        const amount = INIT_DEPOSIT_AMOUNT;
        await sleep(1);
        return {amount}
    }));

    function adjustPool(builder: () => any) {
        return async () => {
            const {upIndex, downIndex, proportion} = await builder();
            //Non-Manager operation
            await expect(governance.connect(depositor).adjustPool(hotPotFund.address, upIndex, downIndex, proportion))
                .to.be.revertedWith("Only called by Manager.");

            //USDC up 10 proportion, USDT down 10 proportion
            await expect(governance.adjustPool(hotPotFund.address, upIndex, downIndex, proportion))
                .to.not.be.reverted;
        }
    }

    it('adjustPool', adjustPool(() => {
        return {
            upIndex: 0,
            downIndex: 1,
            proportion: 10
        };
    }));


    function reBalance(builder: () => any) {
        return async () => {
            const {addIndex, removeIndex} = await builder();

            const addTokenAddr = (await hotPotFund.pools(addIndex)).token;
            const removeTokenAddr = (await hotPotFund.pools(removeIndex)).token;

            const fundTokenAddr = hotPotFund.token ? await hotPotFund.token() : fixture.tokenWETH.address;
            // const addPair = await getPair(fixture.factory, fundTokenAddr, addTokenAddr);
            const removePair = await getPair(fixture.factory, fundTokenAddr, removeTokenAddr);

            // const addSumLiquidity = await addPair.balanceOf(hotPotFund.address);
            const removeSumLiquidity = await removePair.balanceOf(hotPotFund.address);
            const removeLiquidity = removeSumLiquidity.div(2);// MINIMUM_LIQUIDITY = 1000

            //Non-Manager operation
            await expect(governance.connect(depositor).reBalance(hotPotFund.address, addIndex, removeIndex, removeLiquidity))
                .to.be.revertedWith("Only called by Manager.");

            //reBalance
            await expect(governance.connect(manager).reBalance(hotPotFund.address, addIndex, removeIndex, removeLiquidity))
                .to.not.be.reverted;
        }
    }

    it('reBalance', reBalance(async () => {
        await sleep(1);
        return {addIndex:0, removeIndex:1};
    }));
});

describe('HotPotGovernance: ETH', () => {
    //获取provider环境
    const provider = new MockProvider({
        hardfork: 'istanbul',
        mnemonic: 'hotpot hotpot hotpot hotpot hotpot hotpot hotpot hotpot hotpot hotpot hotpot hotpot',
        gasLimit: 9999999
    });
    const [manager, depositor, trader, other] = provider.getWallets();
    const loadFixture = createFixtureLoader(provider, [manager]);

    let fixture: HotPotFixture;
    let governance: Contract;
    let hotPotFund: Contract;
    let investToken: Contract;
    let tokenHotPot: Contract;
    let pool1: Contract, pool2: Contract;
    let INIT_DEPOSIT_AMOUNT: BigNumber;
    let INIT_INCOME_AMOUNT: BigNumber;
    before(async () => {
        fixture = await loadFixture(HotPotFixture);
        governance = fixture.hotPotGovernance;
        tokenHotPot = fixture.tokenHotPot;

        hotPotFund = fixture.hotPotFundETH;
        investToken = fixture.tokenWETH;
        pool1 = fixture.tokenUSDC;
        pool2 = fixture.tokenUSDT;

        INIT_DEPOSIT_AMOUNT = INIT_DEPOSIT_AMOUNT_18;
        INIT_INCOME_AMOUNT = INIT_HARVEST_AMOUNT_18;

        await mintAndDepositHotPotFund(hotPotFund, investToken, depositor, INIT_DEPOSIT_AMOUNT);
    });

    beforeEach(async () => {
        Object.keys(fixture).forEach(key => {
            (fixture as any)[key].connect(manager);
        });
    });

    it('hotpot, manager', async () => {
        await expect(await governance.hotpot()).to.eq(tokenHotPot.address);
        await expect(await governance.manager()).to.eq(manager.address);
    });

    function harvest(builder: () => any) {
        return async () => {
            const {amountIn} = await builder();
            const {amountOut, pair} = await getAmountOut(fixture.factory, fixture.router,
                investToken.address, tokenHotPot.address, amountIn);

            //transfer token to hotPotGovernance for testing harvest
            await expect(investToken.transfer(governance.address, amountIn))
                .to.not.be.reverted;
            //token balance of governance = amountIn
            await expect(await investToken.balanceOf(governance.address))
                .to.eq(amountIn);

            //error pair
            await expect(governance.harvest(tokenHotPot.address, amountIn))
                .to.be.revertedWith("Pair not exist.");

            //amountIn = 0
            await expect(governance.harvest(investToken.address, 0))
                .to.be.reverted;

            //amountIn = daiAmountIn
            await expect(governance.harvest(investToken.address, amountIn))
                //uniswap
                .to.emit(tokenHotPot, "Transfer")
                .withArgs(pair.address, governance.address, amountOut)
                //burn
                .to.emit(tokenHotPot, "Transfer")
                .withArgs(governance.address, AddressZero, amountOut);
        }
    }

    it("harvest", harvest(() => {
        return {
            amountIn: INIT_INCOME_AMOUNT
        }
    }));


    function addPool(builder: () => any) {
        return async () => {
            const {pool1, pool2} = await builder();

            //Non-Manager operation
            await expect(governance.connect(depositor).addPool(hotPotFund.address, pool1.address, 100))
                .to.be.revertedWith("Only called by Manager.");

            //init proportion pool1=100
            await expect(governance.addPool(hotPotFund.address, pool1.address, 100))
                .to.not.be.reverted;

            //proportion pool1=50、poo2=50
            await expect(governance.addPool(hotPotFund.address, pool2.address, 50))
                .to.not.be.reverted;
        }
    }

    it('addPool', addPool(async () => {
        return {pool1, pool2};
    }));

    function invest(builder: () => any) {
        return async () => {
            const {amount} = await builder();
            //Non-Manager operation
            await expect(governance.connect(depositor).invest(hotPotFund.address, amount))
                .to.be.revertedWith("Only called by Manager.");

            //invest amount
            await expect(governance.connect(manager).invest(hotPotFund.address, amount))
                .to.not.be.reverted;
        }
    }

    it('invest', invest(async () => {
        const amount = INIT_DEPOSIT_AMOUNT;
        await sleep(1);
        return {amount}
    }));

    function adjustPool(builder: () => any) {
        return async () => {
            const {upIndex, downIndex, proportion} = await builder();
            //Non-Manager operation
            await expect(governance.connect(depositor).adjustPool(hotPotFund.address, upIndex, downIndex, proportion))
                .to.be.revertedWith("Only called by Manager.");

            //USDC up 10 proportion, USDT down 10 proportion
            await expect(governance.adjustPool(hotPotFund.address, upIndex, downIndex, proportion))
                .to.not.be.reverted;
        }
    }

    it('adjustPool', adjustPool(() => {
        return {
            upIndex: 0,
            downIndex: 1,
            proportion: 10
        };
    }));


    function reBalance(builder: () => any) {
        return async () => {
            const {addIndex, removeIndex} = await builder();

            const addTokenAddr = (await hotPotFund.pools(addIndex)).token;
            const removeTokenAddr = (await hotPotFund.pools(removeIndex)).token;

            const fundTokenAddr = hotPotFund.token ? await hotPotFund.token() : fixture.tokenWETH.address;
            // const addPair = await getPair(fixture.factory, fundTokenAddr, addTokenAddr);
            const removePair = await getPair(fixture.factory, fundTokenAddr, removeTokenAddr);

            // const addSumLiquidity = await addPair.balanceOf(hotPotFund.address);
            const removeSumLiquidity = await removePair.balanceOf(hotPotFund.address);
            const removeLiquidity = removeSumLiquidity.div(2);// MINIMUM_LIQUIDITY = 1000

            //Non-Manager operation
            await expect(governance.connect(depositor).reBalance(hotPotFund.address, addIndex, removeIndex, removeLiquidity))
                .to.be.revertedWith("Only called by Manager.");

            //reBalance
            await expect(governance.connect(manager).reBalance(hotPotFund.address, addIndex, removeIndex, removeLiquidity))
                .to.not.be.reverted;
        }
    }

    it('reBalance', reBalance(async () => {
        await sleep(1);
        return {addIndex:0, removeIndex:1};
    }));
});
