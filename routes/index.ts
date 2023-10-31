import { Express } from 'express';
import ethData from './eth-data';

export default function initRoutes(app: Express) {
  app.use('/eth-data', ethData);
}
