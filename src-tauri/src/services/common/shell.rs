/// Wrap a value in PowerShell single quotes with proper escaping.
pub fn ps_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}
