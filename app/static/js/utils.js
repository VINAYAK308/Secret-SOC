function escapeHtml(str) {
  const el = document.createElement("div");
  el.textContent = str;
  return el.innerHTML;
}

function severityClass(level) {
  const map = {
    Critical: "severity-critical",
    High: "severity-high",
    Medium: "severity-medium",
    Low: "severity-low",
  };
  return map[level] || "severity-low";
}

function statusClass(status) {
  const key = (status || "OPEN").toLowerCase().replace("-", "_");
  return `status-${key}`;
}
