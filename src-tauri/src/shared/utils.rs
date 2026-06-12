//! Shared utility functions for deduplication, version comparison, etc.

use std::cmp::Ordering;
use std::collections::HashSet;

/// Return deduplicated, non-empty strings preserving first-seen order.
pub fn unique(values: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    values
        .iter()
        .filter(|v| !v.is_empty() && seen.insert((*v).clone()))
        .cloned()
        .collect()
}

/// Compare two dotted version strings in ascending order (for sorting).
pub fn compare_version_asc(left: &str, right: &str) -> Ordering {
    let left_parts: Vec<i64> = left.split('.').filter_map(|p| p.parse().ok()).collect();
    let right_parts: Vec<i64> = right.split('.').filter_map(|p| p.parse().ok()).collect();
    let len = left_parts.len().max(right_parts.len());

    for i in 0..len {
        let l = left_parts.get(i).copied().unwrap_or(0);
        let r = right_parts.get(i).copied().unwrap_or(0);
        match l.cmp(&r) {
            Ordering::Equal => continue,
            other => return other,
        }
    }
    Ordering::Equal
}

/// Compare two dotted version strings in descending order (for sorting).
pub fn compare_version_desc(left: &str, right: &str) -> Ordering {
    let left_parts: Vec<i64> = left.split('.').filter_map(|p| p.parse().ok()).collect();
    let right_parts: Vec<i64> = right.split('.').filter_map(|p| p.parse().ok()).collect();
    let len = left_parts.len().max(right_parts.len());

    for i in 0..len {
        let l = left_parts.get(i).copied().unwrap_or(0);
        let r = right_parts.get(i).copied().unwrap_or(0);
        match r.cmp(&l) {
            Ordering::Equal => continue,
            other => return other,
        }
    }
    Ordering::Equal
}
