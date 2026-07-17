const prisma = require('./prisma');
const ServiceError = require('./serviceError');
const { logAdminAction } = require('./adminAudit');

// No native Prisma `enum` support on this datasource (SQL Server) — these
// are validated String allowlists instead, same treatment already used
// elsewhere in this schema for favoriteType/experienceLevel.
const VALID_STATUSES = ['open', 'in_progress', 'resolved'];
const VALID_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const SORTABLE_FIELDS = ['id', 'createdAt', 'updatedAt', 'status', 'priority'];
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

// Lists support requests with real, server-side pagination/filtering/
// sorting — never loads the whole table into memory. `pageSize` is
// client-suggestible but capped, mirroring the discipline the Database
// Explorer (a later phase) also holds itself to.
async function list(filters = {}) {
  const page = normalizePage(filters.page);
  const pageSize = clampPageSize(filters.pageSize);
  const sortBy = SORTABLE_FIELDS.includes(filters.sortBy) ? filters.sortBy : 'createdAt';
  const sortDirection = filters.sortDirection === 'asc' ? 'asc' : 'desc';

  const where = {};
  if (filters.status) where.status = filters.status;
  if (filters.priority) where.priority = filters.priority;
  if (filters.topic) where.topic = { contains: filters.topic };
  if (filters.search) {
    where.OR = [{ name: { contains: filters.search } }, { email: { contains: filters.search } }];
  }
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
  }

  const [results, total] = await Promise.all([
    prisma.supportRequest.findMany({
      where,
      orderBy: { [sortBy]: sortDirection },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.supportRequest.count({ where }),
  ]);

  return { results, page, pageSize, total };
}

async function getById(id) {
  return prisma.supportRequest.findUnique({ where: { id } });
}

// Updates ONLY status/priority/adminNotes/assignedTo — message/name/email/
// topic/auth0UserId are never accepted here, immutable by construction (see
// routes/adminSupport.js, which doesn't even read them off the body).
// Writes an audit log entry only for the fields that actually changed.
// Throws ServiceError('NOT_FOUND' | 'INVALID_STATUS' | 'INVALID_PRIORITY').
async function update(id, patch, adminAuth0UserId) {
  const existing = await prisma.supportRequest.findUnique({ where: { id } });
  if (!existing) {
    throw new ServiceError('NOT_FOUND', 'Support request not found.');
  }

  if (patch.status !== undefined && !VALID_STATUSES.includes(patch.status)) {
    throw new ServiceError('INVALID_STATUS', `status must be one of: ${VALID_STATUSES.join(', ')}.`);
  }
  if (patch.priority !== undefined && !VALID_PRIORITIES.includes(patch.priority)) {
    throw new ServiceError('INVALID_PRIORITY', `priority must be one of: ${VALID_PRIORITIES.join(', ')}.`);
  }

  const data = {};
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.priority !== undefined) data.priority = patch.priority;
  if (patch.adminNotes !== undefined) data.adminNotes = patch.adminNotes;
  if (patch.assignedTo !== undefined) data.assignedTo = patch.assignedTo;

  if (data.status !== undefined && data.status !== existing.status) {
    data.resolvedAt = data.status === 'resolved' ? new Date() : null;
  }

  const updated = await prisma.supportRequest.update({ where: { id }, data });

  if (data.status !== undefined && data.status !== existing.status) {
    await logAdminAction(adminAuth0UserId, 'support.status_changed', 'SupportRequest', id, {
      from: existing.status,
      to: data.status,
    });
  }
  if (data.priority !== undefined && data.priority !== existing.priority) {
    await logAdminAction(adminAuth0UserId, 'support.priority_changed', 'SupportRequest', id, {
      from: existing.priority,
      to: data.priority,
    });
  }

  return updated;
}

module.exports = { list, getById, update, VALID_STATUSES, VALID_PRIORITIES };
