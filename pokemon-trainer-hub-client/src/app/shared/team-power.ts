// Team Power is shown on multiple screens (Home, My Team, AI Trainer
// Assistant) and must use one shared calculation rather than each screen
// computing its own. Per the PRD: sum of base_experience across the team.
export function getTeamPower(members: { baseExperience: number }[]): number {
  return members.reduce((sum, m) => sum + (m.baseExperience || 0), 0);
}

export function getStrongestMember<T extends { baseExperience: number }>(members: T[]): T | null {
  if (members.length === 0) return null;
  return members.reduce((a, b) => (b.baseExperience > a.baseExperience ? b : a));
}

// Trainer tier shown next to the team on Home and My Team — based on how
// many Pokémon have been caught (0 / 1-2 / 3-4 / 5), per the original design
// mockup's tierFor(), not on Team Power.
export function getTeamTier(teamSize: number): string {
  if (teamSize === 0) return 'Rookie';
  if (teamSize <= 2) return 'Beginner';
  if (teamSize <= 4) return 'Trainer';
  return 'Master';
}

export interface TypeSegment {
  type: string;
  pct: number;
}

// Dual-type Pokémon count toward BOTH types, normalized so the segments sum
// to 100% — per the product spec. Shared by My Team and Home's type-coverage
// card so both use the exact same calculation.
//
// Uses the largest-remainder method rather than rounding each percentage
// independently: independent rounding can under/over-shoot 100 in total
// (e.g. three equal thirds each round to 33%, summing to 99%). Flooring
// every share first and handing the leftover points to the segments with
// the biggest fractional remainder guarantees the total is always exactly
// 100 when there's at least one Pokémon on the team.
export function getTypeSegments(members: { types: string[] }[]): TypeSegment[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const member of members) {
    for (const type of member.types) {
      counts.set(type, (counts.get(type) ?? 0) + 1);
      total += 1;
    }
  }
  if (total === 0) return [];

  const shares = Array.from(counts.entries()).map(([type, count]) => {
    const exact = (count / total) * 100;
    return { type, pct: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });

  const shortfall = 100 - shares.reduce((sum, s) => sum + s.pct, 0);
  [...shares]
    .sort((a, b) => b.remainder - a.remainder)
    .slice(0, shortfall)
    .forEach((s) => {
      s.pct += 1;
    });

  return shares.map(({ type, pct }) => ({ type, pct }));
}

export function getMissingTypes(allTypes: readonly string[], presentTypes: string[]): string[] {
  return allTypes.filter((t) => !presentTypes.includes(t));
}

export function getTypeCoverageInsight(presentTypes: string[], missingTypes: string[]): string {
  if (presentTypes.length === 0) return '';
  if (missingTypes.length === 0) return 'Full type coverage — nothing can catch this team off guard.';
  const shown = missingTypes.slice(0, 3).join(', ');
  return `Solid coverage in ${presentTypes.join(', ')} — but you're lacking ${shown}${missingTypes.length > 3 ? ', and more' : ''}.`;
}
