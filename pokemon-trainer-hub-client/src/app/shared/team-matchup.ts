import { TypeChart } from '../core/pokemon';

// Powers My Team's Battle Readiness and Matchup Analysis cards. All of it
// derives from real data: each member's real types/baseExperience and the
// real PokeAPI type chart — nothing here is invented (no fabricated
// "level" stat, no made-up type-effectiveness table).

export interface VulnerableType {
  type: string;
  count: number;
}

interface MatchupMember {
  types: string[];
}

// A member's real weak types, merging both of its types the same way the
// server's fetchTypeMatchups() already does for the Detail Modal: a type
// that ends up both weak-against and resistant-against (possible for dual-
// types) is dropped from the weak set — good enough for a badge display,
// not a battle-accuracy engine.
function memberWeakTypes(member: MatchupMember, chart: TypeChart): Set<string> {
  const weak = new Set<string>();
  const resist = new Set<string>();
  for (const t of member.types) {
    (chart[t]?.weak ?? []).forEach((w) => weak.add(w));
    (chart[t]?.resist ?? []).forEach((r) => resist.add(r));
  }
  resist.forEach((r) => weak.delete(r));
  return weak;
}

export interface TeamMatchup {
  strongAgainst: string[];
  vulnerableTo: VulnerableType[];
}

export function getTeamMatchup(members: MatchupMember[], chart: TypeChart): TeamMatchup {
  const presentTypes = Array.from(new Set(members.flatMap((m) => m.types)));

  const strongAgainst = new Set<string>();
  presentTypes.forEach((t) => (chart[t]?.strong ?? []).forEach((s) => strongAgainst.add(s)));

  const weakCount = new Map<string, number>();
  members.forEach((m) => {
    memberWeakTypes(m, chart).forEach((t) => weakCount.set(t, (weakCount.get(t) ?? 0) + 1));
  });
  const vulnerableTo = Array.from(weakCount.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return { strongAgainst: Array.from(strongAgainst), vulnerableTo };
}

export interface BattleReadiness {
  score: number;
  verdict: string;
  offense: number;
  coverage: number;
  balance: number;
}

const TOTAL_TYPE_COUNT = 18;
// Normalizes average team power into a 0-100 offense score — a mid-range
// average (not the theoretical max) maps to 100 so the meter isn't
// permanently pinned near zero; same reasoning as the mockup this replaces.
const OFFENSE_POWER_CEILING = 320;

export function getBattleReadiness(
  members: { types: string[]; baseExperience: number }[],
  chart: TypeChart,
): BattleReadiness {
  if (members.length === 0) {
    return { score: 0, verdict: 'Early days — build out your roster to compete.', offense: 0, coverage: 0, balance: 0 };
  }

  const totalPower = members.reduce((sum, m) => sum + m.baseExperience, 0);
  const averagePower = totalPower / members.length;
  const offense = Math.min(100, Math.round((averagePower / OFFENSE_POWER_CEILING) * 100));

  const presentTypes = Array.from(new Set(members.flatMap((m) => m.types)));
  const strongAgainst = new Set<string>();
  presentTypes.forEach((t) => (chart[t]?.strong ?? []).forEach((s) => strongAgainst.add(s)));
  const coverage = Math.round((strongAgainst.size / TOTAL_TYPE_COUNT) * 100);

  const powers = members.map((m) => m.baseExperience);
  const maxPower = Math.max(...powers);
  const minPower = Math.min(...powers);
  const powerEvenness = maxPower > 0 ? 1 - (maxPower - minPower) / maxPower : 1;
  const typeDiversity = presentTypes.length / members.length;
  const balance = Math.round((typeDiversity * 0.55 + powerEvenness * 0.45) * 100);

  const score = Math.round(offense * 0.4 + coverage * 0.35 + balance * 0.25);
  const verdict =
    score >= 80
      ? 'Elite-ready — this squad can headline the arena.'
      : score >= 60
        ? "Strong contender — patch a couple of gaps and you're set."
        : score >= 40
          ? 'Coming together — keep training and diversifying.'
          : 'Early days — build out your roster to compete.';

  return { score, verdict, offense, coverage, balance };
}
