// -----------------------------------------------------------------------------
//  reminderService — تذكيرات. The client is the clock: it sends its local
//  "now" so a reminder created at 09:00 fires at 09:00 wherever the user is.
// -----------------------------------------------------------------------------
const reminderModel = require('../models/reminderModel');
const partyModel = require('../models/partyModel');
const ApiError = require('../utils/ApiError');

/** '2026-11-02T09:30' (datetime-local) | '2026-11-02' -> 'YYYY-MM-DD HH:MM:SS' */
function toSqlDateTime(value) {
  const s = String(value).trim().replace('T', ' ');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 09:00:00`;          // date only -> morning
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return s;
}

/** The client's current local time, or the server's if it didn't send one. */
function clockFrom(rawNow) {
  if (rawNow && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(String(rawNow))) return toSqlDateTime(rawNow);
  return toSqlDateTime(new Date().toISOString().slice(0, 16));
}

async function assertParty(userId, partyId) {
  if (partyId === undefined || partyId === null || partyId === '') return null;
  const party = await partyModel.findRaw(userId, Number(partyId));
  if (!party) throw new ApiError(404, 'Party not found');
  return party;
}

async function assertFound(userId, id) {
  const row = await reminderModel.findById(userId, id);
  if (!row) throw new ApiError(404, 'Reminder not found');
  return row;
}

function decorate(row, nowStr) {
  return { ...row, is_due: !Number(row.sent) && String(row.remind_at) <= nowStr };
}

/** GET /api/reminders?now=... */
async function list(userId, rawNow) {
  const nowStr = clockFrom(rawNow);
  const rows = await reminderModel.listByUser(userId);
  const reminders = rows.map((r) => decorate(r, nowStr));
  return {
    reminders,
    meta: {
      count: reminders.length,
      pending_count: reminders.filter((r) => !Number(r.sent)).length,
      due_count: reminders.filter((r) => r.is_due).length,
      now: nowStr,
    },
  };
}

/** GET /api/reminders/due — what the notification poller asks for. */
async function due(userId, rawNow) {
  const nowStr = clockFrom(rawNow);
  const rows = await reminderModel.listDue(userId, nowStr);
  return { reminders: rows.map((r) => decorate(r, nowStr)), now: nowStr };
}

/** POST /api/reminders */
async function create(userId, payload) {
  const party = await assertParty(userId, payload.party_id);
  const id = await reminderModel.create({
    userId,
    partyId: party ? party.id : null,
    title: payload.title,
    message: payload.message,
    remindAt: toSqlDateTime(payload.remind_at),
  });
  const row = await assertFound(userId, id);
  return { reminder: decorate(row, clockFrom()) };
}

/** PUT /api/reminders/:id */
async function update(userId, id, payload) {
  await assertFound(userId, id);
  const fields = {};
  if (payload.remind_at !== undefined) fields.remind_at = toSqlDateTime(payload.remind_at);
  if (payload.title !== undefined) fields.title = payload.title;
  if (payload.message !== undefined) fields.message = payload.message;
  if (payload.party_id !== undefined) {
    const party = await assertParty(userId, payload.party_id);
    fields.party_id = party ? party.id : '';
  }
  const row = await reminderModel.update(userId, id, fields);
  return { reminder: decorate(row, clockFrom()) };
}

/** POST /api/reminders/:id/ack — body { sent: true|false } */
async function ack(userId, id, sent) {
  await assertFound(userId, id);
  await reminderModel.setSent(userId, id, sent);
  const row = await assertFound(userId, id);
  return { reminder: decorate(row, clockFrom()) };
}

/** DELETE /api/reminders/:id */
async function remove(userId, id) {
  const ok = await reminderModel.remove(userId, id);
  if (!ok) throw new ApiError(404, 'Reminder not found');
}

module.exports = { list, due, create, update, ack, remove, toSqlDateTime, clockFrom };
