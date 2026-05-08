-- ============================================================
-- Rollback for 0002_low_wonder_man.sql
-- Order: drop FKs first, then drop tables
-- ============================================================

DROP TABLE IF EXISTS "order_status_history";
DROP TABLE IF EXISTS "import_sessions";
DROP TABLE IF EXISTS "admin_action_history";
DROP TABLE IF EXISTS "admin_sessions";
