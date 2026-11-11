// -----------------------------------------------------------------------------
//  Reminder controller — thin HTTP layer over reminderService.
// -----------------------------------------------------------------------------
const reminderService = require('../services/reminderService');
const { sendSuccess, sendCreated } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/reminders?now=... */
const list = asyncHandler(async (req, res) => {
  const { reminders, meta } = await reminderService.list(req.user.id, req.query.now);
  return sendSuccess(res, { message: 'Reminders', data: { reminders }, meta });
});

/** GET /api/reminders/due?now=... — polled by the client for notifications */
const due = asyncHandler(async (req, res) => {
  const data = await reminderService.due(req.user.id, req.query.now);
  return sendSuccess(res, { message: 'Due reminders', data: { reminders: data.reminders }, meta: { now: data.now } });
});

/** POST /api/reminders */
const create = asyncHandler(async (req, res) => {
  const data = await reminderService.create(req.user.id, req.body);
  return sendCreated(res, { message: 'Reminder saved', data });
});

/** PUT /api/reminders/:id */
const update = asyncHandler(async (req, res) => {
  const data = await reminderService.update(req.user.id, req.params.id, req.body);
  return sendSuccess(res, { message: 'Reminder updated', data });
});

/** POST /api/reminders/:id/ack — body { sent } */
const ack = asyncHandler(async (req, res) => {
  const sent = req.body.sent === undefined ? true : req.body.sent;
  const data = await reminderService.ack(req.user.id, req.params.id, sent);
  return sendSuccess(res, { message: sent ? 'Reminder done' : 'Reminder reopened', data });
});

/** DELETE /api/reminders/:id */
const remove = asyncHandler(async (req, res) => {
  await reminderService.remove(req.user.id, req.params.id);
  return sendSuccess(res, { message: 'Reminder deleted' });
});

module.exports = { list, due, create, update, ack, remove };
