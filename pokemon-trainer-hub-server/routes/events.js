const express = require('express');
const jwtCheck = require('../middleware/auth');
const { createRateLimiter } = require('../services/rateLimiter');
const { logEvent, assertValidClientEvent } = require('../services/analyticsEventService');
const ServiceError = require('../services/serviceError');

const router = express.Router();

const RATE_LIMIT_MESSAGE = "You've sent several activity signals in a short time — please slow down.";
// Page views/session starts happen far more often than a support request —
// keyed per trainer (auth0UserId), same reasoning as routes/support.js's
// limiter, just a higher ceiling for normal browsing.
const eventsRateLimiter = createRateLimiter({ windowSeconds: 60, maxRequests: 30 });

// POST /api/events  { eventType, pageName?, metadata? }
// The one client-facing analytics endpoint (Phase 8) — session/navigation
// signals only. eventType/pageName/metadata are all validated against
// analyticsEventService's strict, server-side rules before anything is
// written; the acting trainer is always the verified JWT subject, never
// anything the client sends. Every server-owned event (battle_completed,
// ai_request_completed, etc.) is logged elsewhere, directly by the trusted
// server code whose real action it describes — never reachable here.
router.post('/', jwtCheck, async (req, res) => {
  if (!eventsRateLimiter.consume(req.auth.payload.sub)) {
    return res.status(503).json({ message: RATE_LIMIT_MESSAGE });
  }

  const eventType = req.body.eventType;
  const pageName = typeof req.body.pageName === 'string' ? req.body.pageName : null;
  const metadata = req.body.metadata ?? null;

  try {
    assertValidClientEvent(eventType, pageName, metadata);
    const event = await logEvent({ auth0UserId: req.auth.payload.sub, eventType, pageName, metadata });
    res.status(201).json({ id: event.id });
  } catch (err) {
    if (err instanceof ServiceError) {
      return res.status(400).json({ message: err.message });
    }
    throw err;
  }
});

module.exports = router;
