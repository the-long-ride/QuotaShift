//! Scoped access to Claude Code's nested settings.json environment keys.
use serde_json::{Map, Value};

pub fn get_setting<'a>(root: &'a Value, key: &str) -> Option<&'a Value> {
    if let Some(name) = key.strip_prefix("env.") {
        if name.is_empty() || name.contains('.') {
            return None;
        }
        root.get("env")?.get(name)
    } else {
        root.get(key)
    }
}

pub fn set_setting(root: &mut Value, key: &str, value: Value) -> Result<(), String> {
    let obj = root
        .as_object_mut()
        .ok_or_else(|| "Settings root must be an object".to_string())?;
    if let Some(name) = key.strip_prefix("env.") {
        if name.is_empty() || name.contains('.') {
            return Err("Invalid nested environment setting name".to_string());
        }
        let env = obj
            .entry("env")
            .or_insert_with(|| Value::Object(Map::new()));
        let env_obj = env
            .as_object_mut()
            .ok_or_else(|| "Existing settings.env is not a JSON object".to_string())?;
        env_obj.insert(name.to_string(), value);
    } else {
        obj.insert(key.to_string(), value);
    }
    Ok(())
}

pub fn remove_setting(root: &mut Value, key: &str) -> Result<(), String> {
    let obj = root
        .as_object_mut()
        .ok_or_else(|| "Settings root must be an object".to_string())?;
    if let Some(name) = key.strip_prefix("env.") {
        if let Some(env) = obj.get_mut("env") {
            let env_obj = env
                .as_object_mut()
                .ok_or_else(|| "Existing settings.env is not a JSON object".to_string())?;
            env_obj.remove(name);
        }
    } else {
        obj.remove(key);
    }
    Ok(())
}

/// Removes `env` again when the patch created it and nothing else lives in it.
pub fn drop_created_env(root: &mut Value, created_env: bool) {
    let empty = root
        .get("env")
        .and_then(Value::as_object)
        .is_some_and(Map::is_empty);
    if created_env && empty {
        if let Some(obj) = root.as_object_mut() {
            obj.remove("env");
        }
    }
}
