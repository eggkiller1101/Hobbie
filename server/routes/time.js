// Routes for /api/time
//   GET  /api/time  → total time per player per hobby (the Hobby Log)
//   POST /api/time  → save a finished session
//     body: { "entrant_id": 1, "hobby_id": 2,
//             "started_at": "2026-10-22T09:00:00.000Z", "ended_at": "2026-10-22T09:45:00.000Z",
//             "duration_seconds": 2400 }

import { Router } from 'express';
import store from '../db/index.js';
import { HttpError, isId, parseDateTime } from '../validation.js';

const router = Router();

// The browser's clock and the server's clock can differ a little.
const CLOCK_TOLERANCE_MS = 5 * 60 * 1000;

router.get('/', async (req, res) => {
  res.json(await store.hobbyTotals());
});

router.post('/', async (req, res) => {
  const { entrant_id, hobby_id, started_at, ended_at, duration_seconds } = req.body ?? {};

  if (!isId(entrant_id) || !isId(hobby_id)) {
    throw new HttpError(400, 'entrant_id and hobby_id must be whole numbers (ids from /api/entrants and /api/hobbies).');
  }

  const start = parseDateTime(started_at);
  const end = parseDateTime(ended_at);
  if (!start || !end) {
    throw new HttpError(400, 'started_at and ended_at must be ISO date-times, e.g. "2026-10-22T09:30:00.000Z".');
  }
  if (end < start) {
    throw new HttpError(400, 'ended_at must not be before started_at.');
  }
  if (end.getTime() > Date.now() + CLOCK_TOLERANCE_MS) {
    throw new HttpError(400, 'ended_at is in the future.');
  }

  // Active time (pauses excluded) can't be longer than the time between start and end.
  const wallClockSeconds = (end - start) / 1000;
  if (!Number.isSafeInteger(duration_seconds) || duration_seconds < 1 || duration_seconds > wallClockSeconds + 1) {
    throw new HttpError(400,
      'duration_seconds must be a whole number of seconds: at least 1, and no more than the time between start and end.');
  }

  const entry = await store.createTimeEntry({
    entrantId: entrant_id,
    hobbyId: hobby_id,
    startedAt: start.toISOString(),
    endedAt: end.toISOString(),
    durationSeconds: duration_seconds,
  });
  res.status(201).json(entry);
});

export default router;
