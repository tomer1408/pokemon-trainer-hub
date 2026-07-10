// Deterministic "Pokémon of the Day" — same real Pokémon for everyone all day
// (day-of-year mod 151, the original 151 so the id is always guaranteed valid),
// changing at midnight. Real PokeAPI data, not a mockup placeholder. Shared by
// Home and Explorer so both show the exact same Pokémon on a given day.
export function dayOfYearPokemonId(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  return (dayOfYear % 151) + 1;
}
