/**
 * Campus Inn+ — OAuth State Store & Cryptographic Validator
 * Provides:
 * - Cryptographically random per-login state tokens
 * - HMAC-SHA256 signature verification preventing tampering/forgery
 * - Server-side state store with TTL expiration (default 10 minutes)
 * - Strict single-use consumption preventing replay/reuse attacks
 * - Initiator metadata retention (frontendUrl, redirect)
 * - Safe handling of cookie encoding, quotes, and URL encoding
 */
const crypto = require('crypto');
const config = require('../config');

class OAuthStateStore {
  constructor() {
    this.store = new Map();
    this.DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

    // Periodic sweep of expired states every 2 minutes
    this.cleanupTimer = setInterval(() => this.cleanupExpired(), 2 * 60 * 1000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  _getSecret() {
    return (config.jwt && config.jwt.secret) ? config.jwt.secret : 'campus_inn_oauth_secret_fallback';
  }

  _sign(nonce, createdAt, expiresAt) {
    const secret = this._getSecret();
    const data = `${nonce}:${createdAt}:${expiresAt}`;
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  cleanupExpired() {
    const now = Date.now();
    for (const [key, record] of this.store.entries()) {
      if (record.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }

  clear() {
    this.store.clear();
  }

  createState({ frontendUrl = null, redirect = null, ttlMs = this.DEFAULT_TTL_MS } = {}) {
    const nonce = crypto.randomBytes(32).toString('hex');
    const createdAt = Date.now();
    const expiresAt = createdAt + ttlMs;
    const signature = this._sign(nonce, createdAt, expiresAt);
    const stateToken = `${nonce}.${createdAt}.${expiresAt}.${signature}`;

    const record = {
      nonce,
      stateToken,
      createdAt,
      expiresAt,
      frontendUrl: frontendUrl || null,
      redirect: redirect || null,
      used: false,
    };

    // Store by both nonce and full token to allow fast lookup
    this.store.set(nonce, record);
    this.store.set(stateToken, record);

    return record;
  }

  verifyAndConsumeState(incomingState, cookieState = null) {
    if (!incomingState || typeof incomingState !== 'string') {
      return { valid: false, error: 'MISSING_STATE' };
    }

    let cleanState = incomingState.trim();
    try {
      cleanState = decodeURIComponent(cleanState).trim();
    } catch (e) {}

    if (!cleanState) {
      return { valid: false, error: 'MISSING_STATE' };
    }

    let cleanCookie = null;
    if (cookieState && typeof cookieState === 'string') {
      cleanCookie = cookieState.trim();
      try {
        cleanCookie = decodeURIComponent(cleanCookie).trim();
      } catch (e) {}
      if (cleanCookie.startsWith('"') && cleanCookie.endsWith('"')) {
        cleanCookie = cleanCookie.slice(1, -1);
      }
    }

    // Parse composite token (nonce.createdAt.expiresAt.signature)
    const parts = cleanState.split('.');
    let nonce = cleanState;

    if (parts.length === 4) {
      const [tokenNonce, createdAtStr, expiresAtStr, signature] = parts;
      nonce = tokenNonce;

      // Nonce must be 64-char hex
      if (!nonce || nonce.length !== 64 || !/^[0-9a-f]{64}$/i.test(nonce)) {
        return { valid: false, error: 'INVALID_NONCE_FORMAT' };
      }

      // Signature must be exactly 64-char hex
      if (!signature || signature.length !== 64 || !/^[0-9a-f]{64}$/i.test(signature)) {
        return { valid: false, error: 'INVALID_SIGNATURE_FORMAT' };
      }

      const parsedCreated = parseInt(createdAtStr, 10);
      const parsedExpires = parseInt(expiresAtStr, 10);

      if (isNaN(parsedCreated) || isNaN(parsedExpires)) {
        return { valid: false, error: 'INVALID_STATE_FORMAT' };
      }

      // Check expiration from token timestamp
      if (Date.now() > parsedExpires) {
        this.store.delete(nonce);
        this.store.delete(cleanState);
        return { valid: false, error: 'EXPIRED_STATE' };
      }

      // Verify cryptographic signature
      const expectedSig = this._sign(nonce, parsedCreated, parsedExpires);
      try {
        const sigBuf = Buffer.from(signature, 'hex');
        const expBuf = Buffer.from(expectedSig, 'hex');
        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
          return { valid: false, error: 'INVALID_SIGNATURE' };
        }
      } catch (e) {
        return { valid: false, error: 'INVALID_SIGNATURE' };
      }
    } else {
      // If not composite 4-part token, it must be an exact 64-character raw hex nonce
      if (cleanState.length !== 64 || !/^[0-9a-f]{64}$/i.test(cleanState)) {
        return { valid: false, error: 'INVALID_STATE_FORMAT' };
      }
    }

    // Lookup record in server-side store
    const record = this.store.get(nonce) || this.store.get(cleanState);
    if (!record) {
      return { valid: false, error: 'UNKNOWN_OR_REUSED_STATE' };
    }

    // If record has a full stateToken and incomingState had 4 parts, stateToken must match exactly
    if (parts.length === 4 && record.stateToken && record.stateToken !== cleanState) {
      return { valid: false, error: 'STATE_TAMPERED' };
    }

    if (record.used) {
      return { valid: false, error: 'REUSED_STATE' };
    }

    if (record.expiresAt <= Date.now()) {
      this.store.delete(nonce);
      this.store.delete(cleanState);
      return { valid: false, error: 'EXPIRED_STATE' };
    }

    // If cookie was provided, verify it matches the nonce or full token
    if (cleanCookie) {
      if (cleanCookie !== cleanState && cleanCookie !== nonce) {
        return { valid: false, error: 'COOKIE_MISMATCH' };
      }
    }

    // Enforce single-use consumption: mark used and delete from store
    record.used = true;
    this.store.delete(nonce);
    this.store.delete(cleanState);

    return {
      valid: true,
      stateRecord: record,
    };
  }
}

module.exports = new OAuthStateStore();
