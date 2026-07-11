const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { SystemMessage, HumanMessage, AIMessage } = require('@langchain/core/messages');
const { z } = require('zod');
const { getListByType, fetchPokemonDetail } = require('./pokeapi');

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

// Real LLM reasoning over the trainer's actual Dream Team (types/power/
// stats) — analogous to the old rule-based "missing type" logic, but the
// model decides and explains it instead of a canned sentence template.
async function analyzeTeam(team) {
  const presentTypes = [...new Set(team.flatMap((m) => m.types))];
  const missingTypes = POKEMON_TYPES.filter((t) => !presentTypes.includes(t));

  const model = buildModel().withStructuredOutput(RecommendationSchema);
  const teamSummary = team.length
    ? team.map((m) => `${m.pokemonName} (types: ${m.types.join('/')}, power: ${m.baseExperience})`).join('; ')
    : 'empty — no Pokémon yet';

  const result = await model.invoke(
    `You are the Pokémon Trainer Hub's AI Trainer Assistant, talking directly to a trainer.\n` +
    `Their real Dream Team: ${teamSummary}\n` +
    `Types already covered: ${presentTypes.join(', ') || 'none'}\n` +
    `Types with no coverage: ${missingTypes.join(', ') || 'none'}\n\n` +
    `Pick exactly ONE Pokémon type that would most improve this team right now — prefer a ` +
    `type with no coverage; if every type is already covered, pick whichever type would ` +
    `most reinforce the team's strongest theme. Write a short (1-2 sentence), encouraging, ` +
    `trainer-facing reason for the pick.`,
  );
  return result;
}

// Real LLM interpretation of free text ("fast and electric") instead of the
// old fixed keyword-substring list.
async function queryDescription(text) {
  const model = buildModel().withStructuredOutput(RecommendationSchema);
  const result = await model.invoke(
    `A Pokémon trainer described what kind of Pokémon they want: "${text}"\n` +
    `Pick exactly ONE of the 18 canonical Pokémon types that best matches this description, ` +
    `and write a short (1-2 sentence) reason that references what they described.`,
  );
  return result;
}

// Always the real, current strongest Pokémon of a type from PokeAPI (via
// the same cached service the Explorer/AI Assistant already use) — never
// anything the model produced itself.
async function getStrongestOfType(type) {
  const list = await getListByType(type);
  if (!list) return null;

  const detailed = await Promise.all(list.map((c) => fetchPokemonDetail(c.id).catch(() => null)));
  const valid = detailed.filter(Boolean);
  if (valid.length === 0) return null;

  return valid.reduce((a, b) => (b.baseExperience > a.baseExperience ? b : a));
}

// Real, open-ended multi-turn conversation — unlike analyzeTeam/
// queryDescription, the reply text itself is free-form, not a fixed shape.
// `history` is [{ role: 'user' | 'assistant', text }, ...], oldest first.
// Returns { text, pokemon }, where pokemon is only ever real PokeAPI data
// (or null) — see ChatReplySchema/CHAT_SYSTEM_PROMPT above for why.
async function chatWithAssistant(history) {
  const recent = history.slice(-MAX_CHAT_HISTORY);
  const messages = [
    new SystemMessage(CHAT_SYSTEM_PROMPT),
    ...recent.map((m) => (m.role === 'user' ? new HumanMessage(m.text) : new AIMessage(m.text))),
  ];

  const model = buildModel().withStructuredOutput(ChatReplySchema);
  const result = await model.invoke(messages);

  let pokemon = null;
  if (result.pokemonName) {
    pokemon = await fetchPokemonDetail(result.pokemonName).catch(() => null);
  }

  return { text: result.text, pokemon };
}

// The free tier's daily/per-minute quota is real and low (Gemini returns a
// 429 with "quota exceeded" wording, not a generic failure) — routes use
// this to tell that case apart from a real outage and show an honest
// "come back tomorrow" message instead of a vague "something went wrong."
function isRateLimitError(err) {
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('429') || msg.includes('quota exceeded') || msg.includes('resource_exhausted');
}

module.exports = { analyzeTeam, queryDescription, getStrongestOfType, chatWithAssistant, isRateLimitError };
