// Routes for /api/entrants (the players)
//   GET  /api/entrants  → list players belonging to this browser
//   POST /api/entrants  → add a player, or return the existing one   body: { "name": "Alex" }

import { Router } from 'express';
import store from '../db/index.js';
import { cleanName } from '../validation.js';

const router = Router();

router.get('/', async (req, res) => {
  res.json(await store.listEntrants(req.browserKey));
});

router.post('/', async (req, res) => {
  const name = cleanName(req.body?.name, {
    maxLength: 20,
    emptyMessage: 'Please enter a name.',
    tooLongMessage: 'Names can be at most 20 characters.',
  });

  // Names are unique within this browser, ignoring case.
  const { row, created } = await store.findOrCreateEntrant(name, req.browserKey);
  res.status(created ? 201 : 200).json(row); // 201 = newly created, 200 = already known
});

export default router;
