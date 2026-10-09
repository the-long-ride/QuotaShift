//! Types a line into another process's console, as if the user typed it. Works for every
//! ConPTY terminal (Windows Terminal, Orca, OmniTerm, VS Code), because they all host a console.

use std::ffi::c_void;
use std::sync::Mutex;

type Handle = *mut c_void;

#[repr(C)]
#[derive(Clone, Copy)]
struct KeyEventRecord {
    key_down: i32,
    repeat_count: u16,
    virtual_key_code: u16,
    virtual_scan_code: u16,
    unicode_char: u16,
    control_key_state: u32,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct InputRecord {
    event_type: u16,
    key_event: KeyEventRecord,
}

#[link(name = "kernel32")]
extern "system" {
    fn AttachConsole(process_id: u32) -> i32;
    fn FreeConsole() -> i32;
    fn GetConsoleWindow() -> Handle;
    fn CreateFileW(
        name: *const u16,
        access: u32,
        share: u32,
        security: *mut c_void,
        disposition: u32,
        flags: u32,
        template: Handle,
    ) -> Handle;
    fn WriteConsoleInputW(
        input: Handle,
        buffer: *const InputRecord,
        length: u32,
        written: *mut u32,
    ) -> i32;
    fn CloseHandle(handle: Handle) -> i32;
}

const KEY_EVENT: u16 = 0x0001;
const VK_RETURN: u16 = 0x0D;
const GENERIC_READ: u32 = 0x8000_0000;
const GENERIC_WRITE: u32 = 0x4000_0000;
const FILE_SHARE_READ_WRITE: u32 = 0x1 | 0x2;
const OPEN_EXISTING: u32 = 3;
const ATTACH_PARENT_PROCESS: u32 = u32::MAX;

/// A process has one console at a time; serialise attach/detach.
static CONSOLE: Mutex<()> = Mutex::new(());

fn key(unicode_char: u16, virtual_key_code: u16, key_down: bool) -> InputRecord {
    InputRecord {
        event_type: KEY_EVENT,
        key_event: KeyEventRecord {
            key_down: key_down as i32,
            repeat_count: 1,
            virtual_key_code,
            virtual_scan_code: 0,
            unicode_char,
            control_key_state: 0,
        },
    }
}

fn key_records(line: &str) -> Vec<InputRecord> {
    let mut records = Vec::new();
    for unit in line.encode_utf16().chain(std::iter::once(b'\r' as u16)) {
        let vk = if unit == b'\r' as u16 { VK_RETURN } else { 0 };
        records.push(key(unit, vk, true));
        records.push(key(unit, vk, false));
    }
    records
}

unsafe fn write_into(process_id: u32, records: &[InputRecord]) -> Result<(), String> {
    if AttachConsole(process_id) == 0 {
        return Err(format!(
            "could not reach the terminal ({})",
            std::io::Error::last_os_error()
        ));
    }
    let name: Vec<u16> = "CONIN$\0".encode_utf16().collect();
    let input = CreateFileW(
        name.as_ptr(),
        GENERIC_READ | GENERIC_WRITE,
        FILE_SHARE_READ_WRITE,
        std::ptr::null_mut(),
        OPEN_EXISTING,
        0,
        std::ptr::null_mut(),
    );
    if input.is_null() || input as isize == -1 {
        return Err("could not open the terminal input".to_string());
    }
    let mut written = 0u32;
    let ok = WriteConsoleInputW(input, records.as_ptr(), records.len() as u32, &mut written);
    CloseHandle(input);
    if ok == 0 || written as usize != records.len() {
        return Err("could not type into the terminal".to_string());
    }
    Ok(())
}

pub fn type_line(process_id: u32, line: &str) -> Result<(), String> {
    let _guard = CONSOLE
        .lock()
        .map_err(|_| "terminal access is busy".to_string())?;
    let records = key_records(line);
    unsafe {
        // Dev builds run with a console; release builds have none.
        let had_console = !GetConsoleWindow().is_null();
        FreeConsole();
        let result = write_into(process_id, &records);
        FreeConsole();
        if had_console {
            AttachConsole(ATTACH_PARENT_PROCESS);
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_records_have_the_win32_layout_and_press_release_pairs() {
        assert_eq!(std::mem::size_of::<InputRecord>(), 20);
        let records = key_records("ab");
        assert_eq!(records.len(), 6);
        assert_eq!(records[0].key_event.unicode_char, 'a' as u16);
        assert_eq!(records[0].key_event.key_down, 1);
        assert_eq!(records[1].key_event.key_down, 0);
        assert_eq!(records[4].key_event.virtual_key_code, VK_RETURN);
    }

    /// Real round trip into a throwaway console. Run it with
    /// `cargo test inject_windows -- --ignored`.
    #[test]
    #[ignore]
    fn type_line_reaches_a_live_console() {
        let out = std::env::temp_dir().join(format!("qs-inject-{}.txt", std::process::id()));
        let _ = std::fs::remove_file(&out);
        // `Start-Process` gives the shell its own console, like a terminal tab; a plain
        // spawn would hand it our pipes instead.
        let spawn = "(Start-Process powershell.exe -ArgumentList '-NoLogo','-NoProfile','-NoExit' -PassThru).Id";
        let output = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-Command", spawn])
            .output()
            .expect("spawn the shell");
        let pid: u32 = String::from_utf8_lossy(&output.stdout)
            .trim()
            .parse()
            .expect("shell pid");
        std::thread::sleep(std::time::Duration::from_millis(1500));
        let line = format!("Set-Content -Path '{}' -Value injected", out.display());
        let typed = type_line(pid, &line);
        for _ in 0..30 {
            if out.exists() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(200));
        }
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .output();
        let text = std::fs::read_to_string(&out).unwrap_or_default();
        let _ = std::fs::remove_file(&out);
        typed.expect("type into the console");
        assert_eq!(text.trim(), "injected");
    }
}
