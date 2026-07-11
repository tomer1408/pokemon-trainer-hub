const express = require('express');
const prisma = require('../services/prisma');
const jwtCheck = require('../middleware/auth');

const router = express.Router();

// POST /api/support  { name, email, topic, message }
// Real, server-side persisted request — no email is sent, but nothing here
// is faked either: the row is genuinely saved and reviewable in the
// database, tied to the JWT-identified user.
router.post('/', jwtCheck, async (req, res) => {
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

  res.status(201).json({ id: request.id, createdAt: request.createdAt });
});

module.exports = router;
