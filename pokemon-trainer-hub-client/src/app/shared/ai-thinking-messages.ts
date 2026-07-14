// Rotates while waiting for a real Gemini response (which can take anywhere
// from ~2 to ~15 seconds) — shared by the AI Trainer Assistant page and the
// floating chat widget, so a slow reply reads as "still working" instead of
// a frozen bubble with just static dots.
export const AI_THINKING_MESSAGES = [
  'Consulting the Pokédex…',
  'Weighing type matchups…',
  'Thinking it through…',
  'Checking team synergy…',
  'Almost there…',
];
