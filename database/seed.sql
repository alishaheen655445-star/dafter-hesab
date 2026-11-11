-- ===========================================================================
--  Optional demo seed data for local development.
--  Load AFTER schema.sql. Safe to run multiple times (DELETE first).
-- ===========================================================================
SET NAMES utf8mb4;

-- No demo users are seeded. Register via the UI or POST /api/auth/register.
-- This file exists so `npm run db:load` has a consistent target.

SELECT 'seed: nothing to load (register through the UI)' AS note;
