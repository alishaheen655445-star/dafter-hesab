// -----------------------------------------------------------------------------
//  Backup controller — export / import / server-side copies.
//  The snapshot itself is built and validated in the service; this file only
//  moves bytes between HTTP and the service, plus the one file download.
// -----------------------------------------------------------------------------
const backupService = require('../services/backupService');
const { sendSuccess, sendCreated } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/backup/export — the snapshot as JSON (the client saves it as a .json file). */
const exportSnapshot = asyncHandler(async (req, res) => {
  const snap = await backupService.snapshot(req.user.id);
  return sendSuccess(res, { message: 'Backup ready', data: { snapshot: snap }, meta: snap.counts });
});

/** POST /api/backup/import — restore from a file the client read. */
const importSnapshot = asyncHandler(async (req, res) => {
  const result = await backupService.restore(req.user.id, req.body.snapshot, req.body.mode);
  return sendSuccess(res, { message: 'Backup restored', data: result });
});

/** POST /api/backup/online — keep a copy on the server (manual, or auto from the app). */
const save = asyncHandler(async (req, res) => {
  const data = await backupService.saveOnline(req.user.id, req.body.kind || 'manual');
  return sendCreated(res, { message: 'Backup saved on server', data });
});

/** GET /api/backup/online — list the server copies. */
const listOnline = asyncHandler(async (req, res) => {
  const { backups, meta } = await backupService.listOnline(req.user.id);
  return sendSuccess(res, { message: 'Backups', data: { backups }, meta });
});

/** GET /api/backup/online/:id/download — the file itself, authenticated only. */
const download = asyncHandler(async (req, res) => {
  const { row, full } = await backupService.filePathFor(req.user.id, req.params.id);
  return res.download(full, row.file_path);
});

/** DELETE /api/backup/online/:id */
const remove = asyncHandler(async (req, res) => {
  await backupService.removeOnline(req.user.id, req.params.id);
  return sendSuccess(res, { message: 'Backup deleted' });
});

/** POST /api/backup/online/:id/restore — restore straight from the server copy. */
const restoreOnline = asyncHandler(async (req, res) => {
  const result = await backupService.restoreOnline(req.user.id, req.params.id, req.body.mode || 'replace');
  return sendSuccess(res, { message: 'Backup restored', data: result });
});

module.exports = { exportSnapshot, importSnapshot, save, listOnline, download, remove, restoreOnline };
