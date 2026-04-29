-- ============================================================
-- Rollback for 0002_low_wonder_man.sql
-- 順序: 先 drop FK, 再 drop tables
-- ============================================================

DROP TABLE IF EXISTS "order_status_history";
DROP TABLE IF EXISTS "import_sessions";
DROP TABLE IF EXISTS "admin_action_history";
DROP TABLE IF EXISTS "admin_sessions";
