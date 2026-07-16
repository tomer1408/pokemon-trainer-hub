// One-time utility: deletes ALL rows from every user-data table, but keeps
// the schema intact (TRUNCATE-equivalent via Prisma, not a migration) and
// deliberately leaves AvatarIcon untouched — that's curated reference/
// catalog data seeded once via scripts/seed-avatar-icons.js, not user data.
//
// Run manually against whichever DATABASE_URL is currently active:
//   node scripts/wipe-user-data.js
//
// To run against production instead of local, set DATABASE_URL inline for
// just this one command so the real connection string is never saved to
// disk or shared anywhere:
//   DATABASE_URL="<production connection string>" node scripts/wipe-user-data.js
require('dotenv').config();
const prisma = require('../services/prisma');

function maskConnectionString(url) {
  return String(url || '').replace(/password=[^;]*/i, 'password=***');
}

async function main() {
  console.log(`Wiping user data from: ${maskConnectionString(process.env.DATABASE_URL)}`);

  // Order doesn't matter — none of these tables have a real foreign-key
  // relation to each other, each just carries its own plain auth0UserId
  // string column (see CLAUDE.md: Auth0 is the sole identity source, no
  // local Users table to cascade from).
  const results = {
    trainerNote: (await prisma.trainerNote.deleteMany({})).count,
    dreamTeamMember: (await prisma.dreamTeamMember.deleteMany({})).count,
    favorite: (await prisma.favorite.deleteMany({})).count,
    supportRequest: (await prisma.supportRequest.deleteMany({})).count,
    battleMatch: (await prisma.battleMatch.deleteMany({})).count,
    trainerProfile: (await prisma.trainerProfile.deleteMany({})).count,
  };

  console.log('Deleted rows:');
  for (const [table, count] of Object.entries(results)) {
    console.log(`  ${table}: ${count}`);
  }
  console.log('AvatarIcon left untouched (reference/catalog data, not user data).');
}

main()
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
