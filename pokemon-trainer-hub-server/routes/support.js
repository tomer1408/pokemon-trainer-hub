const express = require('express');
const prisma = require('../services/prisma');
const jwtCheck = require('../middleware/auth');
const { createRateLimiter } = require('../services/rateLimiter');
const { logEventSafe } = require('../services/analyticsEventService');

const router = express.Router();

const RATE_LIMIT_MESSAGE = "You've submitted several requests recently — please wait a bit before sending another.";
// Keyed by the caller's own auth0UserId (always a real, authenticated
// trainer — jwtCheck runs first) rather than a fixed key like the purge
// sweep's: this limits each account's own submission rate, not the route
// as a whole. Support requests are a real, occasional action, not
// something a legitimate trainer sends 5+ times an hour.
const supportRateLimiter = createRateLimiter({ windowSeconds: 60 * 60, maxRequests: 5 });

// POST /api/support  { name, email, topic, message }
// Real, server-side persisted request — no email is sent, but nothing here
// is faked either: the row is genuinely saved and reviewable in the
// database, tied to the JWT-identified user.
router.post('/', jwtCheck, async (req, res) => {
  if (!supportRateLimiter.consume(req.auth.payload.sub)) {
    return res.status(503).json({ message: RATE_LIMIT_MESSAGE });
  }

  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
  const topic = typeof req.body.topic === 'string' ? req.body.topic.trim() : '';
  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';

  if (!/.+@.+\..+/.test(email) || !topic || !message) {
    return res.status(400).json({ message: 'A valid email, topic, and message are all required.' });
  }

  const request = await prisma.supportRequest.create({
    data: { auth0UserId: req.auth.payload.sub, name, email, topic, message },
  });

  logEventSafe({ auth0UserId: req.auth.payload.sub, eventType: 'support_request_created', metadata: { topic } });

  res.status(201).json({ id: request.id, createdAt: request.createdAt });
});

module.exports = router;
