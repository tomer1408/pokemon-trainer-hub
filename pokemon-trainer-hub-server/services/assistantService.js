const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { z } = require('zod');
const { getListByType, fetchPokemonDetail } = require('./pokeapi');

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

module.exports = { analyzeTeam, queryDescription, getStrongestOfType };
