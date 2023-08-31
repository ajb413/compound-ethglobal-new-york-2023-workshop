# Compound III Developer Workshop - ETHGlobal New York 2023 Hackathon

Example app that shows current account health for every account borrowing from Comet.

## Install

Install Node.js at https://nodejs.org/

```
git clone git@github.com:ajb413/compound-ethglobal-new-york-2023-workshop.git
cd compound-ethglobal-new-york-2023-workshop/
npm install
```

## Dependencies

- [Hardhat](https://hardhat.org/) to compile Sleuth query Solidity smart contracts.
- [Ethers.js](https://ethers.org/) to interact with EVM blockchains.
- [Sleuth](https://github.com/compound-finance/sleuth) to query blockchains for data faster and with more efficiency.
- [Express.js](https://expressjs.com/) to serve the web files and host a REST API.

## Run

After running the server (index.js), navigate to http://localhost:3000/ in a web browser. The front-end web files shown are in the `public/` folder.

```bash
## Environment variables referenced in the server script
## Each JSON RPC API provider URL is available for FREE at alchemy.com

MAINNET_PROVIDER_URL="___paste_yours_here____" \
POLYGON_PROVIDER_URL="___paste_yours_here____" \
ARBITRUM_PROVIDER_URL="___paste_yours_here____" \
BASE_PROVIDER_URL="___paste_yours_here____" \
npm start
```
