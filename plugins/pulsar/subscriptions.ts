import {
  NEW_BLOCK_TOPIC,
  FETCH_HISTORIC_DATA_TOPIC,
  pulsar,
  fetchNextHistoricDataBatch,
} from '.';
import logger from '../logger';
import { getAssetTransfersForBlockRange } from '../data-indexer';
import {
  HistoricDataProgress,
  setFetchHistoricDataProgress,
  setLastAddedBlock,
} from '../db/last-synced-data';
import { addAssetTransfers } from '../db/asset-transfers';

const ASSET_TRANSFER_BLOCK_RANGE = 2;

export const subscriptions = {
  async getAssetTransfersForNewBlock() {
    try {
      await pulsar.subscribe({
        topic: NEW_BLOCK_TOPIC,
        subscription: 'getAssetTransfers',
        subscriptionType: 'Shared',
        ackTimeoutMs: 12_000,
        listener: async (msg, msgConsumer) => {
          try {
            const msgContent = msg.getData().toString();

            // TODO: remove this to actually fetch data ========
            console.log(
              'received msgContent in getAssetTransfers=================: ',
              msgContent,
            );
            await new Promise((r) => setTimeout(r, 10_000));
            await msgConsumer.acknowledge(msg);
            console.log('ready to receive new');
            return;
            //========

            const blockNum = parseInt(msgContent);
            logger.info('Received newBlock for getAssetTransfers', {
              blockNum,
            });
            const assetTransfers = await getAssetTransfersForBlockRange(
              blockNum,
              blockNum,
            );
            console.log('assetTransfers: ', assetTransfers[0]);
            console.log('assetTransfers count: ', assetTransfers.length);

            await addAssetTransfers(assetTransfers);
            await msgConsumer.acknowledge(msg);
          } catch (err) {
            logger.error('Failed to process message for new block', { err });
            await msgConsumer.acknowledge(msg);
          }
        },
      });
    } catch (err) {
      logger.error('Failed to initialize pulsar subscriptions', { err });
    }
  },

  async setLastAddedBlockInRedis() {
    try {
      await pulsar.subscribe({
        topic: NEW_BLOCK_TOPIC,
        subscription: 'setLastAddedBlockInRedis',
        subscriptionType: 'Shared',
        ackTimeoutMs: 12_000,
        listener: async (msg, msgConsumer) => {
          try {
            const msgContent = msg.getData().toString();
            const blockNum = parseInt(msgContent);
            logger.info('Setting last added block in redis', {
              blockNum,
            });

            await setLastAddedBlock(blockNum);
            await msgConsumer.acknowledge(msg);
          } catch (err) {
            logger.error('Failed to process message for new block', { err });
            await msgConsumer.acknowledge(msg);
          }
        },
      });
    } catch (err) {
      logger.error('Failed to initialize pulsar subscriptions', { err });
    }
  },

  async fetchHistoricData() {
    try {
      await pulsar.subscribe({
        topic: FETCH_HISTORIC_DATA_TOPIC,
        subscription: 'fetchHistoricData',
        subscriptionType: 'Shared',
        ackTimeoutMs: 30_000,
        listener: async (msg, msgConsumer) => {
          try {
            const msgContent = msg.getData().toString();
            const fetchHistoricDataProgress = JSON.parse(
              msgContent,
            ) as HistoricDataProgress;

            logger.info('Fetching historic data', {
              fetchHistoricDataProgress,
            });

            const { lastFetchedBlock, endBlock } = fetchHistoricDataProgress;

            const toBlock = Math.min(
              lastFetchedBlock + ASSET_TRANSFER_BLOCK_RANGE,
              endBlock,
            );

            console.log('toBlock: ', toBlock);

            const assetTransfers = await getAssetTransfersForBlockRange(
              lastFetchedBlock + 1,
              toBlock,
            );

            await addAssetTransfers(assetTransfers);

            fetchHistoricDataProgress.lastFetchedBlock +=
              ASSET_TRANSFER_BLOCK_RANGE;
            console.log('setting data in redis: ', fetchHistoricDataProgress);
            await setFetchHistoricDataProgress(fetchHistoricDataProgress);

            if (toBlock !== endBlock) {
              await fetchNextHistoricDataBatch(fetchHistoricDataProgress);
            }

            await msgConsumer.acknowledge(msg);
          } catch (err) {
            logger.error('Failed to process message for new block', { err });
            await msgConsumer.acknowledge(msg);
          }
        },
      });
    } catch (err) {
      logger.error('Failed to initialize pulsar subscriptions', { err });
    }
  },
};
