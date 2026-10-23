// Routes for /api/hobbies (also reachable as /api/hobbie, the name in the original spec)
//   GET  /api/hobbies  → list all hobbies
//   POST /api/hobbies  → add a hobby, or return the existing one   body: { "name": "Fishing" }

import { Router } from 'express';
import store from '../db/index.js';
import { cleanName } from '../validation.js';

const router = Router();

router.get('/', async (req, res) => {
  res.json(await store.listHobbies());
});

router.post('/', async (req, res) => {
  const name = cleanName(req.body?.name, {
    maxLength: 40,
    emptyMessage: 'Please enter a hobby.',
    tooLongMessage: 'Hobby names can be at most 40 characters.',
  });

  const { row, created } = await store.findOrCreateHobby(name);
  res.status(created ? 201 : 200).json(row); // 201 = newly created, 200 = already known
});

export default router;
