// ===== SANITIZE HELPERS =====
// Anything that comes from the database or an API must go through these
// before being placed inside an HTML template string.

// Turn characters that have meaning in HTML into harmless text,
// so "<img onerror=...>" displays as text instead of running.
function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Only allow http(s) links. Blocks "javascript:..." and "data:..." URLs,
// which escaping alone can't stop. Returns "" if the URL isn't safe.
function safeUrl(value) {
  if (!value) return "";
  try {
    const parsed = new URL(String(value));
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return escapeHtml(parsed.href);
    }
  } catch (e) {
    // Not a valid absolute URL
  }
  return "";
}

// Turn an error into text that's safe to show visitors. Messages we threw
// ourselves from the server's JSON ({ error: "..." }) pass through; browser
// network failures ("Failed to fetch") and unexpected responses get a
// generic message instead, so nothing about the backend leaks.
function friendlyError(err, fallback = "Something went wrong. Please try again.") {
  if (!err || err instanceof TypeError || err instanceof SyntaxError) return fallback;
  return err.message || fallback;
}

// Colored age pill for cards and popups. Only one of three fixed values is
// ever rendered, so this is safe to put in HTML; unknown values show "All Ages".
const AGE_BADGE_CLASSES = { "All Ages": "age-all", "18+": "age-18", "21+": "age-21" };

function ageBadge(value) {
  const label = AGE_BADGE_CLASSES[value] ? value : "All Ages";
  return `<span class="age-badge ${AGE_BADGE_CLASSES[label]}">${label}</span>`;
}
