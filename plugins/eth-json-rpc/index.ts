import axios from 'axios';
import { ethers, WebSocketProvider } from 'ethers';
import web3 from 'web3';
import _ from 'lodash';
import logger from '../logger';
import { submitNewBlock } from '../pulsar';

const RPC_URL = process.env.RPC_URL || 'localhost:8545';
const WS_RPC_URL = process.env.WS_RPC_URL || 'localhost:8545';

const erc20ABI = [
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
];

export enum TraceType {
  CALL = 'CALL',
  CALLCODE = 'CALLCODE',
  CREATE = 'CREATE',
  DELEGATECALL = 'DELEGATECALL',
}

export type Trace = {
  from: string; // '0x3ecef08d0e2dad803847e052249bb4f8bff2d5bb'
  gas: string; // '0x13498'
  gasUsed: string; // '0x5208'
  to: string; // '0x947026cd62919248c52fb78cee1e09535e0d8f0f'
  input: string; // '0x',
  value: string; // '0x18d908cc3448800',
  type: TraceType; // 'CALL'
  uniqueId?: string; // added by us
  calls?: Trace[];
  error?: string;
};

type TraceRaw = {
  result: Trace;
};

type TraceResponse = {
  jsonrpc: string; // 2.0
  id: number;
  result: TraceRaw[];
};

type Transaction = {
  blockHash: string; //  '0xba9c4fef57d00e51c5b00fd90f5036d15863026cf10336376e1e710bf68a89c3'
  blockNumber: string; //  '0xb71e84'
  from: string; //  '0x3ecef08d0e2dad803847e052249bb4f8bff2d5bb'
  gas: string; //  '0x186a0'
  gasPrice: string; //  '0x3b9aca00'
  hash: string; //  '0xcfda334e621abdb65504065bbeac5d5a71277a69255848096454ce9e6846d34b'
  input: string; //  '0x'
  nonce: string; //  '0x2b36b'
  to: string; //  '0x947026cd62919248c52fb78cee1e09535e0d8f0f'
  transactionIndex: string; //  '0x0'
  value: string; //  '0x18d908cc3448800'
  type: string; //  '0x0'
  chainId: string; //  '0x1'
  v: string; //  '0x26'
  r: string; //  '0xb9df0f0b2e874e528f6eacc9f51ea818c36eed71512d492273972faa032ab647'
  s: string; //  '0x702b169291c0eb5ae18ef807849d90091b6e96495b009d6f2f64e5b087af77e9
};

export type Block = {
  difficulty: string; // '0x13e890b8b5c018'
  extraData: string; // '0x73656f35'
  gasLimit: string; //  '0xbe747b'
  gasUsed: string; //  '0xbe690c'
  hash: string; //  '0xba9c4fef57d00e51c5b00fd90f5036d15863026cf10336376e1e710bf68a89c3'
  logsBloom: string; //  '0xfae3407464067231c51aa4a0f20d1fa40950442e055a682011013d97c68ae166e9100769c6022148551977460c7c59195a00ce000922886087599f2a4471096d550b0480028331eb4cc0420e7420cbe41d45300c01c14094979a0bfbdecc13931a55a531a2e150124120d1184410e9d4ca14b023bc7aacdd1627107e1823a8248a65c725a241f02612d0015248519390228cb697e1e2ece82502b1d28a526ad6834662c1611de90a5417e6811b5206c4813061dafc2a9783367181385c0821255d89b16279ce546320624b2c031bb53c0c54d24c119240bf8f0b8462c2dc6008901ba2af3428640c8996070420085589dfa5081960dc887505488b5c17dfb017'
  miner: string; //  '0x3ecef08d0e2dad803847e052249bb4f8bff2d5bb'
  mixHash: string; //  '0x5bf3e1426d2fc42595ec23dd276f1549f51258548ef22cdad8de3b3523eb3c2b'
  nonce: string; //  '0x1984a1b3569caf60'
  number: string; //  '0xb71e84'
  parentHash: string; //  '0xab243f1e60f1b84d5ef01d14165aef145823f84063a722ae1edf968c6d4bfb39'
  receiptsRoot: string; //  '0x34d7a7b6bfb29799b085a46972d53d5b0aca02bf3ec18d5bc9c192f505fbf6c5'
  sha3Uncles: string; //  '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347'
  size: string; //  '0xcf9b'
  stateRoot: string; //  '0x4b52d5568216045cf7a75a0e380116ad27bb0214224cfa9a773d362cf2d52e75'
  timestamp: string; //  '0x6046b648'
  totalDifficulty: string; //  '0x49fdaf17142e8b25e4f'
  transactions: Transaction[];
  transactionsRoot: string; // '0xe03f664f654c3eb81a94953b217117a40861a4d6b5e14c3a95cdf1b2ec1f0a13',
  uncles: [];
};

type BlockResponse = {
  jsonrpc: string;
  id: number;
  result: Block;
};

type Log = {
  address: string; //  '0xcf9fc3bd175bbed18013c7b4a94303c6a98b5fa1'
  topics: string[];
  data: string; //  '0x0000000000000000000000003ecef08d0e2dad803847e052249bb4f8bff2d5bb00000000000000000000000000000000000000000000000002d8058492ad240000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000'
  blockNumber: string; //  '0xb71e84'
  transactionHash: string; //  '0xa06dcb2be9fd2380d0868eccbdf3d40c3b7b08e8aca816aca921492d4d8f9beb'
  transactionIndex: string; //  '0x4'
  blockHash: string; //  '0xba9c4fef57d00e51c5b00fd90f5036d15863026cf10336376e1e710bf68a89c3'
  logIndex: string; //  '0x0'
  removed: boolean;
};

type LogResponse = {
  jsonrpc: string;
  id: number;
  result: Log[];
};

const web3Caller = new web3(
  'https://eth-mainnet.g.alchemy.com/v2/TrStofrou8HCA237z8lsVnPzPSX99pAf',
  // RPC_URL ,
);

// TODO: cache with redis
const tokenCache: { [address: string]: number } = {};
export async function getDecimals(tokenAddress: string): Promise<number> {
  return 18;
  let decimals = tokenCache[tokenAddress];
  if (decimals !== undefined) {
    console.log('cahced: ');
    return decimals;
  }
  try {
    const tokenContract = new web3Caller.eth.Contract(erc20ABI, tokenAddress);
    decimals = await tokenContract.methods.decimals().call();
  } catch (err) {
    console.error('getDecimals err, trying again in 1 sec', err);
    await new Promise((r) => setTimeout(r, 5000));
    return getDecimals(tokenAddress);
  }
  tokenCache[tokenAddress] = decimals;
  return decimals;
}

function blockNumToHex(blockNum: number) {
  return typeof blockNum === 'number'
    ? ethers.toBeHex(blockNum).replace(/^0x0*/, '0x')
    : blockNum;
}

function bigintHexToNumber(hex: string, decimals = 18) {
  const bigIntValue = BigInt(web3.utils.hexToNumberString(hex));
  const scaleFactor = BigInt(10 ** decimals);

  const intPart = bigIntValue / scaleFactor;
  const fractionalPart = bigIntValue % scaleFactor;
  const fractionalAsString = fractionalPart.toString().padStart(decimals, '0');

  return Number(`${intPart}.${fractionalAsString}`);
}

export async function debug_traceBlockByNumber(
  blockNumber: number,
): Promise<Trace[]> {
  try {
    const response = await axios.post(RPC_URL, {
      jsonrpc: '2.0',
      id: 1,
      method: 'debug_traceBlockByNumber',
      params: [
        blockNumToHex(blockNumber),
        { tracer: 'callTracer', tracerConfig: { onlyTopCall: false } },
      ],
    });
    if (response.data.result) {
      const traces = (response.data as TraceResponse).result.map(
        (t) => t.result,
      );
      return traces;
    }
    return [];
  } catch (err) {
    console.error('Error calling ETH NODE debug_traceBlockByNumber', err);
    throw err;
  }
}

export async function eth_getBlockByNumber(
  blockNumber: number,
  fullTransactions = true,
): Promise<Block> {
  try {
    const blockResponse = await axios.post(RPC_URL, {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getBlockByNumber',
      params: [blockNumToHex(blockNumber), fullTransactions], // true -> full transactions, false -> only hashes
    });
    const block = (blockResponse.data as BlockResponse).result;
    return block;
  } catch (err) {
    console.error('Error calling ETH NODE eth_getBlockByNumber', err);
    throw err;
  }
}

export async function eth_getLogs(blockNum: number): Promise<Log[]> {
  try {
    const blockNumHex = blockNumToHex(blockNum);
    const response = await axios.post(RPC_URL, {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getLogs',
      params: [
        {
          fromBlock: blockNumHex,
          toBlock: blockNumHex,
        },
      ],
    });
    return (response.data as LogResponse).result;
  } catch (err) {
    console.error('Error calling ETH NODE eth_getLogs', err);
    throw err;
  }
}

let submitted = false;
export async function subscribeToNewBlockHeaders() {
  logger.info('Subscribing to new block headers');
  const provider = new WebSocketProvider(WS_RPC_URL);
  provider.on('block', async (blockNum) => {
    if (submitted) return;
    try {
      await submitNewBlock(blockNum);
      submitted = true;
    } catch (err) {
      logger.error('Could not submit new block', { err });
    }
  });
  console.log('Subscribed to new block headers');
}
