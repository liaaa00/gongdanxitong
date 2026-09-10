import { createPortalLinkToken } from '../connector/portal-onboarding.mjs';

const secret = process.env.PORTAL_LINK_SECRET || '';
const customerId = process.env.PORTAL_CUSTOMER_ID || '';
const customerName = process.env.PORTAL_CUSTOMER_NAME || '';
const customerCode = process.env.PORTAL_CUSTOMER_CODE || '';
const expiresAt = Number(process.env.PORTAL_LINK_EXPIRES_AT || '');

if (!Number.isInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
  throw new Error('PORTAL_LINK_EXPIRES_AT must be a future Unix timestamp');
}

const token = createPortalLinkToken({
  customerId,
  customerName,
  customerCode,
  exp: expiresAt,
}, secret);

process.stdout.write(token + '\n');
