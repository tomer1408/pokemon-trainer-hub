const express = require('express');
const jwtCheck = require('../middleware/auth');
const teamService = require('../services/teamService');
const assistantService = require('../services/assistantService');
const { createRateLimiter } = require('../services/rateLimiter');
const { logEventSafe } = require('../services/analyticsEventService');

const router = express.Router();

const RATE_LIMIT_MESSAGE = "We've hit today's AI usage limit — please try again tomorrow.";

// Team-name generation is cheap to abuse (no per-request cost signal to the
// user like the other assistant features), so it gets its own explicit cap
// on top of Gemini's own quota — 5 generations per trainer per hour.
const teamNameRateLimiter = createRateLimiter({ windowSeconds: 60 * 60, maxRequests: 5 });

// Shared by all four routes below — 503 (not 502) for a rate limit, since
// this is "come back later," not "the upstream service is broken." Also
// the one place ai_request_failed is logged — feature identifies which of
// analyze/query/chat/team-name, reason is a category (never the raw Gemini
// error message, which could echo back user-supplied text).
function respondToAssistantError(err, res, label, auth0UserId, feature) {
  console.error(`${label} failed:`, err.message);
  const rateLimited = assistantService.isRateLimitError(err);
  logEventSafe({
    auth0UserId,
    eventType: 'ai_request_failed',
    metadata: { feature, reason: rateLimited ? 'rate_limited' : 'upstream_error' },
  });
  if (rateLimited) {
    return res.status(503).json({ message: RATE_LIMIT_MESSAGE });
  }
  res.status(502).json({ message: 'The AI assistant is unavailable right now. Please try again later.' });
}

// POST /api/assistant/analyze — real LLM analysis of the current user's
// actual Dream Team (identified from the JWT, never from the request body).
router.post('/analyze', jwtCheck, async (req, res) => {
  const team = await teamService.getTeam(req.auth.payload.sub);

  try {
    const rec = await assistantService.analyzeTeam(team);
    const pokemon = await assistantService.getStrongestOfType(rec.type);
    logEventSafe({ auth0UserId: req.auth.payload.sub, eventType: 'ai_request_completed', metadata: { feature: 'analyze' } });
    res.json({ type: rec.type, reasoning: rec.reasoning, pokemon });
  } catch (err) {
    respondToAssistantError(err, res, 'Assistant analyze', req.auth.payload.sub, 'analyze');
  }
});

// POST /api/assistant/query  { text }
router.post('/query', jwtCheck, async (req, res) => {
  const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
  if (!text) {
    return res.status(400).json({ message: "Please describe what you're looking for." });
  }

  try {
    const rec = await assistantService.queryDescription(text);
    const pokemon = await assistantService.getStrongestOfType(rec.type);
    logEventSafe({ auth0UserId: req.auth.payload.sub, eventType: 'ai_request_completed', metadata: { feature: 'query' } });
    res.json({ type: rec.type, reasoning: rec.reasoning, pokemon });
  } catch (err) {
    respondToAssistantError(err, res, 'Assistant query', req.auth.payload.sub, 'query');
  }
});

// POST /api/assistant/chat  { messages: [{ role: 'user'|'assistant', text }, ...] }
// Backs the global floating chat widget — open-ended, multi-turn Q&A about
// the app, distinct from the structured type-recommendation endpoints above.
router.post('/chat', jwtCheck, async (req, res) => {
  const history = Array.isArray(req.body.messages) ? req.body.messages : [];
  const valid = history.every(
    (m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string',
  );
  if (!valid || history.length === 0) {
    return res.status(400).json({ message: 'messages must be a non-empty array of { role, text }.' });
  }

  try {
    const reply = await assistantService.chatWithAssistant(history);
    logEventSafe({ auth0UserId: req.auth.payload.sub, eventType: 'ai_request_completed', metadata: { feature: 'chat' } });
    res.json(reply);
  } catch (err) {
    respondToAssistantError(err, res, 'Assistant chat', req.auth.payload.sub, 'chat');
  }
});

// POST /api/assistant/team-name  { style }
// Generates 3 team-name suggestions for the current user's REAL Dream Team
// (fetched here from the DB, never trusted from the client). Unlike
// /analyze, /query, /chat, this endpoint always resolves with usable
// suggestions — assistantService.generateTeamNames() itself falls back to
// a deterministic, non-AI generator on any Gemini failure (error, timeout,
// quota) — so a 502/503 here means something unrelated to Gemini broke.
router.post('/team-name', jwtCheck, async (req, res) => {
  const auth0UserId = req.auth.payload.sub;

  const style = req.body.style;
  if (!assistantService.VALID_STYLES.includes(style)) {
    return res
      .status(400)
      .json({ message: `style must be one of: ${assistantService.VALID_STYLES.join(', ')}.` });
  }

  if (!teamNameRateLimiter.consume(auth0UserId)) {
    return res
      .status(429)
      .json({ message: "You've reached the team-name generation limit for now. Please try again later." });
  }

  const team = await teamService.getTeam(auth0UserId);
  if (team.length === 0) {
    return res.status(400).json({ message: 'Add at least one Pokémon before generating a team name.' });
  }

  try {
    const result = await assistantService.generateTeamNames(team, style);
    logEventSafe({ auth0UserId, eventType: 'ai_request_completed', metadata: { feature: 'team-name' } });
    res.json(result);
  } catch (err) {
    respondToAssistantError(err, res, 'Team name generation', auth0UserId, 'team-name');
  }
});

module.exports = router;
