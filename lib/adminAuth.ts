import crypto from "crypto";

export const ADMIN_COOKIE_NAME = "readingQuestAdminSession";

const SESSION_VERSION = "rq-admin-v1";

function getAdminAccessCode() {
  return process.env.ADMIN_ACCESS_CODE?.trim() || "";
}

function getSigningSecret() {
  return process.env.ADMIN_SESSION_SECRET?.trim() || getAdminAccessCode();
}

export function isAdminConfigured() {
  return Boolean(getAdminAccessCode());
}

export function verifyAdminCode(code: string) {
  const expected = getAdminAccessCode();
  if (!expected) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(crypto.createHash("sha256").update(code.trim()).digest("hex")),
    Buffer.from(crypto.createHash("sha256").update(expected).digest("hex")),
  );
}

export function createAdminSessionToken() {
  const issuedAt = Date.now().toString();
  const payload = `${SESSION_VERSION}.${issuedAt}`;
  const signature = crypto
    .createHmac("sha256", getSigningSecret())
    .update(payload)
    .digest("hex");

  return `${payload}.${signature}`;
}

export function verifyAdminSessionToken(token?: string) {
  const secret = getSigningSecret();
  if (!token || !secret) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }

  const [version, issuedAt, signature] = parts;
  const payload = `${version}.${issuedAt}`;
  if (payload !== `${SESSION_VERSION}.${issuedAt}`) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  try {
    const validSignature = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    const ageMs = Date.now() - Number(issuedAt);
    return validSignature && Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 12 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}
