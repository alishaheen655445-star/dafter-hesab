// -----------------------------------------------------------------------------
//  partyService — rules around طرف حساب (parties) and their side data.
//  Controllers stay thin; models stay dumb; everything else lives here.
// -----------------------------------------------------------------------------
const partyModel = require('../models/partyModel');
const ApiError = require('../utils/ApiError');

/** Trim + collapse inner spaces so "علي  حسين" and "علي حسين" are the same name. */
const cleanName = (name) => String(name || '').trim().replace(/\s+/g, ' ');

async function assertOwnership(userId, id) {
  const party = await partyModel.findRaw(userId, id);
  if (!party) throw new ApiError(404, 'Party not found');
  return party;
}

/** GET /api/parties — list with search + totals. */
async function listParties(userId, { search = '' } = {}) {
  const parties = await partyModel.listByUser(userId, { search: search.trim() });
  return {
    parties,
    meta: {
      count: parties.length,
      // App-wide snapshot shown in the header of the parties screen.
      total_credit_minor: parties.reduce((s, p) => s + Number(p.credit_minor), 0),
      total_debit_minor: parties.reduce((s, p) => s + Number(p.debit_minor), 0),
    },
  };
}

/** GET /api/parties/:id — party + its bank info + its notes, in one call. */
async function getParty(userId, id) {
  await assertOwnership(userId, id);
  const [party, bank, notes] = await Promise.all([
    partyModel.findById(userId, id),
    partyModel.findBank(userId, id),
    partyModel.listNotes(userId, id),
  ]);
  return { party, bank, notes };
}

/** POST /api/parties — duplicate names are rejected (the ledger gets ambiguous). */
async function createParty(userId, payload) {
  const name = cleanName(payload.name);
  if (await partyModel.nameExists(userId, name)) {
    throw new ApiError(409, 'You already have a party with this name');
  }
  const id = await partyModel.create({ userId, name, phone: payload.phone, note: payload.note });
  return getParty(userId, id);
}

/** PUT /api/parties/:id — partial update; name uniqueness still enforced. */
async function updateParty(userId, id, payload) {
  await assertOwnership(userId, id);
  const fields = {};
  if (payload.name !== undefined) {
    const name = cleanName(payload.name);
    if (await partyModel.nameExists(userId, name, id)) {
      throw new ApiError(409, 'You already have a party with this name');
    }
    fields.name = name;
  }
  if (payload.phone !== undefined) fields.phone = payload.phone;
  if (payload.note !== undefined) fields.note = payload.note;
  if (payload.avatar_url !== undefined) fields.avatar_url = payload.avatar_url;
  await partyModel.update(userId, id, fields);
  return getParty(userId, id);
}

/** DELETE /api/parties/:id — soft delete; transactions stay for the audit trail. */
async function deleteParty(userId, id) {
  await assertOwnership(userId, id);
  await partyModel.softDelete(userId, id);
  // The book below it closes with it — see partyModel.softDeleteLedger.
  await partyModel.softDeleteLedger(userId, id);
}

/** PUT /api/parties/:id/bank — one row per party, so save = upsert. */
async function saveBank(userId, id, data) {
  await assertOwnership(userId, id);
  const bank = await partyModel.upsertBank(userId, id, data);
  return { bank };
}

/** POST /api/parties/:id/notes */
async function addNote(userId, id, note) {
  await assertOwnership(userId, id);
  const created = await partyModel.createNote(userId, id, String(note).trim());
  return { note: created };
}

/** DELETE /api/parties/:id/notes/:noteId */
async function removeNote(userId, id, noteId) {
  await assertOwnership(userId, id);
  const ok = await partyModel.deleteNote(userId, noteId);
  if (!ok) throw new ApiError(404, 'Note not found');
}

module.exports = {
  listParties,
  getParty,
  createParty,
  updateParty,
  deleteParty,
  saveBank,
  addNote,
  removeNote,
};
