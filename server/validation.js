// Shared input checks for the API routes.
// Throwing an HttpError sends its status and message to the browser
// (see the error handler at the bottom of server.js).

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Tidy a name ("  Alex   Lee " → "Alex Lee"); reject it if empty or too long.
export function cleanName(raw, { maxLength, emptyMessage, tooLongMessage }) {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (!name) throw new HttpError(400, emptyMessage);
  if ([...name].length > maxLength) throw new HttpError(400, tooLongMessage); // counts characters, so emoji count as 1
  return name;
}

// A database id: a whole JSON number ≥ 1 (the string "5" doesn't count).
export function isId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

// An ISO 8601 date-time string such as "2026-10-22T09:30:00.000Z" → Date, or null.
export function parseDateTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
