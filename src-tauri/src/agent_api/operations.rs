use super::state::{epoch_ms, AgentApiManager};

impl AgentApiManager {
    /// Claim the queued event before credential changes; reject late events.
    pub fn begin(&self, id: &str) -> Result<(), String> {
        let mut ops = self.inner.operations.lock().map_err(|_| "Operation lock unavailable")?;
        let active = self.inner.active_operation.lock().map_err(|_| "Rotation lock unavailable")?;
        if active.as_deref() != Some(id) { return Err("Rotation expired".into()); }
        let op = ops.get_mut(id).ok_or("Unknown operation")?;
        if op.status != "pending" { return Err("Rotation already started or expired".into()); }
        op.status = "running".into();
        op.updated_at = epoch_ms();
        Ok(())
    }
    /// A timed-out active operation retains its lock until the frontend finishes.
    pub fn timeout(&self, id: &str) {
        let mut release = false;
        if let Ok(mut ops) = self.inner.operations.lock() {
            if let Some(op) = ops.get_mut(id) {
                if op.status == "pending" {
                    op.status = "failed".into();
                    release = true;
                } else if op.status == "running" {
                    op.status = "timed_out".into();
                } else { return; }
                op.updated_at = epoch_ms();
            }
        }
        if release {
            if let Ok(mut active) = self.inner.active_operation.lock() {
                if active.as_deref() == Some(id) { *active = None; }
            }
        }
    }
    pub fn complete(&self, id: &str, succeeded: bool) {
        let mut release = false;
        if let Ok(mut ops) = self.inner.operations.lock() {
            if let Some(op) = ops.get_mut(id) {
                if op.status == "running" {
                    op.status = if succeeded { "succeeded" } else { "failed" }.into();
                } else if op.status == "pending" || op.status == "timed_out" {
                    op.status = "failed".into();
                } else { return; }
                op.updated_at = epoch_ms();
                release = true;
            }
            if ops.len() > 128 {
                if let Some(oldest) = ops.iter().filter(|(_, op)|
                    op.status != "pending" && op.status != "running"
                ).min_by_key(|(_, op)| op.updated_at).map(|(key, _)| key.clone()) {
                    ops.remove(&oldest);
                }
            }
        }
        if release {
            if let Ok(mut active) = self.inner.active_operation.lock() {
                if active.as_deref() == Some(id) { *active = None; }
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use super::super::state::AgentOperation;
    fn queue(manager: &AgentApiManager, id: &str) {
        *manager.inner.active_operation.lock().unwrap() = Some(id.into());
        manager.inner.operations.lock().unwrap().insert(id.into(), AgentOperation {
            operation_id: id.into(), account_id: "codex-1".into(),
            provider: "codex".into(), status: "pending".into(), updated_at: 1,
        });
    }
    fn status(manager: &AgentApiManager, id: &str) -> String {
        manager.inner.operations.lock().unwrap().get(id).unwrap().status.clone()
    }
    #[test]
    fn running_timeout_keeps_lock_until_renderer_completes() {
        let manager = AgentApiManager::default();
        queue(&manager, "a");
        manager.begin("a").unwrap();
        manager.timeout("a");
        assert_eq!(status(&manager, "a"), "timed_out");
        assert_eq!(manager.inner.active_operation.lock().unwrap().as_deref(), Some("a"));
        manager.complete("a", true);
        assert_eq!(status(&manager, "a"), "failed");
        assert!(manager.inner.active_operation.lock().unwrap().is_none());
    }
    #[test]
    fn queued_timeout_prevents_late_start() {
        let manager = AgentApiManager::default();
        queue(&manager, "b");
        manager.timeout("b");
        assert!(manager.begin("b").is_err());
        assert!(manager.inner.active_operation.lock().unwrap().is_none());
    }
    #[test]
    fn normal_completion_releases_lock() {
        let manager = AgentApiManager::default();
        queue(&manager, "c");
        manager.begin("c").unwrap();
        manager.complete("c", true);
        assert_eq!(status(&manager, "c"), "succeeded");
        assert!(manager.inner.active_operation.lock().unwrap().is_none());
    }
}
