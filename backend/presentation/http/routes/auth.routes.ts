import { Router } from 'express';

const trainRouter = Router();

trainRouter.get('/status', (req, res) => {
  return res.json({ message: 'RailPulse CCO - Linha 6 Laranja Operacional' });
});

export { trainRouter };