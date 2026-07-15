const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { SystemMessage, HumanMessage, AIMessage } = require('@langchain/core/messages');
const { z } = require('zod');
const { fetchPokemonDetail, getStrongestOfType: getStrongestOfTypeRanked } = require('./pokeapi');
const { VALID_STYLES, MAX_NAME_LENGTH, buildFallbackNames, sanitizeNames } = require('./teamNameFallback');

// Only the most recent messages are sent — keeps token usage (and cost/
// quota, even on the free tier) bounded regardless of how long a
// conversation runs.
const MAX_CHAT_HISTORY = 10;

const CHAT_SYSTEM_PROMPT =
  'You are the Trainer Assistant, a friendly in-app help bot for Pokémon Trainer Hub — a web app ' +
  'where users build a Dream Team (up to 5 Pokémon), browse Pokémon in Explorer (search/filter/sort), ' +
  'save Favorites, take a Starter Quiz for recommendations, manage their team via drag-and-drop in ' +
  'Manage My Team, edit their Trainer Profile, adjust app preferences in Settings, and run simplified, ' +
  'stat-based battle simulations (no moves/turns/HP — just a power comparison) against a random ' +
  "opponent team. Pokémon data comes from PokéAPI. Answer concisely (2-4 sentences), warm and " +
  'encouraging, and point users to the right page (Explorer, My Team, Starter Quiz, Settings) when ' +
  'relevant. If asked something unrelated to Pokémon or the app, gently steer back. Plain text only, no markdown. ' +
  'If your answer centers on or recommends one specific Pokémon, set pokemonName to its exact ' +
  'lowercase species name as used by PokéAPI (e.g. "charizard", "mr-mime"); otherwise set pokemonName to null.';

// text is free-form, like before — pokemonName is the ONLY thing the model
// decides here that turns into real data: if set, the server looks it up
// via fetchPokemonDetail() below, so the client only ever gets a real
// PokéAPI Pokémon (or null if the name doesn't resolve), never anything the
// model invented.
const ChatReplySchema = z.object({
  text: z.string(),
  pokemonName: z.string().nullable(),
});

const POKEMON_TYPES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison',
  'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark',
  'steel', 'fairy',
];

// The model only ever decides WHICH type to recommend and WHY — it never
// invents a Pokémon itself. getStrongestOfType() below always supplies the
// actual Pokémon from the real PokeAPI-backed data, so a hallucinated name/
// stat can never reach the client.
const RecommendationSchema = z.object({
  type: z.enum(POKEMON_TYPES),
  reasoning: z.string(),
});

// The model only ever decides the 3 name strings themselves — it never sees
// (and can't invent) anything beyond the real team summary handed to it in
// the prompt. sanitizeNames() below re-validates every name before it's
// trusted, regardless of what the schema already enforced.
const TeamNameSchema = z.object({
  names: z.array(z.string().min(1).max(MAX_NAME_LENGTH)).length(3),
});

// Generous but bounded — a hung Gemini call shouldn't hang the request
// forever; withTimeout() below rejects and the caller falls back. Shared by
// every Gemini-backed feature (team names, team analysis, description
// search, chat), not just team names, despite the name.
const AI_CALL_TIMEOUT_MS = 12000;

// A handful of real synonyms per type, for queryDescription's fallback below
// — a lightweight version of the keyword matching this feature used before
// it was rewritten to use a real LLM. Only used when Gemini itself is too
// slow or unavailable.
const TYPE_KEYWORDS = {
  fire: ['fire', 'flame', 'burn', 'hot', 'blaze'],
  water: ['water', 'aqua', 'swim', 'ocean', 'sea', 'wave'],
  electric: ['electric', 'shock', 'thunder', 'lightning', 'volt', 'spark'],
  grass: ['grass', 'plant', 'leaf', 'nature', 'forest'],
  ice: ['ice', 'snow', 'frost', 'cold', 'freeze'],
  fighting: ['fight', 'punch', 'kick', 'martial', 'brawl'],
  poison: ['poison', 'toxic', 'venom'],
  ground: ['ground', 'earth', 'dig', 'sand', 'dirt'],
  flying: ['fly', 'flying', 'wing', 'sky', 'air'],
  psychic: ['psychic', 'mind', 'telekinetic', 'psi'],
  bug: ['bug', 'insect'],
  rock: ['rock', 'stone', 'boulder'],
  ghost: ['ghost', 'spooky', 'spirit', 'phantom'],
  dragon: ['dragon', 'wyvern'],
  dark: ['dark', 'shadow', 'evil', 'night'],
  steel: ['steel', 'metal', 'iron'],
  fairy: ['fairy', 'cute', 'magical'],
  normal: ['normal', 'balanced', 'all-round'],
};

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('AI call timed out')), ms)),
  ]);
}

// Configurable so a model rename/deprecation is a one-line env var change,
// not a code change. Defaults to the model available on the free tier at
// the time this was built.
function buildModel() {
  return new ChatGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
    model: process.env.GOOGLE_GEMINI_MODEL || 'gemini-3-flash-preview',
    temperature: 0.4,
  });
}

// Deterministic stand-in for analyzeTeam below, used only when Gemini is too
// slow (past AI_CALL_TIMEOUT_MS) or unavailable — same priority the prompt
// itself asks the model to use (an uncovered type first, else the team's
// strongest theme), computed directly from the real team instead of asking
// an LLM to restate it.
function buildAnalyzeFallback(team, presentTypes, missingTypes) {
  if (missingTypes.length > 0) {
    const type = missingTypes[0];
    return {
      type,
      reasoning: `Your team has no ${type}-type coverage yet — adding one would round things out nicely.`,
    };
  }
  const strongest = team.length ? team.reduce((a, b) => (b.baseExperience > a.baseExperience ? b : a)) : null;
  const type = strongest ? strongest.types[0] : 'normal';
  return {
    type,
    reasoning: `Every type is already covered, so doubling down on ${type} would reinforce your team's strongest theme.`,
  };
}

// Real LLM reasoning over the trainer's actual Dream Team (types/power/
// stats) — analogous to the old rule-based "missing type" logic, but the
// model decides and explains it instead of a canned sentence template.
// Falls back to buildAnalyzeFallback() above (source: 'fallback') if Gemini
// doesn't answer within AI_CALL_TIMEOUT_MS or errors outright — same
// timeout+fallback pattern already used by generateTeamNames below.
// `deps` is test-only dependency injection (`invoke`/`timeoutMs`), same
// convention as generateTeamNames.
async function analyzeTeam(team, deps = {}) {
  const presentTypes = [...new Set(team.flatMap((m) => m.types))];
  const missingTypes = POKEMON_TYPES.filter((t) => !presentTypes.includes(t));
  const timeoutMs = deps.timeoutMs ?? AI_CALL_TIMEOUT_MS;
  const invoke = deps.invoke ?? ((prompt) => buildModel().withStructuredOutput(RecommendationSchema).invoke(prompt));

  const teamSummary = team.length
    ? team.map((m) => `${m.pokemonName} (types: ${m.types.join('/')}, power: ${m.baseExperience})`).join('; ')
    : 'empty — no Pokémon yet';

  try {
    const result = await withTimeout(
      invoke(
        `You are the Pokémon Trainer Hub's AI Trainer Assistant, talking directly to a trainer.\n` +
        `Their real Dream Team: ${teamSummary}\n` +
        `Types already covered: ${presentTypes.join(', ') || 'none'}\n` +
        `Types with no coverage: ${missingTypes.join(', ') || 'none'}\n\n` +
        `Pick exactly ONE Pokémon type that would most improve this team right now — prefer a ` +
        `type with no coverage; if every type is already covered, pick whichever type would ` +
        `most reinforce the team's strongest theme. Write a short (1-2 sentence), encouraging, ` +
        `trainer-facing reason for the pick.`,
      ),
      timeoutMs,
    );
    return { ...result, source: 'ai' };
  } catch (err) {
    console.error('Team analysis failed, using fallback:', err.message);
    return { ...buildAnalyzeFallback(team, presentTypes, missingTypes), source: 'fallback' };
  }
}

// Deterministic stand-in for queryDescription below — a lightweight keyword
// match (real substring search against each type's own name plus a few
// common synonyms), only used when Gemini is too slow or unavailable.
function buildQueryFallback(text) {
  const lower = text.toLowerCase();
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return { type, reasoning: `"${text}" sounds like a great match for ${type}-type Pokémon.` };
    }
  }
  return {
    type: 'normal',
    reasoning: "Couldn't pin down an exact type from that description, so here's a well-rounded Normal-type pick.",
  };
}

// Real LLM interpretation of free text ("fast and electric") instead of the
// old fixed keyword-substring list. Falls back to buildQueryFallback() above
// (source: 'fallback') on a timeout or Gemini error.
async function queryDescription(text, deps = {}) {
  const timeoutMs = deps.timeoutMs ?? AI_CALL_TIMEOUT_MS;
  const invoke = deps.invoke ?? ((prompt) => buildModel().withStructuredOutput(RecommendationSchema).invoke(prompt));

  try {
    const result = await withTimeout(
      invoke(
        `A Pokémon trainer described what kind of Pokémon they want: "${text}"\n` +
        `Pick exactly ONE of the 18 canonical Pokémon types that best matches this description, ` +
        `and write a short (1-2 sentence) reason that references what they described.`,
      ),
      timeoutMs,
    );
    return { ...result, source: 'ai' };
  } catch (err) {
    console.error('Description query failed, using fallback:', err.message);
    return { ...buildQueryFallback(text), source: 'fallback' };
  }
}

// Always the real, current strongest Pokémon of a type from PokeAPI (via
// the same cached service the Explorer/AI Assistant already use) — never
// anything the model produced itself. Delegates the actual ranking to
// services/pokeapi.js's cached, deduplicated, concurrency-limited
// getStrongestOfType(type, limit) — this wrapper just asks for the top 1 and
// re-fetches its full detail (a cache hit: every candidate's detail was
// already fetched while building the ranking), keeping this function's own
// external shape (one Pokémon or null) exactly as it was before.
async function getStrongestOfType(type) {
  const ranked = await getStrongestOfTypeRanked(type, 1);
  if (!ranked || ranked.length === 0) return null;
  return fetchPokemonDetail(ranked[0].id);
}

// Honest, non-AI stand-in when Gemini itself doesn't answer in time — unlike
// analyzeTeam/queryDescription above, open-ended chat has no real data to
// compute a substitute answer from, so this just says so plainly instead of
// guessing at a reply.
function buildChatFallback() {
  return {
    text: "I'm having trouble thinking right now — please try again in a moment, or check out the Explorer or My Team pages in the meantime!",
    pokemonName: null,
  };
}

// Real, open-ended multi-turn conversation — unlike analyzeTeam/
// queryDescription, the reply text itself is free-form, not a fixed shape.
// `history` is [{ role: 'user' | 'assistant', text }, ...], oldest first.
// Returns { text, pokemon }, where pokemon is only ever real PokeAPI data
// (or null) — see ChatReplySchema/CHAT_SYSTEM_PROMPT above for why. Falls
// back to buildChatFallback() above on a timeout or Gemini error, same
// pattern as analyzeTeam/queryDescription/generateTeamNames.
async function chatWithAssistant(history, deps = {}) {
  const recent = history.slice(-MAX_CHAT_HISTORY);
  const messages = [
    new SystemMessage(CHAT_SYSTEM_PROMPT),
    ...recent.map((m) => (m.role === 'user' ? new HumanMessage(m.text) : new AIMessage(m.text))),
  ];
  const timeoutMs = deps.timeoutMs ?? AI_CALL_TIMEOUT_MS;
  const invoke = deps.invoke ?? ((msgs) => buildModel().withStructuredOutput(ChatReplySchema).invoke(msgs));

  let result;
  let source = 'ai';
  try {
    result = await withTimeout(invoke(messages), timeoutMs);
  } catch (err) {
    console.error('Assistant chat failed, using fallback:', err.message);
    result = buildChatFallback();
    source = 'fallback';
  }

  let pokemon = null;
  if (result.pokemonName) {
    pokemon = await fetchPokemonDetail(result.pokemonName).catch(() => null);
  }

  return { text: result.text, pokemon, source };
}

// Default model call, split out so tests can inject a fake `invoke` below
// instead of ever reaching real Gemini.
function invokeTeamNameModel(prompt) {
  return buildModel().withStructuredOutput(TeamNameSchema).invoke(prompt);
}

// Real LLM naming of the trainer's actual Dream Team. Unlike analyzeTeam/
// queryDescription/chatWithAssistant above, this feature must keep working
// even when Gemini fails outright (error, timeout, quota, or an invalid/
// duplicate response) — every failure mode below falls through to
// buildFallbackNames(), a deterministic, non-AI generator, so the caller
// always gets exactly 3 usable suggestions and a `source` flag saying which
// path produced them.
//
// `deps` is test-only dependency injection (`invoke`/`timeoutMs`) — production
// callers never pass it, so real behavior is unchanged.
async function generateTeamNames(team, style, deps = {}) {
  const safeStyle = VALID_STYLES.includes(style) ? style : 'Epic';
  const invoke = deps.invoke ?? invokeTeamNameModel;
  const timeoutMs = deps.timeoutMs ?? AI_CALL_TIMEOUT_MS;

  try {
    const teamSummary = team
      .map((m) => `${m.pokemonName} (types: ${m.types.join('/')}, power: ${m.baseExperience})`)
      .join('; ');

    const result = await withTimeout(
      invoke(
        `You are naming a Pokémon trainer's Dream Team.\n\n` +
        `The real team is:\n${teamSummary}\n\n` +
        `Selected style: ${safeStyle}\n\n` +
        `Generate exactly 3 short, distinct team names inspired by the team's types, strengths, ` +
        `and overall identity.\n\n` +
        `Rules:\n` +
        `- Do not invent Pokémon or team facts.\n` +
        `- Do not claim the team contains Pokémon that were not listed above.\n` +
        `- Do not provide explanations — return only the structured result.\n` +
        `- Keep every name under ${MAX_NAME_LENGTH} characters.\n` +
        `- Match the selected style.\n` +
        `- Avoid offensive, inappropriate, or adult wording.\n` +
        `- Avoid trademark-style names copied from existing franchises.\n` +
        `- Only include a real Pokémon name from the team above if it fits naturally.`,
      ),
      timeoutMs,
    );

    const clean = sanitizeNames(result.names);
    if (clean) return { names: clean, source: 'ai' };
  } catch (err) {
    console.error('Team name generation failed, using fallback:', err.message);
  }

  return { names: buildFallbackNames(team, safeStyle), source: 'fallback' };
}

// The free tier's daily/per-minute quota is real and low (Gemini returns a
// 429 with "quota exceeded" wording, not a generic failure) — routes use
// this to tell that case apart from a real outage and show an honest
// "come back tomorrow" message instead of a vague "something went wrong."
function isRateLimitError(err) {
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('429') || msg.includes('quota exceeded') || msg.includes('resource_exhausted');
}

module.exports = {
  analyzeTeam,
  queryDescription,
  getStrongestOfType,
  chatWithAssistant,
  generateTeamNames,
  isRateLimitError,
  VALID_STYLES,
};
