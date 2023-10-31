import 'dotenv/config';
import express from 'express';
import routes from './routes';
import logger from './plugins/logger';
import { initPulsarSubscriptions } from './plugins/pulsar';
import { subscribeToNewBlockHeaders } from './plugins/eth-json-rpc';

const PORT = 7020;

const app = express();

// express settings
app.use(express.json({ limit: '50mb' }));

routes(app);

app.listen(PORT, async () => {
  logger.info('Initialized data-engineering', { PORT });
});

initPulsarSubscriptions();

// subscribeToNewBlockHeaders();
