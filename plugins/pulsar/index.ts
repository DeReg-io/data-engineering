import Pulsar from 'pulsar-client';
import logger from '../logger';
import {
  HistoricDataProgress,
  getFetchHistoricDataProgress,
  getLastSyncedBlock,
  setFetchHistoricDataProgress,
} from '../db/last-synced-data';
import { subscriptions } from './subscriptions';

export const NEW_BLOCK_TOPIC = 'new-blocks';
export const FETCH_HISTORIC_DATA_TOPIC = 'fetch-historic-data';

const PULSAR_URL = process.env.PULSAR_URL || 'pulsar://localhost:6650';

export const pulsar = new Pulsar.Client({
  serviceUrl: PULSAR_URL,
});

export async function submitNewBlock(blockNum: number) {
  logger.info('Submitting new block', { blockNum });
  const lastSyncedBlock = await getLastSyncedBlock();
  const producer = await pulsar.createProducer({
    topic: NEW_BLOCK_TOPIC,
    producerName: 'data-engineering-ws',
  });
  for (let i = lastSyncedBlock + 1; i <= blockNum; i++) {
    await producer.send({
      data: Buffer.from(i.toString()),
      sequenceId: i,
    });
  }
  await producer.close();
}

export async function initPulsarSubscriptions() {
  Object.values(subscriptions).forEach((subscription) => {
    subscription();
  });
}

export async function fetchNextHistoricDataBatch(
  data: HistoricDataProgress,
  init = false,
) {
  const progress = await getFetchHistoricDataProgress(data.type);
  if (progress && init) {
    throw new Error(`Already fetching historic data for ${data.type}`);
  }

  const producer = await pulsar.createProducer({
    topic: FETCH_HISTORIC_DATA_TOPIC,
    producerName: 'data-engineering',
  });

  await setFetchHistoricDataProgress(data);
  await producer.send({
    data: Buffer.from(JSON.stringify(data)),
  });

  logger.info('setFetchHistoricDataFetching done', { data });

  await producer.close();
}

// submitNewBlock(20_000_025);
