const ethers = require('ethers');
const express = require('express');
const helmet = require('helmet');
const { Sleuth } = require('@compound-finance/sleuth');
const accountDataQuerySol = require('./artifacts/contracts/sleuth-queries/AccountDataQuery.sol/AccountDataQuery.json');
const port = process.argv[2] || 3000;
const db = {};

// Update borrower data for all Comet instances
// Happens in an interval if not updated in between auto-syncs
const autoSyncInterval = 60 * 60 * 1000; // 1 hour in ms

const cometInstanceData = {
  'cUSDCv3_ETH': {
    proxy: '0xc3d688B66703497DAA19211EEdff47f25384cdc3',
    rpc: process.env.MAINNET_PROVIDER_URL,
    debounceMs: 90 * 1000,
    baseAssetDecimals: 6,
    baseAssetSymbol: 'USDC',
    baseAssetAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    baseAssetPriceFeed: '0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6',
  },
  'cWETHv3_ETH': {
    proxy: '0xA17581A9E3356d9A858b789D68B4d866e593aE94',
    rpc: process.env.MAINNET_PROVIDER_URL,
    debounceMs: 90 * 1000,
    baseAssetDecimals: 18,
    baseAssetSymbol: 'WETH',
    baseAssetAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    baseAssetPriceFeed: '0xD72ac1bCE9177CFe7aEb5d0516a38c88a64cE0AB',
  },
  'cUSDCv3_POL': {
    proxy: '0xF25212E676D1F7F89Cd72fFEe66158f541246445',
    rpc: process.env.POLYGON_PROVIDER_URL,
    debounceMs: 90 * 1000,
    baseAssetDecimals: 6,
    baseAssetSymbol: 'USDC',
    baseAssetAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    baseAssetPriceFeed: '0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7',
  },
  'cUSDCv3_e_ARB': {
    proxy: '0xA5EDBDD9646f8dFF606d7448e414884C7d905dCA',
    rpc: process.env.ARBITRUM_PROVIDER_URL,
    debounceMs: 90 * 1000,
    baseAssetDecimals: 6,
    baseAssetSymbol: 'USDC.e',
    baseAssetAddress: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    baseAssetPriceFeed: '0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3',
  },
  'cUSDCv3_ARB': {
    proxy: '0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf',
    rpc: process.env.ARBITRUM_PROVIDER_URL,
    debounceMs: 90 * 1000,
    baseAssetDecimals: 6,
    baseAssetSymbol: 'USDC',
    baseAssetAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    baseAssetPriceFeed: '0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3',
  },
  'cUSDbCv3_BASE': {
    proxy: '0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf',
    rpc: process.env.BASE_PROVIDER_URL,
    eventBlockRange: 9999,
    debounceMs: 90 * 1000,
    baseAssetDecimals: 6,
    baseAssetSymbol: 'USDbC',
    baseAssetAddress: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
    baseAssetPriceFeed: '0x7e860098F58bBFC8648a4311b374B1D669a2bc6B',
  },
  'cWETHv3_BASE': {
    proxy: '0x46e6b214b524310239732D51387075E0e70970bf',
    rpc: process.env.BASE_PROVIDER_URL,
    eventBlockRange: 9999,
    debounceMs: 90 * 1000,
    baseAssetDecimals: 18,
    baseAssetSymbol: 'WETH',
    baseAssetAddress: '0x4200000000000000000000000000000000000006',
    baseAssetPriceFeed: '0x9f485610E26B9c0140439f88Dc0C7742903Bd1CF',
  },
};

const cometAbi = [
  'event Withdraw(address indexed src, address indexed to, uint amount)',
  'function userBasic(address account) public view returns (int104 principal, uint64 baseTrackingIndex, uint64 baseTrackingAccrued, uint16 assetsIn, uint8 _reserved)',
  'function baseToken() public view returns (address)',
  'function baseTokenPriceFeed() public view returns (address)',
  'function numAssets() public view returns (uint8)',
  'function getAssetInfo(uint8 i) public view returns (uint8 offset, address asset, address priceFeed, uint64 scale, uint64 borrowCollateralFactor, uint64 liquidateCollateralFactor, uint64 liquidationFactor, uint128 supplyCap)',
  'function getPrice(address priceFeed) public view returns (uint128)',
  'function borrowBalanceOf(address account) public view returns (uint256)',
  'function collateralBalanceOf(address account, address asset) public view returns (uint128)',
];

const erc20Abi = [
  'function symbol() public view returns(string)',
  'function decimals() public view returns(uint8)',
];

function updateConsoleLogLine() {
  const strings = [];

  Object.values(arguments).forEach(arg => {
    const str = arg.toString();
    strings.push(str === '[object Object]' ? JSON.stringify(arg) : str);
  });

  process.stdout.clearLine();
  process.stdout.cursorTo(0);
  process.stdout.write(strings.join(', '));
}

async function syncInstance(instance) {
  if (!db[instance]) {
    db[instance] = {
      block: 0,
      ts: 0,
      borrowers: [],
      assets: {},
      numCollaterals: 0,
    };
  }

  const timestamp = Date.now();
  const { debounceMs } = cometInstanceData[instance];

  // Polled too recently, debounce to limit frivolous JSON RPC calls
  if (db[instance].ts + debounceMs > timestamp) {
    return;
  }
  db[instance].ts = timestamp;

  const provider = new ethers.providers.JsonRpcProvider(cometInstanceData[instance].rpc);
  const comet = new ethers.Contract(cometInstanceData[instance].proxy, cometAbi, provider);
  const numCollaterals = await comet.numAssets();

  // Update the in-memory DB first then save it to disk

  if (numCollaterals !== db[instance].numCollaterals) {
    db[instance].assets = await pullAssetDataFromChain(instance, db[instance].assets);
  }

  db[instance].numCollaterals = numCollaterals;

  await pullPriceDataFromChain(instance, db[instance].assets);
  await pullBorrowerDataFromChain(instance, db[instance].block);
  calculateAccountHealths(instance);
}

async function syncDbWithBlockchains(_instance) {
  if (_instance) {
    // Do one
    await syncInstance(_instance);
  } else {
    // Do all
    const instances = Object.keys(cometInstanceData);

    for (let i = 0; i < instances.length; i++) {
      const instance = instances[i];
      await syncInstance(instance);
    }
  }
}

async function pullAssetDataFromChain(instance, assets) {
  updateConsoleLogLine(`Finding ${instance} relevant asset metadata...`);
  const { proxy, rpc, baseAssetDecimals, baseAssetSymbol, baseAssetAddress, baseAssetPriceFeed } = cometInstanceData[instance];

  const provider = new ethers.providers.JsonRpcProvider(rpc);
  const comet = new ethers.Contract(proxy, cometAbi, provider);

  // First asset in this object (keys) is always the base asset
  assets[baseAssetSymbol] = { address: baseAssetAddress, decimals: baseAssetDecimals, priceFeed: baseAssetPriceFeed };

  const numAssets = await comet.numAssets();

  for (let i = 0; i < numAssets; i++) {
    const info = await comet.getAssetInfo(i);
    const [ address, priceFeed, cf, lcf ] = [ info[1], info[2], +(info[4]).toString() / 1e18, +(info[5]).toString() / 1e18 ];
    const asset = new ethers.Contract(address, erc20Abi, provider);
    const assetSymbol = await asset.symbol();
    const decimals = +(await asset.decimals()).toString();

    assets[assetSymbol] = { address, decimals, priceFeed, cf, lcf };
  }

  return assets;
}

async function pullPriceDataFromChain(instance, assets) {
  updateConsoleLogLine(`Finding ${instance} relevant asset price data...`);
  const { proxy, rpc } = cometInstanceData[instance];

  const provider = new ethers.providers.JsonRpcProvider(rpc);
  const comet = new ethers.Contract(proxy, cometAbi, provider);

  const numAssets = Object.keys(assets).length;

  for (let i = 0; i < numAssets; i++) {
    const symbol = Object.keys(assets)[i];
    const { priceFeed } = assets[symbol];
    const price = +(await comet.getPrice(priceFeed)).toString() / 1e8;
    db[instance].assets[symbol].price = price;
  }
}

async function getWithdrawEvents(cometAddress, provider, fromBlock, toBlock, eventBlockRange) {
  const comet = new ethers.Contract(cometAddress, cometAbi, provider);

  let withdrawEvents = [];

  for (let i = fromBlock; i < toBlock; i += (eventBlockRange || 500000)) {
    const _startBlock = i;
    const _endBlock = Math.min(toBlock, i + (eventBlockRange || 500000));
    const events = await comet.queryFilter(comet.filters.Withdraw(), _startBlock, _endBlock);
    withdrawEvents = [...withdrawEvents, ...events];
  }

  return withdrawEvents;
}

function chunkBy(arr, chunkSize) {
  let chunks = Math.ceil(arr.length / chunkSize);
  return [...new Array(chunks)].map((_, i) =>
    arr.slice(i * chunkSize, ( i + 1 ) * chunkSize )
  );
}

async function getDataForAllAccounts(provider, uniqueAddresses, cometAddress) {
  const sleuth = new Sleuth(provider);
  let accountDataQuerySolFixed = {
    ...accountDataQuerySol,
    evm: { bytecode: { object: accountDataQuerySol.bytecode } }
  };
  let accountDataQuery = await Sleuth.querySol(accountDataQuerySolFixed);

  let accountDataArray = [];

  const addressChunkSize = 1000;
  for (let chunk of chunkBy([...uniqueAddresses], addressChunkSize)) {
    let [chunkBlockNumber, _accountDataArray] = await sleuth.fetch(accountDataQuery, [cometAddress, chunk]);
    accountDataArray = accountDataArray.concat(_accountDataArray);
  }

  return accountDataArray;
}

async function pullBorrowerDataFromChain(instance, fromBlock) {
  updateConsoleLogLine(`Finding ${instance} borrower data from block ${fromBlock} to present...`);
  // Get all hitorical withdraws
  // Narrow it down to all present borrowers based on all the withdraws

  const { proxy, rpc, baseAssetDecimals, eventBlockRange } = cometInstanceData[instance];
  const getSymbolByAddress = {};
  Object.keys(db[instance].assets).forEach((symbol) => {
    getSymbolByAddress[db[instance].assets[symbol].address] = symbol;
  });

  const provider = new ethers.providers.JsonRpcProvider(rpc);
  const toBlock = (await provider.getBlock('latest')).number;
  const withdrawEvents = await getWithdrawEvents(proxy, provider, fromBlock, toBlock, eventBlockRange);

  const maybeBorrowers = {};

  withdrawEvents.forEach(({ args }) => {
    const [ from, to, amount ] = args;

    if (+amount.toString() > 0) {
      maybeBorrowers[from] = null;
    }
  });

  const prevBorrowers = Object.keys(db[instance].borrowers);
  const accounts = Object.keys(maybeBorrowers).concat(prevBorrowers);

  const accountDataQueryResult = await getDataForAllAccounts(provider, accounts, proxy);

  const borrowers = {};
  for (let i = 0; i < accounts.length; i++) {
    const accountAddress = accounts[i];
    const accountData = accountDataQueryResult[i];

    const isLiquidatable = accountData[0];
    const borrowBalance = +(accountData[1]).toString() / Math.pow(10, baseAssetDecimals);
    const collateralAssetAddresses = accountData[2];
    const collateralBalances = accountData[3];

    if (borrowBalance > 0) {
      borrowers[accountAddress] = {
        isLiquidatable,
        borrowBalance,
        collaterals: {},
      };
      for (let j = 0; j < collateralAssetAddresses.length; j++) {
        const collateralAssetAddress = collateralAssetAddresses[j];
        const collateralBalance = +(collateralBalances[j]).toString();
        if (collateralBalance > 0) {
          const assetSymbol = getSymbolByAddress[collateralAssetAddress];
          const { price, address, decimals } = db[instance].assets[assetSymbol];
          borrowers[accountAddress].collaterals[assetSymbol] = collateralBalance / Math.pow(10, decimals);
        }
      }
    }
  }

  updateConsoleLogLine('');

  db[instance].block = toBlock;
  db[instance].borrowers = borrowers;
}

function calculateAccountHealths(instance) {
  const borrowers = Object.keys(db[instance].borrowers);

  borrowers.forEach((account, i) => {
    const borrower = db[instance].borrowers[account];

    const collaterals = Object.keys(borrower.collaterals);
    const borrowBalance = borrower.borrowBalance;
    const basePrice = db[instance].assets[Object.keys(db[instance].assets)[0]].price;
    const borrowValue = borrowBalance * basePrice;

    let borrowLimit = 0;
    let liquidationLimit = 0;

    collaterals.forEach((asset, i) => {
      const { price, cf, lcf } = db[instance].assets[asset];
      const amount = borrower.collaterals[asset];

      borrowLimit += amount * cf * price;
      liquidationLimit += amount * lcf * price;
    });

    db[instance].borrowers[account].borrowLimit = borrowLimit / basePrice;
    db[instance].borrowers[account].liquidationLimit = liquidationLimit / basePrice;
    db[instance].borrowers[account].percentToLiquidation = +((borrowValue / liquidationLimit) * 100).toFixed(5);

    if (collaterals.length === 1) {
      const [ asset, collateralAmount ] = Object.entries(borrower.collaterals)[0];
      const collateralPrice = db[instance].assets[asset].price;
      const lcf = db[instance].assets[asset].lcf;
      db[instance].borrowers[account].liquidationPrice = borrowValue / collateralAmount / lcf;
    }
  });
}

// Auto-sync all Comet instance data but only if local data are stale
setInterval(syncDbWithBlockchains, autoSyncInterval);

// Sync chain data to local DB on boot
(async function main() {
  syncDbWithBlockchains();

  const app = express();
  app.use(express.json({ limit: 100 }));
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    next();
  });

  app.use(express.static('./public'));

  app.get('/api/get/borrowers/:cometInstanceId', async function (req, res, next) {
    try {
      const result = JSON.parse(JSON.stringify(db[req.params.cometInstanceId]));

      if (!result) throw Error('Not a valid Comet ID');

      syncDbWithBlockchains(req.params.cometInstanceId);

      // Convert object to array
      const borrowers = [];
      Object.keys(result.borrowers).forEach((account) => {
        result.borrowers[account].account = account;
        borrowers.push(result.borrowers[account]);
      });
      result.borrowers = borrowers;

      // Sort by percent to liquidation, descending
      result.borrowers.sort((a, b) => {
        return a.percentToLiquidation > b.percentToLiquidation ? -1 : 1;
      });

      res.json(result);
    } catch(e) {
      res.sendStatus(400);
    }
  });

  app.use(function(req, res, next) {
    res.sendStatus(400);
  });

  app.listen(port, () => {
    console.log(`App listening at http://localhost:${port}`)
  });

})().catch((e) => {
  console.error('Error occurred during boot function:', e);
});
