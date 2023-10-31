import { getDb } from '.';

enum DataType {
  AssetTransfer = 'AssetTransfer',
}

export type HistoricDataProgress = {
  startBlock: number;
  endBlock: number;
  lastFetchedBlock: number;
  // can only have one type in db at a time
  type: DataType;
};

export async function getLastSyncedBlock(): Promise<number> {
  const db = await getDb();
  const lastSyncedBlock = await db.get('last-synced-block');
  if (!lastSyncedBlock) {
    throw new Error('No lastSyncedBlock set in redis');
  }
  return parseInt(lastSyncedBlock);
}

export async function setLastAddedBlock(blockNum: number) {
  const db = await getDb();
  await db.set('last-synced-block', blockNum);
}

export async function getFetchHistoricDataProgress(dataType: DataType) {
  const db = await getDb();
  const result = await db.json.get(`historicDataProgress:${dataType}`);
  return result;
}

export async function setFetchHistoricDataProgress(data: HistoricDataProgress) {
  const db = await getDb();
  await db.json.set(`historicDataProgress:${data.type}`, '$', data);
}
