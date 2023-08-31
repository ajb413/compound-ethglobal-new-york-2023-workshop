// SPDX-License-Identifier: MIT
pragma solidity 0.8.15;

library CometStructs {
  struct AssetInfo {
    uint8 offset;
    address asset;
    address priceFeed;
    uint64 scale;
    uint64 borrowCollateralFactor;
    uint64 liquidateCollateralFactor;
    uint64 liquidationFactor;
    uint128 supplyCap;
  }
}

interface Comet {
  function borrowBalanceOf(address account) external view returns (uint256);
  function collateralBalanceOf(address account, address asset) external view returns (uint128);
  function numAssets() external view returns (uint8);
  function getAssetInfo(uint8 i) external view returns (CometStructs.AssetInfo memory);
  function isLiquidatable(address account) external view returns (bool);
}

struct accountData {
  bool isLiquidatable;
  uint borrowBalance;
  address[] assets;
  uint[] collateralBalances;
}

contract AccountDataQuery {
  function query(Comet comet, address[] calldata accounts) public view returns (uint256, accountData[] memory) {
    uint8 numAssets = comet.numAssets();
    accountData[] memory accountDataArray = new accountData[](accounts.length);

    for (uint i = 0; i < accounts.length; i++) {
      bool isLiquidatable = comet.isLiquidatable(accounts[i]);
      uint borrowBalance = comet.borrowBalanceOf(accounts[i]);
      address[] memory assets = new address[](numAssets);
      uint[] memory collateralBalances = new uint[](numAssets);

      for (uint8 j = 0; j < numAssets; j++) {
        CometStructs.AssetInfo memory assetInfo = comet.getAssetInfo(j);
        assets[j] = assetInfo.asset;
        collateralBalances[j] = comet.collateralBalanceOf(accounts[i], assetInfo.asset);
      }

      accountDataArray[i] = accountData(isLiquidatable, borrowBalance, assets, collateralBalances);
    }

    return (block.number, accountDataArray);
  }
}
