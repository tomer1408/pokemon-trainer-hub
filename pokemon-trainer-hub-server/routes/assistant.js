const express = require('express');
const jwtCheck = require('../middleware/auth');
const teamService = require('../services/teamService');
const assistantService = require('../services/assistantService');

const router = express.Router();

// POST /api/assistant/analyze — real LLM analysis of the current user's
// actual Dream Team (identified from the JWT, never from the request body).
router.post('/analyze', jwtCheck, async (req, res) => {
  const team = await teamService.getTeam(req.auth.payload.sub);

  try {
    const rec = await assistantService.analyzeTeam(team);
    const pokemon = await assistantService.getStrongestOfType(rec.type);
    res.json({ type: rec.type, reasoning: rec.reasoning, pokemon });
  } catch (err) {
    console.error('Assistant analyze failed:', err.message);
    res.status(502).json({ message: 'The AI assistant is unavailable right now. Please try again later.' });
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
    console.error('Assistant query failed:', err.message);
    res.status(502).json({ message: 'The AI assistant is unavailable right now. Please try again later.' });
  }
});

module.exports = router;
