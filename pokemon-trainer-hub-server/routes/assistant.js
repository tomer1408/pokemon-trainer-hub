const express = require('express');
const jwtCheck = require('../middleware/auth');
const teamService = require('../services/teamService');
const assistantService = require('../services/assistantService');

const router = express.Router();

const RATE_LIMIT_MESSAGE = "We've hit today's AI usage limit — please try again tomorrow.";

// Shared by all three routes below — 503 (not 502) for a rate limit, since
// this is "come back later," not "the upstream service is broken."
function respondToAssistantError(err, res, label) {
  console.error(`${label} failed:`, err.message);
  if (assistantService.isRateLimitError(err)) {
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
    res.json({ type: rec.type, reasoning: rec.reasoning, pokemon });
  } catch (err) {
    respondToAssistantError(err, res, 'Assistant analyze');
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
    res.json({ type: rec.type, reasoning: rec.reasoning, pokemon });
  } catch (err) {
    respondToAssistantError(err, res, 'Assistant query');
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
    res.json(reply);
  } catch (err) {
    respondToAssistantError(err, res, 'Assistant chat');
  }
});

module.exports = router;
