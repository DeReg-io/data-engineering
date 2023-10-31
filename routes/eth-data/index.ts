import express from 'express';
import logger from '../../plugins/logger';
import { getAssetTransfersForBlockRange } from '../../plugins/data-indexer';
import { HistoricDataProgress } from '../../plugins/db/last-synced-data';
import { fetchNextHistoricDataBatch } from '../../plugins/pulsar';
const router = express.Router();

router.get('/', async (req, res) => {
  logger.info('GET /eth-data');
  res.send('Hi from eth-data');
});

router.post('/new-block', async (req, res) => {
  try {
    const { blockNum } = req.body;
    if (!blockNum) {
      return res.status(400).send('Missing blockNum');
    }
    const assetTransfers = await getAssetTransfersForBlockRange(
      blockNum,
      blockNum,
    );
    console.log('assetTransfers: ', assetTransfers);
    return res.status(200).send('ok');
  } catch (err) {
    logger.error('Unknown error', { err });
    return res.status(500).send('Unknown error');
  }
});

router.post('/fetch-historic-data', async (req, res) => {
  try {
    const body = req.body as HistoricDataProgress;
    console.log('body: ', body);
    if (!body.startBlock || !body.endBlock || !body.type) {
      return res.status(400).send('Missing startBlock, endBlock, or type');
    }
    body.lastFetchedBlock = body.startBlock;
    await fetchNextHistoricDataBatch(body, true);
    return res.status(200).send('Data fetching initialized');
  } catch (err: any) {
    logger.error('Unknown error', { err });
    return res.status(500).send(err.message);
  }
});

export default router;
