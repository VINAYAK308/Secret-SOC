(function () {
  const tbody = document.getElementById("repos-tbody");
  const loading = document.getElementById("repos-loading");
  const tableWrap = document.getElementById("repos-table-wrap");
  const empty = document.getElementById("repos-empty");
  const countEl = document.getElementById("repos-count");
  const searchInput = document.getElementById("repos-search");

  let repositories = [];
  let pollTimer = null;
  let currentPage = 1;
  const pageSize = 10;

  const filters = {
    repositories: new Set(),
    scanStatus: new Set(),
    findings: new Set(),
    lastScan: new Set(),
  };

  const filterDefs = [
    {
      id: "repositories",
      label: "Repository",
      icon: "folder",
      options: () =>
        repositories.map((r) => ({
          value: r.name,
          label: r.name,
          sublabel: (r.url || "").replace(/^https?:\/\/github\.com\//, ""),
        })),
    },
    {
      id: "scanStatus",
      label: "Last scan status",
      icon: "scan",
      options: () => [
        { value: "running", label: "Running" },
        { value: "completed", label: "Completed" },
        { value: "failed", label: "Failed" },
        { value: "unknown", label: "Unknown" },
      ],
    },
    {
      id: "findings",
      label: "Findings",
      icon: "alert",
      options: () => [
        { value: "has", label: "Has findings" },
        { value: "none", label: "No findings" },
      ],
    },
    {
      id: "lastScan",
      label: "Last scan date",
      icon: "calendar",
      options: () => [
        { value: "never", label: "Never scanned" },
        { value: "24h", label: "Last 24 hours" },
        { value: "7d", label: "Last 7 days" },
        { value: "30d", label: "Last 30 days" },
        { value: "older", label: "Older than 30 days" },
      ],
    },
  ];

  const facetedFilter = new FacetedFilter({
    prefix: "repos",
    filterDefs,
    filters,
    onChange: () => {
      currentPage = 1;
      render();
    },
  });

  searchInput?.addEventListener("input", () => {
    currentPage = 1;
    render();
  });

  function matchesLastScan(repo, value) {
    if (!repo.lastScanTime) return value === "never";
    const diffMs = Date.now() - new Date(repo.lastScanTime).getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (value === "24h") return diffDays <= 1;
    if (value === "7d") return diffDays <= 7;
    if (value === "30d") return diffDays <= 30;
    if (value === "older") return diffDays > 30;
    return true;
  }

  function getFiltered() {
    const q = (searchInput?.value || "").toLowerCase();

    return repositories.filter((r) => {
      const matchesSearch =
        !q ||
        (r.name || "").toLowerCase().includes(q) ||
        (r.url || "").toLowerCase().includes(q);
      if (!matchesSearch) return false;

      if (filters.repositories.size && !filters.repositories.has(r.name)) return false;

      const status = (r.lastScanStatus || "unknown").toLowerCase();
      if (filters.scanStatus.size && !filters.scanStatus.has(status)) return false;

      if (filters.findings.size) {
        const has = (r.totalFindings || 0) > 0;
        if (filters.findings.has("has") && !has) return false;
        if (filters.findings.has("none") && has) return false;
      }

      if (filters.lastScan.size) {
        const ok = [...filters.lastScan].some((v) => matchesLastScan(r, v));
        if (!ok) return false;
      }

      return true;
    });
  }

  function scanStatusBadge(status) {
    const key = (status || "unknown").toLowerCase();
    const labels = {
      running: "Running",
      completed: "Completed",
      failed: "Failed",
      unknown: "Unknown",
    };
    const cls =
      key === "running"
        ? "scan-status--running"
        : key === "completed"
          ? "scan-status--completed"
          : key === "failed"
            ? "scan-status--failed"
            : "scan-status--unknown";
    return `<span class="scan-status ${cls}">${escapeHtml(labels[key] || status)}</span>`;
  }

  function render() {
    const filtered = getFiltered();
    countEl.textContent = `Showing ${filtered.length} of ${repositories.length} repositories`;

    let paginationContainer = document.getElementById("repos-pagination");

    if (!filtered.length) {
      tableWrap.classList.add("is-hidden");
      empty.classList.remove("is-hidden");
      if (paginationContainer) paginationContainer.innerHTML = "";
      return;
    }

    empty.classList.add("is-hidden");
    tableWrap.classList.remove("is-hidden");

    if (!paginationContainer) {
      paginationContainer = document.createElement("div");
      paginationContainer.id = "repos-pagination";
      tableWrap.appendChild(paginationContainer);
    }

    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    tbody.innerHTML = paginated
      .map((repo) => {
        const displayUrl = (repo.url || "").replace("https://github.com/", "");
        const findingsClass =
          repo.totalFindings > 0 ? "badge-count--danger" : "badge-count--ok";
        const lastScan = repo.lastScanTime
          ? new Date(repo.lastScanTime).toLocaleDateString()
          : "Never";

        return `
          <tr>
            <td>
              <strong>${escapeHtml(repo.name)}</strong>
              <br />
              <a href="${escapeHtml(repo.url || "#")}" target="_blank" rel="noopener noreferrer" class="cell-link cell-mono">${escapeHtml(displayUrl || "Unknown repository")}</a>
            </td>
            <td><span class="badge ${findingsClass}">${repo.totalFindings}</span></td>
            <td>${scanStatusBadge(repo.lastScanStatus)}</td>
            <td class="cell-muted cell-mono" title="${repo.lastScanTime ? new Date(repo.lastScanTime).toLocaleString() : "Never"}">${lastScan}</td>
          </tr>`;
      })
      .join("");

    renderPagination(paginationContainer, filtered.length, currentPage, pageSize, (newPage) => {
      currentPage = newPage;
      render();
    });
  }

  async function load() {
    try {
      const res = await SOCAuth.authFetch("/api/repositories");
      if (!res.ok) throw new Error("Failed");
      repositories = await res.json();
    } catch (err) {
      console.error(err);
      repositories = [];
    } finally {
      loading.classList.add("is-hidden");
      facetedFilter.updateFilterUI();
      render();
      schedulePoll();
    }
  }

  function schedulePoll() {
    if (pollTimer) clearInterval(pollTimer);
    const hasRunning = repositories.some((r) => r.lastScanStatus === "running");
    if (!hasRunning) return;
    pollTimer = setInterval(load, 4000);
  }

  load();
})();
