(function () {
  const summaryEl = document.getElementById("alerts-summary");
  const loading = document.getElementById("alerts-loading");
  const empty = document.getElementById("alerts-empty");
  const tableWrap = document.getElementById("alerts-table-wrap");
  const tbody = document.getElementById("alerts-tbody");

  const TABLE_COLUMNS = [
    { key: "alert_state", label: "alert_state" },
    { key: "secret_id", label: "secret_id" },
    { key: "repo_name", label: "repo_name" },
    { key: "secret_type", label: "secret_type" },
    { key: "tool", label: "tool" },
    { key: "file_path", label: "file_path" },
    { key: "line_number", label: "line_number" },
    { key: "notify_email", label: "notify_email" },
    { key: "commit_hash", label: "commit_hash", mono: true },
    { key: "author_name", label: "author_name" },
    { key: "committer_name", label: "committer_name" },
    { key: "secret_status", label: "secret_status" },
    { key: "is_active", label: "is_active" },
    { key: "last_sent_at", label: "last_sent_at" },
    { key: "alert_count", label: "alert_count" },
    { key: "fingerprint", label: "fingerprint", mono: true },
    { key: "reasoning", label: "reasoning" },
  ];

  function cellValue(row, key) {
    const val = row[key];
    if (val === null || val === undefined || val === "") return "—";
    if (key === "is_active") return val === true ? "true" : val === false ? "false" : "—";
    if (key === "last_sent_at") return new Date(val).toLocaleString();
    return String(val);
  }

  async function load() {
    try {
      const [queueRes, summaryRes] = await Promise.all([
        SOCAuth.authFetch("/api/alerts/queue"),
        SOCAuth.authFetch("/api/alerts/summary"),
      ]);
      if (!queueRes.ok || !summaryRes.ok) throw new Error("Failed");
      const queue = await queueRes.json();
      const summary = await summaryRes.json();
      renderSummary(summary);
      renderTable(queue);
    } catch (err) {
      console.error(err);
      renderSummary({ needs_initial: 0, needs_reminder: 0 });
      renderTable([]);
    } finally {
      loading.classList.add("is-hidden");
    }
  }

  function renderSummary(s) {
    if (!summaryEl) return;
    summaryEl.innerHTML = `
      <article class="stat-card">
        <p class="stat-card__label">needs_initial</p>
        <p class="stat-card__value">${s.needs_initial ?? 0}</p>
      </article>
      <article class="stat-card">
        <p class="stat-card__label">needs_reminder</p>
        <p class="stat-card__value">${s.needs_reminder ?? 0}</p>
      </article>`;
  }

  function renderTable(rows) {
    if (!rows.length) {
      tableWrap.classList.add("is-hidden");
      empty.classList.remove("is-hidden");
      return;
    }
    empty.classList.add("is-hidden");
    tableWrap.classList.remove("is-hidden");

    const thead = document.querySelector("#alerts-table-wrap thead tr");
    if (thead) {
      thead.innerHTML = TABLE_COLUMNS.map(
        (col) => `<th>${escapeHtml(col.label)}</th>`
      ).join("");
    }

    tbody.innerHTML = rows
      .map((row) => {
        const cells = TABLE_COLUMNS.map((col) => {
          const text = cellValue(row, col.key);
          const cls = col.mono ? "cell-mono cell-muted" : "";
          if (col.key === "secret_status" && row.secret_status) {
            return `<td><span class="badge ${statusClass(row.secret_status)}">${escapeHtml(row.secret_status)}</span></td>`;
          }
          if (col.key === "alert_state" && row.alert_state) {
            return `<td><span class="scan-status scan-status--unknown">${escapeHtml(row.alert_state)}</span></td>`;
          }
          return `<td class="${cls}">${escapeHtml(text)}</td>`;
        }).join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");
  }

  load();
})();
