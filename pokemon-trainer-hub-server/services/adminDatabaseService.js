const prisma = require('./prisma');
const { getTableKeys, getTableEntry } = require('./adminDatabaseRegistry');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function clampPageSize(pageSize) {
  const n = parseInt(pageSize, 10);
  if (!Number.isInteger(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(n, MAX_PAGE_SIZE);
}

function normalizePage(page) {
  const n = parseInt(page, 10);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

// Real per-table row counts — one query per registered model, run in
// parallel. Powers the table-selector cards; never a guessed/cached count.
async function listTables() {
  const keys = getTableKeys();
  const counts = await Promise.all(keys.map((key) => prisma[getTableEntry(key).modelName].count()));

  return keys.map((key, i) => {
    const entry = getTableEntry(key);
    return { key, label: entry.label, description: entry.description, count: counts[i] };
  });
}

// `tableKey` must already be validated by the route (404 before this is
// ever called) — this function trusts it's a real registry key, but still
// never accepts anything beyond what the registry explicitly whitelists
// for sorting/searching, so a bad/absent value always falls back to a safe
// default rather than reaching Prisma unchecked.
async function listRecords(tableKey, filters = {}) {
  const entry = getTableEntry(tableKey);
  const page = normalizePage(filters.page);
  const pageSize = clampPageSize(filters.pageSize);
  const sortField = entry.sortableFields.includes(filters.sortBy) ? filters.sortBy : entry.defaultSort.field;
  const sortDirection = filters.sortDirection === 'asc' ? 'asc' : entry.defaultSort.direction;

  const where = {};
  if (filters.search && entry.searchableFields.length > 0) {
    where.OR = entry.searchableFields.map((field) => ({ [field]: { contains: filters.search } }));
  }

  const model = prisma[entry.modelName];
  const [rows, total] = await Promise.all([
    model.findMany({
      where,
      orderBy: { [sortField]: sortDirection },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    model.count({ where }),
  ]);

  return { results: rows.map(entry.toSafeRow), page, pageSize, total };
}

async function getRecord(tableKey, id) {
  const entry = getTableEntry(tableKey);
  const model = prisma[entry.modelName];
  const row = await model.findUnique({ where: { id } });
  if (!row) return null;

  const toSafe = entry.toSafeDetail ?? entry.toSafeRow;
  return toSafe(row);
}

module.exports = { listTables, listRecords, getRecord };
