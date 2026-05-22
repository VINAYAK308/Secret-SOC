/**
 * Shared faceted filters + filtering logic for findings data.
 */
window.FindingsFilters = {
  createFilters() {
    return {
      severity: new Set(),
      workflowStatus: new Set(),
      repository: new Set(),
      detected: new Set(),
      verdict: new Set(),
      active: new Set(),
    };
  },

  buildFilterDefs(getFindings) {
    const uniqueRepos = () =>
      [...new Set(getFindings().map((f) => f.repo).filter(Boolean))].sort();
    const uniqueVerdicts = () =>
      [...new Set(getFindings().map((f) => f.verdict).filter(Boolean))].sort();

    return [
      {
        id: "severity",
        label: "Severity",
        icon: "severity",
        options: () => [
          { value: "Critical", label: "Critical" },
          { value: "High", label: "High" },
          { value: "Medium", label: "Medium" },
          { value: "Low", label: "Low" },
        ],
      },
      {
        id: "workflowStatus",
        label: "Workflow status",
        icon: "status",
        options: () => [
          { value: "OPEN", label: "OPEN" },
          { value: "IN_PROGRESS", label: "IN_PROGRESS" },
          { value: "RESOLVED", label: "RESOLVED" },
          { value: "ACCEPTED_RISK", label: "ACCEPTED_RISK" },
        ],
      },
      {
        id: "repository",
        label: "Repository",
        icon: "folder",
        options: () => uniqueRepos().map((name) => ({ value: name, label: name })),
      },
      {
        id: "detected",
        label: "Detected",
        icon: "calendar",
        options: () => [
          { value: "24h", label: "Last 24 hours" },
          { value: "7d", label: "Last 7 days" },
          { value: "30d", label: "Last 30 days" },
          { value: "older", label: "Older than 30 days" },
        ],
      },
      {
        id: "verdict",
        label: "Verdict",
        icon: "verdict",
        options: () =>
          uniqueVerdicts().map((v) => ({
            value: v,
            label: v.replace(/_/g, " "),
          })),
      },
      {
        id: "active",
        label: "Secret state",
        icon: "active",
        options: () => [
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ],
      },
    ];
  },

  matchesDetected(item, value) {
    if (!item.time) return value === "older";
    const diffMs = Date.now() - new Date(item.time).getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (value === "24h") return diffHours <= 24;
    if (value === "7d") return diffDays <= 7;
    if (value === "30d") return diffDays <= 30;
    if (value === "older") return diffDays > 30;
    return true;
  },

  apply(findings, filters, searchQuery) {
    const search = (searchQuery || "").toLowerCase();

    return findings.filter((item) => {
      const matchesSearch =
        !search ||
        (item.secretType || "").toLowerCase().includes(search) ||
        (item.repo || "").toLowerCase().includes(search) ||
        (item.committerEmail || "").toLowerCase().includes(search) ||
        (item.filePath || "").toLowerCase().includes(search);

      if (!matchesSearch) return false;

      if (filters.severity.size && !filters.severity.has(item.severity)) return false;

      if (filters.workflowStatus.size && !filters.workflowStatus.has(item.status)) return false;

      if (filters.repository.size && !filters.repository.has(item.repo)) return false;

      if (filters.detected.size) {
        const ok = [...filters.detected].some((v) => this.matchesDetected(item, v));
        if (!ok) return false;
      }

      if (filters.verdict.size && !filters.verdict.has(item.verdict)) return false;

      if (filters.active.size) {
        const isActive = Boolean(item.isActive);
        if (filters.active.has("active") && !isActive) return false;
        if (filters.active.has("inactive") && isActive) return false;
      }

      return true;
    });
  },

  createFaceted({ prefix, getFindings, filters, onChange, searchInput }) {
    const filterDefs = this.buildFilterDefs(getFindings);
    const facetedFilter = new FacetedFilter({
      prefix,
      filterDefs,
      filters,
      onChange,
    });
    if (searchInput) searchInput.addEventListener("input", onChange);
    return facetedFilter;
  },

  computeStats(filtered) {
    const repos = new Set(filtered.map((f) => f.repo).filter(Boolean));
    return {
      totalSecrets: filtered.length,
      criticalExposures: filtered.filter((f) => f.severity === "Critical").length,
      activeIncidents: filtered.filter((f) => f.status === "OPEN" || f.status === "IN_PROGRESS").length,
      repositoriesScanned: repos.size,
      scannedReposList: [...repos].sort(),
    };
  },

  /* Dashboard: Repository, Date, Time only (aligned with Repositories page) */
  createDashboardFilters() {
    return {
      repository: new Set(),
      date: new Set(),
      time: new Set(),
      riskRepoLimit: new Set(),
    };
  },

  buildDashboardFilterDefs(getFindings) {
    const uniqueRepos = () =>
      [...new Set(getFindings().map((f) => f.repo).filter(Boolean))].sort();

    return [
      {
        id: "repository",
        label: "Repository",
        icon: "folder",
        options: () => uniqueRepos().map((name) => ({ value: name, label: name })),
      },
      {
        id: "date",
        label: "Date",
        icon: "calendar",
        options: () => [
          { value: "7d", label: "Last 7 days" },
          { value: "30d", label: "Last 30 days" },
          { value: "older", label: "Older than 30 days" },
        ],
      },
      {
        id: "time",
        label: "Time",
        icon: "clock",
        options: () => [{ value: "24h", label: "Last 24 hours" }],
      },
      {
        id: "riskRepoLimit",
        label: "Repository limit",
        icon: "alert",
        options: () => [
          { value: "5", label: "Top 5" },
          { value: "10", label: "Top 10" },
          { value: "15", label: "Top 15" },
          { value: "20", label: "Top 20" },
        ],
      },
    ];
  },

  matchesDate(item, value) {
    if (!item.time) return value === "older";
    const diffDays = (Date.now() - new Date(item.time).getTime()) / (1000 * 60 * 60 * 24);
    if (value === "7d") return diffDays <= 7;
    if (value === "30d") return diffDays <= 30;
    if (value === "older") return diffDays > 30;
    return true;
  },

  matchesTime(item, value) {
    if (!item.time) return false;
    const diffHours = (Date.now() - new Date(item.time).getTime()) / (1000 * 60 * 60);
    if (value === "24h") return diffHours <= 24;
    return true;
  },

  applyDashboard(findings, filters) {
    return findings.filter((item) => {
      if (filters.repository.size && !filters.repository.has(item.repo)) return false;

      if (filters.date.size) {
        const ok = [...filters.date].some((v) => this.matchesDate(item, v));
        if (!ok) return false;
      }

      if (filters.time.size) {
        const ok = [...filters.time].some((v) => this.matchesTime(item, v));
        if (!ok) return false;
      }

      return true;
    });
  },

  createDashboardFaceted({ prefix, getFindings, filters, onChange, searchInput }) {
    const filterDefs = this.buildDashboardFilterDefs(getFindings);
    const facetedFilter = new FacetedFilter({
      prefix,
      filterDefs,
      filters,
      onChange,
    });
    if (searchInput) searchInput.addEventListener("input", onChange);
    return facetedFilter;
  },

  computeTrend(filtered) {
    const byDate = new Map();

    for (const item of filtered) {
      if (!item.time) continue;
      const d = new Date(item.time);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!byDate.has(key)) {
        byDate.set(key, { total: 0, critical: 0, high: 0, medium: 0, low: 0 });
      }
      const bucket = byDate.get(key);
      bucket.total++;
      const sev = item.severity || "Low";
      if (sev === "Critical") bucket.critical++;
      else if (sev === "High") bucket.high++;
      else if (sev === "Medium") bucket.medium++;
      else bucket.low++;
    }

    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30)
      .map(([dateKey, counts]) => ({
        date: new Date(dateKey + "T12:00:00").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        ...counts,
      }));
  },

  computeRiskyRepos(filtered, limit = 10) {
    const repoBuckets = new Map();

    for (const item of filtered) {
      if ((item.status === "OPEN" || item.status === "IN_PROGRESS") && item.isActive) {
        const repo = item.repo || "unknown";
        if (!repoBuckets.has(repo)) {
          repoBuckets.set(repo, { total: 0, critical: 0, high: 0, medium: 0, low: 0 });
        }
        const bucket = repoBuckets.get(repo);
        bucket.total++;
        const sev = item.severity || "Low";
        if (sev === "Critical") bucket.critical++;
        else if (sev === "High") bucket.high++;
        else if (sev === "Medium") bucket.medium++;
        else bucket.low++;
      }
    }

    return [...repoBuckets.entries()]
      .map(([name, counts]) => ({ name, ...counts }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  },

  computeSecretTypes(filtered) {
    const buckets = {};
    for (const item of filtered) {
      if ((item.status === "OPEN" || item.status === "IN_PROGRESS") && item.isActive) {
        const type = item.secretType || "Unknown Secret";
        buckets[type] = (buckets[type] || 0) + 1;
      }
    }
    return Object.entries(buckets)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  },
};

