import { createHash, randomBytes } from 'node:crypto';

// The cookie is a bearer credential; only its hash is stored in the database.
export function browserIdentity(req, res, next) {
  res.set('Cache-Control', 'private, no-store');
  res.vary('Cookie');
  const secure = Boolean(process.env.VERCEL) || req.secure;
  const cookieName = secure ? '__Host-hobbie_browser' : 'hobbie_browser';
  const cookies = (req.headers.cookie ?? '').split(';').map((value) => value.trim());
  let token = cookies.find((value) => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  const valid = typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);

  if (!['GET', 'HEAD'].includes(req.method)) {
    // Browser requests must come from this site's origin, never a third party.
    const origin = req.get('Origin');
    if (req.get('Sec-Fetch-Site') === 'cross-site'
        || (origin && origin !== `${secure ? 'https' : req.protocol}://${req.get('host')}`)) {
      return res.status(403).json({ error: 'Please use this website to save your records.' });
    }
    if (!valid) {
      return res.status(401).json({ error: 'Please enable cookies and refresh before saving.' });
    }
  }

  if (!valid) token = randomBytes(32).toString('hex');
  // Refresh the one-year expiry on each request. No Domain attribute: host-only cookie.
  res.cookie(cookieName, token, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 365 * 24 * 60 * 60 * 1000 });
  req.browserKey = createHash('sha256').update(token).digest('hex');
  next();
}
