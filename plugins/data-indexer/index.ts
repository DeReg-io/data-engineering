import web3 from 'web3';
import _ from 'lodash';
import {
  Block,
  Trace,
  TraceType,
  debug_traceBlockByNumber,
  eth_getBlockByNumber,
  eth_getLogs,
  getDecimals,
} from '../eth-json-rpc';

const ERC20_TRANSFER_SIGNATURE =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

enum AssetTransferCategory {
  External = 'external',
  Internal = 'internal',
  Token = 'token',
}

export type AssetTransfer = {
  tokenAddress?: string; // In case of ERC20 transfers
  from: string;
  to: string;
  value: number;
  hash: string;
  blockNum: number;
  uniqueId: string;
  gas: number;
  gasPrice: number;
  gasUsed?: number;
  category: AssetTransferCategory;
  timestamp: number;
};

function bigintHexToNumber(hex: string, decimals = 18) {
  const bigIntValue = BigInt(web3.utils.hexToNumberString(hex));
  const scaleFactor = BigInt(10 ** decimals);

  const intPart = bigIntValue / scaleFactor;
  const fractionalPart = bigIntValue % scaleFactor;
  const fractionalAsString = fractionalPart.toString().padStart(decimals, '0');

  return Number(`${intPart}.${fractionalAsString}`);
}

function processTraces(trace: Trace, txHash: string, path: string[] = []) {
  // Generate the unique ID for the current trace
  trace.uniqueId = `${txHash}:internal:${path.join('-') || '0'}`;

  // If there are internal calls, process them recursively
  if (trace.calls && trace.calls.length > 0) {
    trace.calls.forEach((internalTrace, index) => {
      // Add the current internal call's index to the path
      path.push(index.toString());
      processTraces(internalTrace, txHash, path);
      // Remove the current index from the path (backtrack)
      path.pop();
    });
  }
}

async function getEthTransfers(
  blockNumber: number,
  block: Block,
): Promise<AssetTransfer[]> {
  console.log('getting eth transfers: =====================');
  const traces = await debug_traceBlockByNumber(blockNumber);
  const timestamp = bigintHexToNumber(block.timestamp, 0) * 1000;

  if (traces.length) {
    const ethTransfers: AssetTransfer[] = [];

    for (let i = 0; i < traces.length; i++) {
      processTraces(traces[i], block.transactions[i].hash);
      const trace = traces[i];
      if (trace.type === TraceType.DELEGATECALL) {
        console.log('delegate call: ', JSON.stringify(trace, null, 2));
      }
      if (
        // TODO: errors, calls can be reverted -> if top level is reverted, all sub calls are reverted
        // -> top level still goes through
        // TODO: DELEGATE CALL -> will create subtrace, from to might be messed up -> see image
        // TODO: CALLCODE -> check it out, is like DELEGATECALL -> low prio
        // TODO: SELFDESTRUCT -> check it out -> low prio
        [TraceType.CALL, TraceType.CREATE, TraceType.DELEGATECALL].includes(
          trace.type,
        ) &&
        trace.value !== '0x0'
      ) {
        ethTransfers.push({
          from: trace.from,
          to: trace.to,
          value: bigintHexToNumber(trace.value),
          hash: block.transactions[i].hash,
          blockNum: blockNumber,
          uniqueId: `${block.transactions[i].hash}:external`,
          gas: bigintHexToNumber(trace.gas, 0),
          gasPrice: bigintHexToNumber(block.transactions[i].gasPrice, 9),
          gasUsed: bigintHexToNumber(trace.gasUsed, 0),
          category: AssetTransferCategory.External, // external
          timestamp,
        });
      }

      const flattendedTraceCalls: Trace[] = [];
      const flattenTraceCalls = (calls: Trace[]) => {
        flattendedTraceCalls.push(...calls);
        calls.forEach((call) => {
          if (call.calls && call.calls.length) {
            flattenTraceCalls(call.calls);
          }
        });
      };
      if (trace.calls && trace.calls.length) {
        flattenTraceCalls(trace.calls);

        const traceCalls = flattendedTraceCalls.filter(
          (c) =>
            [TraceType.CALL, TraceType.CREATE, TraceType.DELEGATECALL].includes(
              trace.type,
            ) && c.value !== '0x0',
        );

        for (const call of traceCalls) {
          ethTransfers.push({
            from: call.from,
            to: call.to,
            value: bigintHexToNumber(call.value),
            hash: block.transactions[i].hash,
            blockNum: blockNumber,
            uniqueId: call.uniqueId!, // calculated by processTrace
            gas: bigintHexToNumber(call.gas, 0),
            gasPrice: bigintHexToNumber(block.transactions[i].gasPrice, 9),
            gasUsed: bigintHexToNumber(call.gasUsed, 0),
            category: AssetTransferCategory.Internal, // internal
            timestamp,
          });
        }
      }
    }

    return ethTransfers;
  } else {
    throw new Error('Error fetching block traces');
  }
}

// TODO: could be batched for better performance, so multiple blocks at the same time
async function getERC20Transfers(
  blockNumber: number,
  block: Block,
): Promise<AssetTransfer[]> {
  const logs = await eth_getLogs(blockNumber);
  const result: AssetTransfer[] = [];
  const timestamp = bigintHexToNumber(block.timestamp, 0) * 1000;
  if (logs.length) {
    // console.log('erc20: ', response.data.result[0]);
    for (const log of logs) {
      // TODO: can ignore gas and transaction
      const transaction = _.find(block.transactions, {
        hash: log.transactionHash,
      });
      if (!transaction) continue;
      // add filter on JSON_RPC level for ERC20_TRANSFER_SIGNATURE
      if (log.topics[0] === ERC20_TRANSFER_SIGNATURE && log.data !== '0x') {
        const decimals = await getDecimals(log.address);

        result.push({
          tokenAddress: log.address,
          from: log.topics[1], // TODO: full 32 bytes, slice to actual address
          to: log.topics[2], // TODO: full 32 bytes, slice to actual address
          value: bigintHexToNumber(log.data, decimals),
          hash: log.transactionHash,
          blockNum: blockNumber,
          uniqueId: `${log.transactionHash}:log:${web3.utils.hexToNumberString(
            log.logIndex,
          )}`,
          category: AssetTransferCategory.Token,
          gas: bigintHexToNumber(transaction.gas, 0),
          gasPrice: bigintHexToNumber(transaction.gasPrice, 9),
          timestamp,
        });
      }
    }
  } else {
    throw new Error('Error fetching block logs');
  }

  return result;
}

async function getAssetTransfersForBlock(
  blockNum: number,
): Promise<AssetTransfer[]> {
  const block = await eth_getBlockByNumber(blockNum);
  return (
    await Promise.all([
      getEthTransfers(blockNum, block),
      getERC20Transfers(blockNum, block),
    ])
  ).flat();
}

export async function getAssetTransfersForBlockRange(
  fromBlock: number,
  toBlock: number,
): Promise<AssetTransfer[]> {
  console.time('getAssetTransfersForBlockRange');
  const promises: Promise<AssetTransfer[]>[] = [];
  for (let i = fromBlock; i <= toBlock; i++) {
    promises.push(getAssetTransfersForBlock(i));
  }

  const result = (await Promise.all(promises)).flat();
  console.timeEnd('getAssetTransfersForBlockRange');
  return result;
}
