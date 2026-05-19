(function () {
  const API = "";
  let findings = [];
  let selectedId = null;

  const tbody = document.getElementById("findings-tbody");
  const loading = document.getElementById("findings-loading");
  const tableWrap = document.getElementById("findings-table-wrap");
  const countEl = document.getElementById("findings-count");
  const drawer = document.getElementById("finding-drawer");
  const drawerContent = document.getElementById("drawer-content");

  const searchInput = document.getElementById("findings-search");

  const filters = FindingsFilters.createFilters();
  const facetedFilter = FindingsFilters.createFaceted({
    prefix: "findings",
    getFindings: () => findings,
    filters,
    onChange: render,
    searchInput,
  });

  document.getElementById("drawer-close")?.addEventListener("click", closeDrawer);
  drawer?.addEventListener("click", (e) => {
    if (e.target === drawer) closeDrawer();
  });

  async function load() {
    try {
      const res = await SOCAuth.authFetch(`${API}/api/findings`);
      if (!res.ok) throw new Error("Failed");
      findings = await res.json();
    } catch (err) {
      console.error(err);
      findings = [];
    } finally {
      loading.classList.add("is-hidden");
      tableWrap.classList.remove("is-hidden");
      facetedFilter.updateFilterUI();
      render();
    }
  }

  function getFiltered() {
    return FindingsFilters.apply(findings, filters, searchInput?.value);
  }

  function render() {
    const filtered = getFiltered();
    countEl.textContent = `Showing ${filtered.length} of ${findings.length} findings`;

    if (!filtered.length) {
      tbody.innerHTML = `<tr class="soc-table-empty"><td colspan="6">No findings match your filters</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered
      .map((item) => {
        const fp = item.filePath || "";
        const shortPath = fp.length > 30 ? fp.substring(0, 27) + "..." : fp;
        const githubUrl =
          item.sourceUrl ||
          `https://github.com/your-github-org/${item.repo}/blob/main/${encodeURIComponent(fp)}`;
        const isSelected = selectedId === item.id;
        const statusKey = (item.status || "OPEN").toLowerCase().replace("-", "_");

        return `
          <tr class="soc-row-clickable ${isSelected ? "soc-row-selected" : ""}" data-id="${item.id}">
            <td><strong>${escapeHtml(item.secretType || "—")}</strong></td>
            <td class="cell-muted">${escapeHtml(item.repo || "")}</td>
            <td>
              <div class="cell-actions">
                <code class="theme-code cell-mono">${escapeHtml(shortPath)}</code>
                <a href="${escapeHtml(githubUrl)}" target="_blank" rel="noopener noreferrer" class="cell-link" onclick="event.stopPropagation()" aria-label="Open in repository">↗</a>
              </div>
            </td>
            <td><span class="badge ${severityClass(item.severity)}">${escapeHtml(item.severity)}</span></td>
            <td>${workflowStatusBadge(item, statusKey)}</td>
            <td class="cell-muted cell-mono">${item.time ? new Date(item.time).toLocaleDateString() : ""}</td>
          </tr>`;
      })
      .join("");

    tbody.querySelectorAll("tr[data-id]").forEach((row) => {
      row.addEventListener("click", () => openDrawer(Number(row.dataset.id)));
    });

  }

  function workflowStatusBadge(item, statusKey) {
    const label = item.status || "OPEN";
    return `<span class="badge workflow-status-badge ${statusClass(label)}">${escapeHtml(label)}</span>`;
  }

  function buildOverviewSection(item) {
    const statusKey = (item.status || "OPEN").toLowerCase().replace(/-/g, "_");
    const filePathRow = item.filePath
      ? {
          label: "file_path",
          html: `<code class="drawer-code">${escapeHtml(item.filePath)}</code>`,
        }
      : { label: "file_path", value: null };

    const rows = [
      { label: "secret_type", value: item.secretType },
      { label: "risk_score", value: item.riskScore, show: item.riskScore != null },
      { label: "verdict", value: item.verdict, show: Boolean(item.verdict) },
      { label: "confidence", value: item.confidence, show: item.confidence != null },
      { label: "secret_status", html: workflowStatusBadge(item, statusKey) },
      {
        label: "is_active",
        value: item.isActive === true ? "true" : item.isActive === false ? "false" : null,
      },
      { label: "repository", value: item.repo },
      filePathRow,
      { label: "line_number", value: item.lineNumber, show: item.lineNumber != null },
      {
        label: "source_url",
        show: Boolean(item.sourceUrl),
        html: item.sourceUrl
          ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer" class="drawer-kv__value--mono">Open in repository ↗</a>`
          : null,
      },
      {
        label: "created_at",
        show: Boolean(item.time),
        value: item.time ? new Date(item.time).toLocaleString() : null,
      },
    ];

    return drawerRows(rows);
  }

  function buildValidationSection(item) {
    const validationKv = drawerRows([
      { label: "verdict", value: item.verdict, show: Boolean(item.verdict) },
      { label: "confidence", value: item.confidence, show: item.confidence != null },
      { label: "risk_score", value: item.riskScore, show: item.riskScore != null },
    ]);
    const evidenceBlock = item.evidence?.length
      ? `<div class="drawer-field"><span class="drawer-field__label">${formatLabel("evidence")}</span><ul class="drawer-list">${item.evidence.map((ev) => `<li>${escapeHtml(ev)}</li>`).join("")}</ul></div>`
      : "";
    const reasoningBlock =
      item.reasoning
        ? `<div class="drawer-field"><span class="drawer-field__label">${formatLabel("reasoning")}</span><p class="drawer-prose">${escapeHtml(item.reasoning)}</p></div>`
        : "";
    const body = `${validationKv}${evidenceBlock}${reasoningBlock}`;
    return body || "";
  }

  function buildGitSection(item) {
    const samePerson =
      item.authorEmail &&
      item.committerEmail &&
      item.authorEmail === item.committerEmail &&
      item.authorName === item.committerName;

    return drawerRows([
      { label: "branch_name", value: item.branchName, show: Boolean(item.branchName) },
      { label: "author_name", value: item.authorName, show: Boolean(item.authorName) },
      {
        label: "author_email",
        show: Boolean(item.authorEmail),
        html: item.authorEmail
          ? `<span class="drawer-kv__value--mono">${escapeHtml(item.authorEmail)}</span>`
          : null,
      },
      {
        label: "committer_name",
        value: item.committerName,
        show: Boolean(item.committerName) && !samePerson,
      },
      {
        label: "committer_email",
        show: Boolean(item.committerEmail) && !samePerson,
        html: item.committerEmail
          ? `<span class="drawer-kv__value--mono">${escapeHtml(item.committerEmail)}</span>`
          : null,
      },
    ]);
  }

  function formatLabel(key) {
    return String(key)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function drawerSection(title, bodyHtml, open = false) {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const bodyId = `drawer-section-body-${slug}`;
    const openClass = open ? " drawer-section--open" : "";
    return `
      <section class="drawer-section${openClass}" data-drawer-section="${escapeHtml(slug)}">
        <button
          type="button"
          class="drawer-section__toggle"
          aria-expanded="${open ? "true" : "false"}"
          aria-controls="${bodyId}"
        >
          <span class="drawer-section__chevron" aria-hidden="true"></span>
          <span class="drawer-section__title-text">${escapeHtml(title)}</span>
        </button>
        <div id="${bodyId}" class="drawer-section__body">${bodyHtml}</div>
      </section>`;
  }

  function bindDrawerAccordions() {
    drawerContent.querySelectorAll(".drawer-section__toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const section = btn.closest(".drawer-section");
        if (!section) return;
        const isOpen = section.classList.toggle("drawer-section--open");
        btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
      });
    });
  }

  function kvRow(label, valueHtml) {
    return `
      <div class="drawer-kv__row">
        <span class="drawer-kv__label">${formatLabel(label)}</span>
        <span class="drawer-kv__value">${valueHtml}</span>
      </div>`;
  }

  function drawerValue(value) {
    if (value === null || value === undefined || value === "") return "—";
    return escapeHtml(String(value));
  }

  function drawerRowsInner(rows) {
    return rows
      .filter((row) => row.show !== false)
      .map((row) => kvRow(row.label, row.html ?? drawerValue(row.value)))
      .join("");
  }

  function drawerRows(rows) {
    const html = drawerRowsInner(rows);
    return html ? `<div class="drawer-kv">${html}</div>` : "";
  }

  function formatHistoryHtml(entries) {
    if (!entries?.length) {
      return `<p class="drawer-empty">No status changes recorded yet.</p>`;
    }
    return `<ul class="audit-timeline">${entries
      .map((e) => {
        const when = e.changedAt ? new Date(e.changedAt).toLocaleString() : "";
        const from = e.oldStatus ? escapeHtml(e.oldStatus) : "—";
        const to = escapeHtml(e.newStatus || "");
        const by = e.changedBy ? escapeHtml(e.changedBy) : "—";
        const reason = e.changeReason
          ? `<span class="audit-timeline__meta">${escapeHtml(e.changeReason)}</span>`
          : "";
        return `<li class="audit-timeline__item">
          <span class="audit-timeline__time">${escapeHtml(when)}</span>
          <span class="audit-timeline__change">${from} → <strong>${to}</strong></span>
          <span class="audit-timeline__meta">changed_by: ${by}</span>
          ${reason}
        </li>`;
      })
      .join("")}</ul>`;
  }

  async function loadHistory(findingId) {
    try {
      const res = await SOCAuth.authFetch(`${API}/api/findings/${findingId}/history`);
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }

  async function openDrawer(id) {
    selectedId = id;
    const item = findings.find((f) => f.id === id);
    if (!item) return;

    const subtitle = document.getElementById("drawer-subtitle");
    if (subtitle) {
      const parts = [item.repo, item.status].filter(Boolean);
      subtitle.textContent = parts.length ? parts.join(" · ") : "Finding details";
    }

    const sections = [];
    const overview = buildOverviewSection(item);
    const validation = buildValidationSection(item);
    const git = buildGitSection(item);

    if (overview) sections.push(drawerSection("Overview", overview, true));
    if (validation) sections.push(drawerSection("Validation", validation, false));
    if (git) sections.push(drawerSection("Git & ownership", git, false));
    sections.push(
      drawerSection("Audit trail", `<p class="drawer-empty">Loading history…</p>`, false)
    );

    drawerContent.innerHTML = sections.join("");
    bindDrawerAccordions();

    drawer.classList.remove("is-hidden");
    drawer.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    render();

    const history = await loadHistory(id);
    const auditSection = drawerContent.querySelector('[data-drawer-section="audit-trail"]');
    if (auditSection) {
      auditSection.querySelector(".drawer-section__body").innerHTML =
        formatHistoryHtml(history);
    }
  }

  function closeDrawer() {
    selectedId = null;
    drawer.classList.add("is-hidden");
    drawer.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    const subtitle = document.getElementById("drawer-subtitle");
    if (subtitle) subtitle.textContent = "Select a row to inspect";
    render();
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !drawer.classList.contains("is-hidden")) {
      closeDrawer();
    }
  });

  load();
})();
