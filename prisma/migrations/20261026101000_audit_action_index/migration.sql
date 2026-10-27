-- Sprint 13 (NFR-03): the audit log only grows. Filtering it by action (newest first) and
-- listing the distinct actions for the viewer's filter use this index instead of a full scan.
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");
