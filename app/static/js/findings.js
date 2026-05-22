(function () {
  const API = "";
  let findings = [];
  let selectedId = null;
  let currentSort = "date_desc";
  let currentPage = 1;
  const pageSize = 15;

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
    onChange: () => {
      currentPage = 1;
      render();
    },
    searchInput,
  });

  const originalOpenPopover = facetedFilter.openPopover.bind(facetedFilter);
  facetedFilter.openPopover = function() {
    closeSortPopover();
    originalOpenPopover();
  };
  const sortLabels = {
    "severity_desc": "Severity: Critical to Low",
    "severity_asc": "Severity: Low to Critical",
    "date_desc": "Date: Newest First",
    "date_asc": "Date: Oldest First"
  };

  const originalUpdateFilterUI = facetedFilter.updateFilterUI.bind(facetedFilter);
  facetedFilter.updateFilterUI = function() {
    originalUpdateFilterUI();

    const activeFiltersEl = document.getElementById("findings-active-filters");
    if (!activeFiltersEl) return;

    // Do not show the sort active chip by default if it is set to the default sort ('date_desc')
    if (currentSort === "date_desc") {
      return;
    }

    const sortLabel = sortLabels[currentSort] || "Date: Newest First";
    const sortChipHtml = `
      <button type="button" class="filter-chip" id="sort-active-chip" style="border-color: color-mix(in srgb, var(--accent) 30%, transparent);">
        <span class="filter-chip__label">Sort:</span>
        <span class="filter-chip__value" style="color: var(--accent); font-weight: 600;">${escapeHtml(sortLabel)}</span>
        <span class="filter-chip__remove" id="sort-chip-remove" aria-hidden="true">×</span>
      </button>
    `;

    if (activeFiltersEl.classList.contains("is-hidden")) {
      activeFiltersEl.classList.remove("is-hidden");
      activeFiltersEl.innerHTML = sortChipHtml;
    } else {
      const clearBtn = activeFiltersEl.querySelector(".filter-chip--clear");
      if (clearBtn) {
        clearBtn.insertAdjacentHTML("beforebegin", sortChipHtml);
      } else {
        activeFiltersEl.insertAdjacentHTML("beforeend", sortChipHtml);
      }
    }

    document.getElementById("sort-active-chip")?.addEventListener("click", (e) => {
      if (e.target.id === "sort-chip-remove") {
        e.stopPropagation();
        currentSort = "date_desc";
        currentPage = 1;
        updateSortUI();
        render();
      } else {
        e.stopPropagation();
        toggleSortPopover();
      }
    });

    document.getElementById("findings-clear-all-filters")?.addEventListener("click", () => {
      currentSort = "date_desc";
      currentPage = 1;
      updateSortUI();
    });
  };
  document.getElementById("drawer-close")?.addEventListener("click", closeDrawer);
  drawer?.addEventListener("click", (e) => {
    if (e.target === drawer) closeDrawer();
  });

  async function load() {
    try {
      const res = await SOCAuth.authFetch(`${API}/api/findings`);
      if (!res.ok) throw new Error("Failed");
      findings = await res.json();

      // Parse URL query parameters to pre-populate filters
      const params = new URLSearchParams(window.location.search);
      const severityParam = params.get("severity");
      if (severityParam) {
        severityParam.split(",").forEach(s => {
          // Normalize to capitalized words if needed, but match standard labels
          filters.severity.add(s);
        });
      }
      const statusParam = params.get("status");
      if (statusParam) {
        statusParam.split(",").forEach(s => {
          filters.workflowStatus.add(s.toUpperCase());
        });
      }
      const repoParam = params.get("repo");
      if (repoParam) {
        repoParam.split(",").forEach(r => {
          filters.repository.add(r);
        });
      }
      const searchParam = params.get("search") || params.get("q");
      if (searchParam && searchInput) {
        searchInput.value = searchParam;
      }
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
    const filtered = FindingsFilters.apply(findings, filters, searchInput?.value);
    const severityWeight = {
      "critical": 4,
      "high": 3,
      "medium": 2,
      "low": 1
    };

    filtered.sort((a, b) => {
      if (currentSort === "severity_desc") {
        const wA = severityWeight[(a.severity || "").toLowerCase()] || 0;
        const wB = severityWeight[(b.severity || "").toLowerCase()] || 0;
        if (wB !== wA) return wB - wA;
        const tA = a.time ? new Date(a.time).getTime() : 0;
        const tB = b.time ? new Date(b.time).getTime() : 0;
        return tB - tA;
      } else if (currentSort === "severity_asc") {
        const wA = severityWeight[(a.severity || "").toLowerCase()] || 0;
        const wB = severityWeight[(b.severity || "").toLowerCase()] || 0;
        if (wA !== wB) return wA - wB;
        const tA = a.time ? new Date(a.time).getTime() : 0;
        const tB = b.time ? new Date(b.time).getTime() : 0;
        return tB - tA;
      } else if (currentSort === "date_asc") {
        const tA = a.time ? new Date(a.time).getTime() : 0;
        const tB = b.time ? new Date(b.time).getTime() : 0;
        return tA - tB;
      } else { // "date_desc"
        const tA = a.time ? new Date(a.time).getTime() : 0;
        const tB = b.time ? new Date(b.time).getTime() : 0;
        return tB - tA;
      }
    });

    return filtered;
  }

  function render() {
    facetedFilter.updateFilterUI();
    const filtered = getFiltered();
    countEl.textContent = `Showing ${filtered.length} of ${findings.length} findings`;

    let paginationContainer = document.getElementById("findings-pagination");

    if (!filtered.length) {
      tbody.innerHTML = `<tr class="soc-table-empty"><td colspan="6">No findings match your filters</td></tr>`;
      if (paginationContainer) paginationContainer.innerHTML = "";
      return;
    }

    if (!paginationContainer) {
      paginationContainer = document.createElement("div");
      paginationContainer.id = "findings-pagination";
      tableWrap.appendChild(paginationContainer);
    }

    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    tbody.innerHTML = paginated
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

    renderPagination(paginationContainer, filtered.length, currentPage, pageSize, (newPage) => {
      currentPage = newPage;
      render();
    });
  }

  function workflowStatusBadge(item, statusKey) {
    const label = item.status || "OPEN";
    return `<span class="badge workflow-status-badge ${statusClass(label)}">${escapeHtml(label)}</span>`;
  }

  function buildOverviewSection(item) {
    const statusKey = (item.status || "OPEN").toLowerCase().replace(/-/g, "_");

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
      {
        label: "created_at",
        show: Boolean(item.time),
        value: item.time ? new Date(item.time).toLocaleString() : null,
      },
      { label: "line_number", value: item.lineNumber, show: item.lineNumber != null },
    ];

    const kvHtml = drawerRows(rows);

    // Source URL + File Path — side-by-side 50/50 row
    const sourceHtml = item.sourceUrl
      ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer"
            class="drawer-kv__value--mono drawer-split__link" title="${escapeHtml(item.sourceUrl)}">Open in repository ↗</a>`
      : `<span class="drawer-split__empty">—</span>`;

    const fileHtml = item.filePath
      ? `<code class="drawer-code" title="${escapeHtml(item.filePath)}">${escapeHtml(item.filePath)}</code>`
      : `<span class="drawer-split__empty">—</span>`;

    const splitRow = `
      <div class="drawer-split-row">
        <div class="drawer-split-row__half">
          <span class="drawer-kv__label">Source Url</span>
          <span class="drawer-kv__value">${sourceHtml}</span>
        </div>
        <div class="drawer-split-row__half">
          <span class="drawer-kv__label">File Path</span>
          <span class="drawer-kv__value">${fileHtml}</span>
        </div>
      </div>`;

    return kvHtml + splitRow;
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
    const authorName = item.authorName || "unknown";
    const authorEmail = item.authorEmail || "unknown";

    const samePerson =
      authorEmail &&
      item.committerEmail &&
      authorEmail === item.committerEmail &&
      item.authorName === item.committerName;

    return drawerRows([
      { label: "branch_name", value: item.branchName, show: Boolean(item.branchName) },
      { label: "author_name", value: authorName, show: true },
      {
        label: "author_email",
        show: true,
        html: `<span class="drawer-kv__value--mono">${escapeHtml(authorEmail)}</span>`,
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
    const rowClass = label === "file_path"
      ? " drawer-kv__row--path"
      : label === "source_url"
        ? " drawer-kv__row--full"
        : "";
    return `
      <div class="drawer-kv__row${rowClass}">
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
    if (validation) sections.push(drawerSection("Validation", validation, true));
    if (git) sections.push(drawerSection("Git & ownership", git, true));
    sections.push(
      drawerSection("Audit trail", `<p class="drawer-empty">Loading history…</p>`, true)
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

  function showSortMenu() {
    const menu = document.getElementById("findings-sort-menu");
    const severityDetail = document.getElementById("findings-sort-detail-severity");
    const dateDetail = document.getElementById("findings-sort-detail-date");

    if (menu) menu.classList.remove("is-hidden");
    if (severityDetail) severityDetail.classList.add("is-hidden");
    if (dateDetail) dateDetail.classList.add("is-hidden");
  }

  function openSortDetail(category) {
    const menu = document.getElementById("findings-sort-menu");
    const severityDetail = document.getElementById("findings-sort-detail-severity");
    const dateDetail = document.getElementById("findings-sort-detail-date");

    if (menu) menu.classList.add("is-hidden");

    if (category === "severity") {
      if (severityDetail) severityDetail.classList.remove("is-hidden");
      if (dateDetail) dateDetail.classList.add("is-hidden");
    } else if (category === "date") {
      if (severityDetail) severityDetail.classList.add("is-hidden");
      if (dateDetail) dateDetail.classList.remove("is-hidden");
    }
  }

  function closeSortPopover() {
    const sortToggle = document.getElementById("findings-sort-toggle");
    const sortPopover = document.getElementById("findings-sort-popover");
    if (sortPopover) {
      sortPopover.classList.add("is-hidden");
      sortToggle?.setAttribute("aria-expanded", "false");
      showSortMenu();
    }
  }

  function openSortPopover() {
    const sortToggle = document.getElementById("findings-sort-toggle");
    const sortPopover = document.getElementById("findings-sort-popover");
    if (sortPopover) {
      sortPopover.classList.remove("is-hidden");
      sortToggle?.setAttribute("aria-expanded", "true");
      showSortMenu();
      // Close filter popover for mutual exclusion
      facetedFilter.closePopover();
    }
  }

  function toggleSortPopover() {
    const sortPopover = document.getElementById("findings-sort-popover");
    if (sortPopover) {
      if (sortPopover.classList.contains("is-hidden")) {
        openSortPopover();
      } else {
        closeSortPopover();
      }
    }
  }

  function updateSortUI() {
    const options = document.querySelectorAll(".sort-popover__option-btn");
    options.forEach((btn) => {
      const val = btn.dataset.sortVal;
      const checkIcon = btn.querySelector(".sort-check-icon");
      if (checkIcon) {
        if (val === currentSort) {
          checkIcon.classList.remove("is-hidden");
        } else {
          checkIcon.classList.add("is-hidden");
        }
      }
    });
  }

  function initSort() {
    const sortToggle = document.getElementById("findings-sort-toggle");
    const sortPopover = document.getElementById("findings-sort-popover");

    if (sortToggle && sortPopover) {
      sortToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleSortPopover();
      });

      // Bind category transitions
      const catButtons = document.querySelectorAll(".sort-popover__cat-btn");
      catButtons.forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const cat = btn.dataset.sortCat;
          if (cat) {
            openSortDetail(cat);
          }
        });
      });

      // Bind back transitions
      const backButtons = document.querySelectorAll(".sort-popover__back-btn");
      backButtons.forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          showSortMenu();
        });
      });

      const options = document.querySelectorAll(".sort-popover__option-btn");
      options.forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const sortVal = btn.dataset.sortVal;
          if (sortVal) {
            currentSort = sortVal;
            updateSortUI();
            closeSortPopover();
            render();
          }
        });
      });

      // Bind clear buttons
      const clearButtons = document.querySelectorAll(".sort-popover__clear-btn");
      clearButtons.forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          currentSort = "date_desc";
          updateSortUI();
          closeSortPopover();
          render();
        });
      });

      updateSortUI();
    }

    // Mutual exclusion: close sort popover when filter toggle is clicked
    document.getElementById("findings-filter-toggle")?.addEventListener("click", () => {
      closeSortPopover();
    });

    // Close sort popover when click occurs outside sort panel
    document.addEventListener("click", (e) => {
      const sortPanel = document.getElementById("findings-sort-panel");
      if (sortPopover && !sortPopover.classList.contains("is-hidden")) {
        if (sortPanel && !sortPanel.contains(e.target)) {
          closeSortPopover();
        }
      }
    });
  }

  initSort();
  load();
})();
