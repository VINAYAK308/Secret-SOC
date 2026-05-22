(function () {
  let findings = [];
  let drilldownState = null;

  const loading = document.getElementById("dashboard-loading");
  const content = document.getElementById("dashboard-content");
  const filters = FindingsFilters.createDashboardFilters();
  const facetedFilter = FindingsFilters.createDashboardFaceted({
    prefix: "dashboard",
    getFindings: () => findings,
    filters,
    onChange: () => {
      drilldownState = null;

      // Enforce single-select for riskRepoLimit
      if (filters.riskRepoLimit.size > 1) {
        const lastVal = [...filters.riskRepoLimit].pop();
        filters.riskRepoLimit.clear();
        filters.riskRepoLimit.add(lastVal);
        facetedFilter.updateFilterUI();
      }

      refreshDashboard();
    },
  });
  facetedFilter.closePopover();

  const resetBtn = document.getElementById("risky-reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      drilldownState = null;
      refreshDashboard();
    });
  }

  function getFiltered() {
    return FindingsFilters.applyDashboard(findings, filters);
  }

  function getChartColors() {
    const style = getComputedStyle(document.documentElement);
    return {
      grid: "color-mix(in srgb, " + (style.getPropertyValue("--muted").trim() || "#94a3b8") + " 25%, transparent)",
      tick: style.getPropertyValue("--muted").trim() || "#94a3b8",
      card: style.getPropertyValue("--card").trim() || "#0f172a",
    };
  }

  function getSeverityColors() {
    const isLight = document.documentElement.classList.contains("light");
    if (isLight) {
      return {
        critical: { bg: "rgba(239, 68, 68, 0.8)", border: "#b91c1c" },
        high: { bg: "rgba(249, 115, 22, 0.8)", border: "#c2410c" },
        medium: { bg: "rgba(234, 179, 8, 0.8)", border: "#a16207" },
        low: { bg: "rgba(34, 197, 94, 0.8)", border: "#15803d" },
      };
    } else {
      return {
        critical: { bg: "rgba(239, 68, 68, 0.45)", border: "#ef4444" },
        high: { bg: "rgba(249, 115, 22, 0.45)", border: "#f97316" },
        medium: { bg: "rgba(234, 179, 8, 0.45)", border: "#eab308" },
        low: { bg: "rgba(34, 197, 94, 0.45)", border: "#22c55e" },
      };
    }
  }

  function refreshDashboard() {
    const filtered = getFiltered();
    const stats = FindingsFilters.computeStats(filtered);
    document.getElementById("stat-total").textContent = stats.totalSecrets;
    document.getElementById("stat-critical").textContent = stats.criticalExposures;
    document.getElementById("stat-incidents").textContent = stats.activeIncidents;
    document.getElementById("stat-repos").textContent = stats.repositoriesScanned;

    renderTrend(filtered);
    renderRiskyRepos(filtered);
    renderSecretTypes(filtered);
    renderAlerts(filtered);
    facetedFilter.updateFilterUI();
  }

  function renderTrend(filtered) {
    const canvas = document.getElementById("trend-chart");
    const empty = document.getElementById("trend-empty");
    const chartWrap = document.getElementById("trend-chart-wrap");

    const data = FindingsFilters.computeTrend(filtered);

    if (!data.length) {
      chartWrap.classList.add("is-hidden");
      empty.classList.remove("is-hidden");
      if (window.trendChartInstance) {
        window.trendChartInstance.destroy();
        window.trendChartInstance = null;
      }
      return;
    }

    empty.classList.add("is-hidden");
    chartWrap.classList.remove("is-hidden");

    const colors = getChartColors();

    if (window.trendChartInstance) {
      window.trendChartInstance.destroy();
    }

    window.trendChartInstance = new Chart(canvas, {
      type: "line",
      data: {
        labels: data.map((d) => d.date),
        datasets: [
          {
            label: "Total Secrets",
            data: data.map((d) => d.total),
            borderColor: "#3b82f6",
            borderWidth: 3,
            tension: 0.35,
            pointRadius: 4,
            pointBackgroundColor: colors.card,
          },
          {
            label: "Critical",
            data: data.map((d) => d.critical),
            borderColor: "#ef4444",
            borderWidth: 2,
            tension: 0.35,
            pointRadius: 0,
          },
          {
            label: "High",
            data: data.map((d) => d.high),
            borderColor: "#f97316",
            borderWidth: 2,
            tension: 0.35,
            pointRadius: 0,
          },
          {
            label: "Medium",
            data: data.map((d) => d.medium),
            borderColor: "#eab308",
            borderWidth: 2,
            tension: 0.35,
            pointRadius: 0,
          },
          {
            label: "Low",
            data: data.map((d) => d.low),
            borderColor: "#22c55e",
            borderWidth: 2,
            tension: 0.35,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        animation: {
          duration: 1200,
          easing: "easeOutQuart",
        },
        animations: {
          y: { enabled: false },
          x: {
            type: "number",
            easing: "linear",
            duration: 400,
            from: NaN,
            delay(ctx) {
              if (ctx.type !== "data") return 0;
              return ctx.dataIndex * 60;
            },
          },
        },
        plugins: {
          legend: { labels: { color: colors.tick, usePointStyle: true, padding: 16 } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const n = ctx.parsed.y;
                const name = ctx.dataset.label || "Secrets";
                return `${name}: ${n} secret${n === 1 ? "" : "s"}`;
              },
            },
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "Date",
              color: colors.tick,
              font: { size: 12, weight: "500" },
            },
            grid: { color: colors.grid },
            ticks: { color: colors.tick },
          },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: "Secret count",
              color: colors.tick,
              font: { size: 12, weight: "500" },
            },
            grid: { color: colors.grid },
            ticks: {
              color: colors.tick,
              precision: 0,
              stepSize: 1,
              callback: (value) => (Number.isInteger(value) ? value : ""),
            },
          },
        },
      },
    });
  }

  function renderRiskyRepos(filtered) {
    const canvas = document.getElementById("risky-chart");
    const empty = document.getElementById("risky-empty");
    const chartWrap = document.getElementById("risky-chart-wrap");

    const titleEl = document.getElementById("risky-title");
    const subtitleEl = document.getElementById("risky-subtitle");
    const resetBtn = document.getElementById("risky-reset");

    const colors = getChartColors();
    const severityColors = getSeverityColors();

    if (drilldownState) {
      // 1. Filter findings for this repository & severity
      const repoFiltered = filtered.filter(item => 
        item.repo === drilldownState.repo &&
        item.severity === drilldownState.severity &&
        (item.status === "OPEN" || item.status === "IN_PROGRESS") &&
        item.isActive
      );

      // 2. Aggregate by secret type
      const typeCounts = {};
      for (const item of repoFiltered) {
        const type = item.secretType || "Unknown Secret";
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      }

      const drilldownData = Object.entries(typeCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      // If no data, show empty
      if (!drilldownData.length) {
        chartWrap.classList.add("is-hidden");
        empty.classList.remove("is-hidden");
        if (window.riskyChartInstance) {
          window.riskyChartInstance.destroy();
          window.riskyChartInstance = null;
        }
        if (titleEl) titleEl.textContent = `Secrets in ${drilldownState.repo}`;
        if (subtitleEl) subtitleEl.textContent = `Breakdown by secret type for active ${drilldownState.severity} exposures`;
        if (resetBtn) resetBtn.classList.remove("is-hidden");
        return;
      }

      empty.classList.add("is-hidden");
      chartWrap.classList.remove("is-hidden");

      if (titleEl) titleEl.textContent = `Secrets in ${drilldownState.repo}`;
      if (subtitleEl) subtitleEl.textContent = `Breakdown by secret type for active ${drilldownState.severity} exposures`;
      if (resetBtn) resetBtn.classList.remove("is-hidden");

      if (window.riskyChartInstance) {
        window.riskyChartInstance.destroy();
      }

      const sevColor = severityColors[drilldownState.severity.toLowerCase()] || severityColors.low;

      window.riskyChartInstance = new Chart(canvas, {
        type: "bar",
        data: {
          labels: drilldownData.map((d) => d.name),
          datasets: [
            {
              label: drilldownState.severity,
              data: drilldownData.map((d) => d.count),
              backgroundColor: sevColor.bg,
              borderColor: sevColor.border,
              borderWidth: 1,
              borderRadius: 4,
            }
          ]
        },
        options: {
          indexAxis: "x",
          responsive: true,
          maintainAspectRatio: false,
          animation: {
            duration: 1200,
            easing: "easeOutQuart",
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const n = ctx.parsed.y;
                  return `${ctx.label}: ${n} active exposure${n === 1 ? "" : "s"}`;
                },
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: colors.tick },
            },
            y: {
              title: {
                display: true,
                text: "Active Exposures",
                color: colors.tick,
                font: { size: 12, weight: "500" },
              },
              grid: { color: colors.grid },
              ticks: { color: colors.tick, precision: 0, stepSize: 1 },
            },
          },
        }
      });

    } else {
      // Inactive (Default View)
      if (titleEl) titleEl.textContent = "Repository Exposure Profile";
      if (subtitleEl) subtitleEl.textContent = "Top repositories by active secret exposures";
      if (resetBtn) resetBtn.classList.add("is-hidden");

      const activeLimits = [...filters.riskRepoLimit];
      const repoLimit = activeLimits.length ? parseInt(activeLimits[0], 10) : 10;

      const data = FindingsFilters.computeRiskyRepos(filtered, repoLimit);

      if (!data.length) {
        chartWrap.classList.add("is-hidden");
        empty.classList.remove("is-hidden");
        if (window.riskyChartInstance) {
          window.riskyChartInstance.destroy();
          window.riskyChartInstance = null;
        }
        return;
      }

      empty.classList.add("is-hidden");
      chartWrap.classList.remove("is-hidden");

      if (window.riskyChartInstance) {
        window.riskyChartInstance.destroy();
      }

      window.riskyChartInstance = new Chart(canvas, {
        type: "bar",
        data: {
          labels: data.map((d) => d.name),
          datasets: [
            {
              label: "Low",
              data: data.map((d) => d.low),
              backgroundColor: severityColors.low.bg,
              borderColor: severityColors.low.border,
              borderWidth: 1,
              borderRadius: 4,
            },
            {
              label: "Medium",
              data: data.map((d) => d.medium),
              backgroundColor: severityColors.medium.bg,
              borderColor: severityColors.medium.border,
              borderWidth: 1,
              borderRadius: 4,
            },
            {
              label: "High",
              data: data.map((d) => d.high),
              backgroundColor: severityColors.high.bg,
              borderColor: severityColors.high.border,
              borderWidth: 1,
              borderRadius: 4,
            },
            {
              label: "Critical",
              data: data.map((d) => d.critical),
              backgroundColor: severityColors.critical.bg,
              borderColor: severityColors.critical.border,
              borderWidth: 1,
              borderRadius: 4,
            },
          ],
        },
        options: {
          indexAxis: "x",
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          animation: {
            duration: 1200,
            easing: "easeOutQuart",
          },
          onHover: (event, activeElements) => {
            event.chart.canvas.style.cursor = activeElements.length ? "pointer" : "default";
          },
          onClick: (event, activeElements, chart) => {
            const active = chart.getElementsAtEventForMode(event.native || event, 'nearest', { intersect: true }, true);
            if (active && active.length > 0) {
              const first = active[0];
              const repoName = chart.data.labels[first.index];
              const datasetIndex = first.datasetIndex;
              const severity = chart.data.datasets[datasetIndex].label;

              drilldownState = { repo: repoName, severity: severity };
              refreshDashboard();
            }
          },
          plugins: {
            legend: { labels: { color: colors.tick, usePointStyle: true, padding: 16 } },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const n = ctx.parsed.y;
                  const name = ctx.dataset.label || "";
                  return `${name}: ${n} active exposure${n === 1 ? "" : "s"}`;
                },
              },
            },
          },
          scales: {
            x: {
              stacked: true,
              grid: { display: false },
              ticks: { color: colors.tick },
            },
            y: {
              stacked: true,
              title: {
                display: true,
                text: "Active Exposures",
                color: colors.tick,
                font: { size: 12, weight: "500" },
              },
              grid: { color: colors.grid },
              ticks: { color: colors.tick, precision: 0, stepSize: 1 },
            },
          },
        },
      });
    }
  }

  function getDoughnutColors(count) {
    const isLight = document.documentElement.classList.contains("light");
    // Vibrant glassmorphic colors
    const colors = [
      { bg: "rgba(59, 130, 246, 0.55)", border: "#3b82f6" },   // Blue
      { bg: "rgba(139, 92, 246, 0.55)", border: "#8b5cf6" },  // Purple
      { bg: "rgba(236, 72, 153, 0.55)", border: "#ec4899" },  // Pink
      { bg: "rgba(20, 184, 166, 0.55)", border: "#14b8a6" },  // Teal
      { bg: "rgba(245, 158, 11, 0.55)", border: "#f59e0b" },  // Amber
      { bg: "rgba(34, 197, 94, 0.55)", border: "#22c55e" },   // Green
      { bg: "rgba(99, 102, 241, 0.55)", border: "#6366f1" },  // Indigo
      { bg: "rgba(239, 68, 68, 0.55)", border: "#ef4444" },   // Red
    ];
    
    const colorsLight = [
      { bg: "rgba(59, 130, 246, 0.8)", border: "#2563eb" },
      { bg: "rgba(139, 92, 246, 0.8)", border: "#7c3aed" },
      { bg: "rgba(236, 72, 153, 0.8)", border: "#db2777" },
      { bg: "rgba(20, 184, 166, 0.8)", border: "#0d9488" },
      { bg: "rgba(245, 158, 11, 0.8)", border: "#d97706" },
      { bg: "rgba(34, 197, 94, 0.8)", border: "#16a34a" },
      { bg: "rgba(99, 102, 241, 0.8)", border: "#4f46e5" },
      { bg: "rgba(239, 68, 68, 0.8)", border: "#dc2626" },
    ];

    const activePalette = isLight ? colorsLight : colors;
    
    const result = [];
    for (let i = 0; i < count; i++) {
      result.push(activePalette[i % activePalette.length]);
    }
    return result;
  }

  function renderSecretTypes(filtered) {
    const canvas = document.getElementById("types-chart");
    const empty = document.getElementById("types-empty");
    const chartWrap = document.getElementById("types-chart-wrap");

    const colors = getChartColors();
    const data = FindingsFilters.computeSecretTypes(filtered);

    if (!data.length) {
      chartWrap.classList.add("is-hidden");
      empty.classList.remove("is-hidden");
      if (window.typesChartInstance) {
        window.typesChartInstance.destroy();
        window.typesChartInstance = null;
      }
      return;
    }

    empty.classList.add("is-hidden");
    chartWrap.classList.remove("is-hidden");

    if (window.typesChartInstance) {
      window.typesChartInstance.destroy();
    }

    const total = data.reduce((sum, d) => sum + d.count, 0);
    const palette = getDoughnutColors(data.length);

    window.typesChartInstance = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: data.map((d) => d.name),
        datasets: [
          {
            data: data.map((d) => d.count),
            backgroundColor: palette.map((p) => p.bg),
            borderColor: palette.map((p) => p.border),
            borderWidth: 1,
            hoverOffset: 6,
          },
        ],
      },
      plugins: [
        {
          id: "typesCenterText",
          beforeDraw(chart) {
            const { ctx } = chart;
            const meta = chart.getDatasetMeta(0);
            if (!meta || !meta.data || !meta.data.length) return;

            const firstSlice = meta.data[0];
            const x = typeof firstSlice.x === "number" ? firstSlice.x : (chart.chartArea.left + chart.chartArea.right) / 2;
            const y = typeof firstSlice.y === "number" ? firstSlice.y : (chart.chartArea.top + chart.chartArea.bottom) / 2;

            ctx.save();

            ctx.textBaseline = "middle";
            ctx.textAlign = "center";

            const isLight = document.documentElement.classList.contains("light");
            const valColor = isLight ? "#0f172a" : "#f8fafc";
            const lblColor = isLight ? "#64748b" : "#94a3b8";

            // Dynamically scale font size and offsets according to inner radius of the cutout hole
            const innerRadius = (meta.data[0] && meta.data[0].innerRadius) || 60;
            const valFontSize = Math.max(14, Math.round(innerRadius * 0.4));
            const lblFontSize = Math.max(8, Math.round(innerRadius * 0.17));
            const verticalOffsetVal = Math.round(innerRadius * 0.12);
            const verticalOffsetLbl = Math.round(innerRadius * 0.22);

            // Draw Value (Total Count)
            ctx.font = `bold ${valFontSize}px sans-serif`;
            ctx.fillStyle = valColor;
            ctx.fillText(total, x, y - verticalOffsetVal);

            // Draw Label ("Total Secrets")
            ctx.font = `600 ${lblFontSize}px sans-serif`;
            ctx.fillStyle = lblColor;
            ctx.fillText("Total Secrets", x, y + verticalOffsetLbl);

            ctx.restore();
          },
        },
      ],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "60%",
        animation: {
          duration: 1200,
          easing: "easeOutQuart",
        },
        plugins: {
          legend: {
            position: window.innerWidth < 640 ? "bottom" : "right",
            labels: {
              color: colors.tick,
              usePointStyle: true,
              padding: window.innerWidth < 640 ? 8 : 12,
              font: { size: 11 },
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const n = ctx.parsed;
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const percent = ((n / total) * 100).toFixed(1);
                return ` ${ctx.label}: ${n} active (${percent}%)`;
              },
            },
          },
        },
      },
    });
  }

  function renderAlerts(filtered) {
    const canvas = document.getElementById("alerts-chart");
    const empty = document.getElementById("alerts-empty");
    const chartWrap = document.getElementById("alerts-chart-wrap");

    if (!canvas || !empty || !chartWrap) return;

    const colors = getChartColors();
    const isLight = document.documentElement.classList.contains("light");

    // Aggregate counts
    let needsInitial = 0;
    let needsReminder = 0;
    let mailSent = 0;

    for (const item of filtered) {
      if (item.alertState === "needs_initial") {
        needsInitial++;
      } else if (item.alertState === "needs_reminder") {
        needsReminder++;
      } else if (item.alertState === "waiting") {
        mailSent++;
      }
    }

    const data = [];
    if (needsInitial > 0) data.push({ name: "Need Initial Mail", count: needsInitial, type: "needs_initial" });
    if (needsReminder > 0) data.push({ name: "Need Reminder", count: needsReminder, type: "needs_reminder" });
    if (mailSent > 0) data.push({ name: "Mail Sent", count: mailSent, type: "mail_sent" });

    if (!data.length) {
      chartWrap.classList.add("is-hidden");
      empty.classList.remove("is-hidden");
      if (window.alertsChartInstance) {
        window.alertsChartInstance.destroy();
        window.alertsChartInstance = null;
      }
      return;
    }

    empty.classList.add("is-hidden");
    chartWrap.classList.remove("is-hidden");

    if (window.alertsChartInstance) {
      window.alertsChartInstance.destroy();
    }

    // Set matching semantic colors based on theme
    const palette = data.map(d => {
      if (d.type === "needs_initial") {
        return isLight 
          ? { bg: "rgba(245, 158, 11, 0.85)", border: "#d97706" } // Amber
          : { bg: "rgba(245, 158, 11, 0.55)", border: "#f59e0b" };
      } else if (d.type === "needs_reminder") {
        return isLight
          ? { bg: "rgba(99, 102, 241, 0.85)", border: "#4f46e5" } // Indigo
          : { bg: "rgba(99, 102, 241, 0.55)", border: "#6366f1" };
      } else {
        return isLight
          ? { bg: "rgba(16, 185, 129, 0.85)", border: "#059669" } // Emerald/Teal/Green
          : { bg: "rgba(16, 185, 129, 0.55)", border: "#10b981" };
      }
    });

    const total = needsInitial + needsReminder + mailSent;

    window.alertsChartInstance = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: data.map((d) => d.name),
        datasets: [
          {
            data: data.map((d) => d.count),
            backgroundColor: palette.map((p) => p.bg),
            borderColor: palette.map((p) => p.border),
            borderWidth: 1,
            hoverOffset: 6,
          },
        ],
      },
      plugins: [
        {
          id: "alertsCenterText",
          beforeDraw(chart) {
            const { ctx } = chart;
            const meta = chart.getDatasetMeta(0);
            if (!meta || !meta.data || !meta.data.length) return;

            // In Chart.js, the center coordinates of the doughnut slices (meta.data[0])
            // represent the exact mathematical center of the entire doughnut chart hole.
            const firstSlice = meta.data[0];
            const x = typeof firstSlice.x === "number" ? firstSlice.x : (chart.chartArea.left + chart.chartArea.right) / 2;
            const y = typeof firstSlice.y === "number" ? firstSlice.y : (chart.chartArea.top + chart.chartArea.bottom) / 2;

            ctx.save();

            ctx.textBaseline = "middle";
            ctx.textAlign = "center";

            const isLight = document.documentElement.classList.contains("light");
            const valColor = isLight ? "#0f172a" : "#f8fafc";
            const lblColor = isLight ? "#64748b" : "#94a3b8";

            // Dynamically scale font size and offsets according to inner radius of the cutout hole
            const innerRadius = (meta.data[0] && meta.data[0].innerRadius) || 60;
            const valFontSize = Math.max(14, Math.round(innerRadius * 0.4));
            const lblFontSize = Math.max(8, Math.round(innerRadius * 0.17));
            const verticalOffsetVal = Math.round(innerRadius * 0.12);
            const verticalOffsetLbl = Math.round(innerRadius * 0.22);

            // Draw Value (Total Count)
            ctx.font = `bold ${valFontSize}px sans-serif`;
            ctx.fillStyle = valColor;
            ctx.fillText(total, x, y - verticalOffsetVal);

            // Draw Label ("Total Alerts")
            ctx.font = `600 ${lblFontSize}px sans-serif`;
            ctx.fillStyle = lblColor;
            ctx.fillText("Total Alerts", x, y + verticalOffsetLbl);

            ctx.restore();
          },
        },
      ],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "60%",
        animation: {
          duration: 1200,
          easing: "easeOutQuart",
        },
        plugins: {
          legend: {
            position: window.innerWidth < 640 ? "bottom" : "right",
            labels: {
              color: colors.tick,
              usePointStyle: true,
              padding: window.innerWidth < 640 ? 8 : 12,
              font: { size: 11 },
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const n = ctx.parsed;
                const totalVal = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const percent = ((n / totalVal) * 100).toFixed(1);
                return ` ${ctx.label}: ${n} active (${percent}%)`;
              },
            },
          },
        },
      },
    });
  }

  async function fetchAndRenderScanStats() {
    const canvas = document.getElementById("scans-chart");
    const empty = document.getElementById("scans-empty");
    const chartWrap = document.getElementById("scans-chart-wrap");

    if (!canvas || !empty || !chartWrap) return;

    try {
      const response = await SOCAuth.authFetch("/api/scan/stats");
      if (!response.ok) throw new Error("Failed to fetch scan stats");
      const data = await response.json();

      if (!data || !data.length) {
        chartWrap.classList.add("is-hidden");
        empty.classList.remove("is-hidden");
        if (window.scansChartInstance) {
          window.scansChartInstance.destroy();
          window.scansChartInstance = null;
        }
        return;
      }

      empty.classList.add("is-hidden");
      chartWrap.classList.remove("is-hidden");

      if (window.scansChartInstance) {
        window.scansChartInstance.destroy();
      }

      const colors = getChartColors();
      const isLight = document.documentElement.classList.contains("light");

      const labels = data.map(d => d.repoName);
      const completedData = data.map(d => d.completed);
      const failedData = data.map(d => d.failed);
      const runningData = data.map(d => d.running);

      window.scansChartInstance = new Chart(canvas, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            {
              label: "Completed",
              data: completedData,
              backgroundColor: isLight ? "rgba(34, 197, 94, 0.8)" : "rgba(34, 197, 94, 0.45)",
              borderColor: isLight ? "#16a34a" : "#22c55e",
              borderWidth: 1,
              borderRadius: 4,
            },
            {
              label: "Failed",
              data: failedData,
              backgroundColor: isLight ? "rgba(239, 68, 68, 0.8)" : "rgba(239, 68, 68, 0.45)",
              borderColor: isLight ? "#dc2626" : "#ef4444",
              borderWidth: 1,
              borderRadius: 4,
            },
            {
              label: "Running",
              data: runningData,
              backgroundColor: isLight ? "rgba(245, 158, 11, 0.8)" : "rgba(245, 158, 11, 0.45)",
              borderColor: isLight ? "#d97706" : "#f59e0b",
              borderWidth: 1,
              borderRadius: 4,
            },
          ],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          animation: {
            duration: 1200,
            easing: "easeOutQuart",
          },
          plugins: {
            legend: {
              labels: { color: colors.tick, usePointStyle: true, padding: 16 }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const n = ctx.parsed.x;
                  const name = ctx.dataset.label || "";
                  return `${name}: ${n} scan${n === 1 ? "" : "s"}`;
                },
              },
            },
          },
          scales: {
            x: {
              stacked: true,
              grid: { color: colors.grid },
              ticks: { color: colors.tick, precision: 0 },
              title: {
                display: true,
                text: "Scan Runs Count",
                color: colors.tick,
                font: { size: 12, weight: "500" },
              },
            },
            y: {
              stacked: true,
              grid: { display: false },
              ticks: { color: colors.tick },
            },
          },
        },
      });
    } catch (error) {
      console.error("Error rendering scan stats:", error);
      chartWrap.classList.add("is-hidden");
      empty.classList.remove("is-hidden");
    }
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatIsoDateSafe(dateVal) {
    if (!dateVal) return "";
    try {
      const d = new Date(dateVal);
      if (!isNaN(d.getTime())) {
        return d.toISOString();
      }
    } catch (e) {
      console.warn("Failed to parse ISO date:", dateVal, e);
    }
    return String(dateVal);
  }

  function formatLocalDateSafe(dateVal) {
    if (!dateVal) return "—";
    try {
      const d = new Date(dateVal);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString();
      }
    } catch (e) {
      console.warn("Failed to parse local date:", dateVal, e);
    }
    return String(dateVal);
  }

  function triggerCSVExport() {
    const filtered = getFiltered();
    const headers = [
      "Finding ID",
      "Secret Type",
      "Repository",
      "File Path",
      "Line Number",
      "Severity",
      "Status",
      "Verdict",
      "Is Active",
      "Author Name",
      "Author Email",
      "Commit Hash",
      "Detected At"
    ];

    const rows = filtered.map(item => [
      item.id || "",
      item.secretType || "",
      item.repo || "",
      item.filePath || "",
      item.lineNumber || "",
      item.severity || "",
      item.status || "",
      item.verdict || "",
      item.isActive ? "TRUE" : "FALSE",
      item.authorName || "unknown",
      item.authorEmail || "unknown",
      item.commitHash || "",
      item.time ? formatIsoDateSafe(item.time) : ""
    ]);

    const csvContent = [
      headers.map(h => `"${h}"`).join(","),
      ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute("download", `secret_soc_report_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function triggerPDFExport() {
    const win = window.open("", "_blank");
    if (!win) {
      alert("Please allow pop-ups for this website to print reports.");
      return;
    }
    const filtered = getFiltered();
    const stats = FindingsFilters.computeStats(filtered);
    
    // Compute filter text
    const repoFilterText = filters.repository.size ? [...filters.repository].join(", ") : "All Repositories";
    const dateFilterText = filters.date.size ? [...filters.date].map(v => v === "7d" ? "Last 7 days" : v === "30d" ? "Last 30 days" : "Older than 30 days").join(", ") : "Any Time";
    const timeFilterText = filters.time.size ? [...filters.time].map(v => v === "24h" ? "Last 24 hours" : v).join(", ") : "Any Hour";

    // Compute secret types distribution
    const secretTypes = FindingsFilters.computeSecretTypes(filtered);
    let typesTableBody = "";
    if (secretTypes.length === 0) {
      typesTableBody = `<tr><td colspan="3" style="text-align: center; color: var(--muted); padding: 1.5rem 0;">No active secret types.</td></tr>`;
    } else {
      typesTableBody = secretTypes.slice(0, 10).map(item => {
        const pct = stats.totalSecrets ? ((item.count / stats.totalSecrets) * 100).toFixed(1) : 0;
        return `
          <tr>
            <td><strong>${escapeHtml(item.name)}</strong></td>
            <td style="text-align: center; font-weight: 600;">${item.count}</td>
            <td>
              <div class="progress-bar-wrap">
                <span style="min-width: 2.5rem; font-weight: 600; text-align: right;">${pct}%</span>
                <div class="progress-bar-bg">
                  <div class="progress-bar-fill" style="width: ${pct}%"></div>
                </div>
              </div>
            </td>
          </tr>
        `;
      }).join("");
    }

    // Compute repositories exposure profiles
    const repoBuckets = new Map();
    for (const item of filtered) {
      if ((item.status === "OPEN" || item.status === "IN_PROGRESS") && item.isActive) {
        const r = item.repo || "unknown";
        if (!repoBuckets.has(r)) {
          repoBuckets.set(r, { total: 0, critical: 0, high: 0, medium: 0, low: 0 });
        }
        const b = repoBuckets.get(r);
        b.total++;
        const sev = item.severity || "Low";
        if (sev === "Critical") b.critical++;
        else if (sev === "High") b.high++;
        else if (sev === "Medium") b.medium++;
        else b.low++;
      }
    }
    const topRepos = [...repoBuckets.entries()]
      .map(([name, counts]) => ({ name, ...counts }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    let reposTableBody = "";
    if (topRepos.length === 0) {
      reposTableBody = `<tr><td colspan="3" style="text-align: center; color: var(--muted); padding: 1.5rem 0;">No active repository exposures.</td></tr>`;
    } else {
      reposTableBody = topRepos.map(r => {
        const t = r.total || 1;
        const critPct = ((r.critical / t) * 100).toFixed(1);
        const highPct = ((r.high / t) * 100).toFixed(1);
        const medPct = ((r.medium / t) * 100).toFixed(1);
        const lowPct = ((r.low / t) * 100).toFixed(1);
        
        return `
          <tr>
            <td><strong>${escapeHtml(r.name)}</strong></td>
            <td style="text-align: center; font-weight: 600;">${r.total}</td>
            <td>
              <div style="display: flex; align-items: center; gap: 0.75rem; width: 100%;">
                <div class="multi-bar">
                  <div class="multi-bar__segment" style="width: ${critPct}%; background-color: var(--critical);" title="Critical: ${r.critical}"></div>
                  <div class="multi-bar__segment" style="width: ${highPct}%; background-color: var(--high);" title="High: ${r.high}"></div>
                  <div class="multi-bar__segment" style="width: ${medPct}%; background-color: var(--medium);" title="Medium: ${r.medium}"></div>
                  <div class="multi-bar__segment" style="width: ${lowPct}%; background-color: var(--low);" title="Low: ${r.low}"></div>
                </div>
                <span style="font-size: 0.75rem; color: var(--muted); font-weight: 500;">
                  C:${r.critical} H:${r.high} M:${r.medium} L:${r.low}
                </span>
              </div>
            </td>
          </tr>
        `;
      }).join("");
    }

    // Detailed Exposures
    const limitFindings = filtered.slice(0, 150);
    let detailedRows = "";
    if (limitFindings.length === 0) {
      detailedRows = `<tr><td colspan="7" style="text-align: center; color: var(--muted); padding: 2.5rem 0;">No secrets match the current filters.</td></tr>`;
    } else {
      detailedRows = limitFindings.map(item => {
        const timeStr = formatLocalDateSafe(item.time);
        const fp = item.filePath || "";
        const shortPath = fp.length > 50 ? fp.substring(0, 47) + "..." : fp;
        const sevClass = `badge--${item.severity ? item.severity.toLowerCase() : "low"}`;
        
        let statusClass = "badge--open";
        if (item.status === "IN_PROGRESS") statusClass = "badge--progress";
        else if (item.status === "RESOLVED") statusClass = "badge--resolved";
        else if (item.status === "ACCEPTED_RISK") statusClass = "badge--risk";

        return `
          <tr>
            <td><strong>${item.id}</strong></td>
            <td><strong>${escapeHtml(item.secretType || "—")}</strong></td>
            <td style="color: var(--muted);">${escapeHtml(item.repo || "")}</td>
            <td><code>${escapeHtml(shortPath)}</code></td>
            <td><span class="badge ${sevClass}">${escapeHtml(item.severity || "Low")}</span></td>
            <td><span class="badge ${statusClass}">${escapeHtml(item.status || "OPEN")}</span></td>
            <td style="color: var(--muted); font-family: monospace;">${timeStr}</td>
          </tr>
        `;
      }).join("");
    }

    let limitNote = "";
    if (filtered.length > 150) {
      limitNote = `
        <div style="margin-top: 1.5rem; padding: 1rem; background-color: var(--card-bg); border: 1px dashed var(--border); border-radius: 6px; text-align: center; font-size: 0.8125rem; color: var(--muted);">
          ⚠️ Showing first 150 of <strong>${filtered.length}</strong> findings. For the complete list of raw findings, please use the <strong>CSV Report Export</strong> option.
        </div>
      `;
    }

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Secret-SOC Security Detections Report</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #1e3a8a;
      --primary-light: #eff6ff;
      --foreground: #1f2937;
      --muted: #4b5563;
      --border: #e5e7eb;
      --card-bg: #f9fafb;
      
      --critical: #ef4444;
      --high: #f97316;
      --medium: #eab308;
      --low: #22c55e;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      color: var(--foreground);
      line-height: 1.5;
      padding: 2.5rem;
      background-color: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    .header-bar {
      height: 6px;
      background: linear-gradient(90deg, #1e3a8a 0%, #3b82f6 50%, #10b981 100%);
      margin-bottom: 2rem;
      border-radius: 3px;
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid var(--border);
      padding-bottom: 1.5rem;
      margin-bottom: 2rem;
    }
    
    .header-title h1 {
      font-family: 'Outfit', sans-serif;
      font-size: 2.25rem;
      font-weight: 700;
      color: var(--primary);
      letter-spacing: -0.025em;
    }
    
    .header-title p {
      color: var(--muted);
      font-size: 0.95rem;
      margin-top: 0.35rem;
    }
    
    .meta-block {
      text-align: right;
      font-size: 0.875rem;
      color: var(--muted);
    }
    
    .meta-block div {
      margin-bottom: 0.35rem;
    }
    
    .meta-block strong {
      color: var(--foreground);
    }
    
    .filters-banner {
      background-color: var(--primary-light);
      border-left: 4px solid var(--primary);
      padding: 1.25rem;
      border-radius: 0 8px 8px 0;
      margin-bottom: 2.5rem;
      font-size: 0.875rem;
    }
    
    .filters-banner h3 {
      font-family: 'Outfit', sans-serif;
      color: var(--primary);
      font-size: 1.05rem;
      margin-bottom: 0.5rem;
      font-weight: 600;
    }
    
    .filters-banner ul {
      list-style: none;
      display: flex;
      flex-wrap: wrap;
      gap: 2rem;
    }
    
    .filters-banner li strong {
      color: var(--primary);
      font-weight: 600;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1.25rem;
      margin-bottom: 2.5rem;
    }
    
    .stat-card {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
      text-align: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    
    .stat-card__label {
      font-size: 0.8125rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
      font-weight: 600;
      margin-bottom: 0.5rem;
    }
    
    .stat-card__val {
      font-family: 'Outfit', sans-serif;
      font-size: 2.5rem;
      font-weight: 700;
      color: var(--primary);
    }
    
    .stat-card--critical .stat-card__val {
      color: var(--critical);
    }
    
    .section-title {
      font-family: 'Outfit', sans-serif;
      font-size: 1.4rem;
      color: var(--primary);
      border-bottom: 2px solid var(--border);
      padding-bottom: 0.5rem;
      margin-top: 2.5rem;
      margin-bottom: 1.25rem;
      font-weight: 600;
    }
    
    .split-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2rem;
      margin-bottom: 2.5rem;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8125rem;
      margin-bottom: 1.5rem;
    }
    
    th {
      background-color: var(--primary-light);
      color: var(--primary);
      font-weight: 600;
      text-align: left;
      padding: 0.75rem 1rem;
      border-bottom: 2px solid var(--border);
    }
    
    td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
    }
    
    tr:nth-child(even) td {
      background-color: #fcfdfe;
    }
    
    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    
    .badge--critical { background-color: #fef2f2; color: var(--critical); border: 1px solid #fee2e2; }
    .badge--high { background-color: #fff7ed; color: var(--high); border: 1px solid #ffedd5; }
    .badge--medium { background-color: #fef9c3; color: var(--medium); border: 1px solid #fef08a; }
    .badge--low { background-color: #f0fdf4; color: var(--low); border: 1px solid #dcfce7; }
    
    .badge--open { background-color: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; }
    .badge--progress { background-color: #eff6ff; color: #1d4ed8; border: 1px solid #dbeafe; }
    .badge--resolved { background-color: #ecfdf5; color: #047857; border: 1px solid #d1fae5; }
    .badge--risk { background-color: #fff7ed; color: #c2410c; border: 1px solid #ffedd5; }
    
    code {
      font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 0.75rem;
      background-color: var(--card-bg);
      padding: 0.125rem 0.35rem;
      border-radius: 3px;
      border: 1px solid var(--border);
    }
    
    .progress-bar-wrap {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    
    .progress-bar-bg {
      flex-grow: 1;
      height: 8px;
      background-color: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
      max-width: 140px;
    }
    
    .progress-bar-fill {
      height: 100%;
      background-color: var(--primary);
      border-radius: 4px;
    }
    
    .multi-bar {
      display: flex;
      height: 8px;
      background-color: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
      width: 140px;
      flex-shrink: 0;
    }
    
    .multi-bar__segment {
      height: 100%;
    }
    
    @page {
      size: letter;
      margin: 1.5cm;
    }
    
    @media print {
      body {
        padding: 0;
      }
      tr {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 2rem; background-color: #f3f4f6; padding: 1rem; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #d1d5db;">
    <span style="font-size: 0.875rem; font-weight: 500; color: #374151;">📄 Print-Ready Executive Report generated. Press "Ctrl + P" (or Cmd + P) if the browser print dialog didn't open.</span>
    <button onclick="window.print()" style="background-color: #1e3a8a; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.875rem;">Print / Save as PDF</button>
  </div>

  <div class="header-bar"></div>
  
  <header class="header">
    <div class="header-title">
      <h1>Secret-SOC Security Report</h1>
      <p>Continuous secret vulnerability detection and exposure profiling</p>
    </div>
    <div class="meta-block">
      <div>Date Generated: <strong>${new Date().toLocaleString()}</strong></div>
      <div>Role Level: <strong>${(SOCAuth.getUser()?.role || "reviewer").toUpperCase()}</strong></div>
      <div>Operator: <strong>${SOCAuth.getUser()?.username || "unknown"}</strong></div>
    </div>
  </header>
  
  <div class="filters-banner">
    <h3>Applied Report Filters</h3>
    <ul>
      <li><strong>Repository:</strong> ${escapeHtml(repoFilterText)}</li>
      <li><strong>Date Window:</strong> ${escapeHtml(dateFilterText)}</li>
      <li><strong>Time Window:</strong> ${escapeHtml(timeFilterText)}</li>
    </ul>
  </div>
  
  <div class="stats-grid">
    <article class="stat-card">
      <p class="stat-card__label">Total Secrets</p>
      <p class="stat-card__val">${stats.totalSecrets}</p>
    </article>
    <article class="stat-card stat-card--critical">
      <p class="stat-card__label">Critical Exposures</p>
      <p class="stat-card__val">${stats.criticalExposures}</p>
    </article>
    <article class="stat-card">
      <p class="stat-card__label">Active Incidents</p>
      <p class="stat-card__val">${stats.activeIncidents}</p>
    </article>
    <article class="stat-card">
      <p class="stat-card__label">Repos Scanned</p>
      <p class="stat-card__val">${stats.repositoriesScanned}</p>
    </article>
  </div>
  
  <div class="split-grid">
    <div>
      <h3 class="section-title">Top Secret Types</h3>
      <table>
        <thead>
          <tr>
            <th>Secret Type</th>
            <th style="text-align: center; width: 4rem;">Count</th>
            <th style="width: 12rem;">Distribution</th>
          </tr>
        </thead>
        <tbody>
          ${typesTableBody}
        </tbody>
      </table>
    </div>
    
    <div>
      <h3 class="section-title">Repository Exposure Profile</h3>
      <table>
        <thead>
          <tr>
            <th>Repository</th>
            <th style="text-align: center; width: 4rem;">Count</th>
            <th style="width: 14rem;">Severity Breakdown</th>
          </tr>
        </thead>
        <tbody>
          ${reposTableBody}
        </tbody>
      </table>
    </div>
  </div>
  
  <h3 class="section-title">Active Exposure Details</h3>
  <table>
    <thead>
      <tr>
        <th style="width: 3.5rem;">ID</th>
        <th>Secret Type</th>
        <th>Repository</th>
        <th>File Path</th>
        <th style="width: 6rem;">Severity</th>
        <th style="width: 7rem;">Workflow Status</th>
        <th style="width: 6rem;">Detected At</th>
      </tr>
    </thead>
    <tbody>
      ${detailedRows}
    </tbody>
  </table>
  
  ${limitNote}
  <script>
    setTimeout(() => {
      window.print();
    }, 400);
  </script>
</body>
</html>`;

    win.document.open();
    win.document.write(htmlContent);
    win.document.close();
  }

  function injectModalStyles() {
    const styleId = "soc-export-modal-styles";
    if (document.getElementById(styleId)) return;
    
    const style = document.createElement("style");
    style.id = styleId;
    style.innerHTML = `
      .soc-export-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(15, 23, 42, 0.7);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        pointer-events: none;
      }
      .soc-export-modal-overlay.is-visible {
        opacity: 1;
        pointer-events: auto;
      }
      .soc-export-modal {
        background: var(--card, #0f172a);
        border: 1px solid var(--border, #1e293b);
        border-radius: 16px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
        padding: 2.5rem 2rem;
        width: 420px;
        max-width: 90%;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 1.25rem;
        transform: scale(0.92) translateY(10px);
        transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
      }
      .light .soc-export-modal {
        background: #ffffff;
        border-color: #e2e8f0;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.1);
      }
      .soc-export-modal-overlay.is-visible .soc-export-modal {
        transform: scale(1) translateY(0);
      }
      .soc-export-modal__icon-wrap {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: rgba(59, 130, 246, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--primary, #3b82f6);
        transition: all 0.3s ease;
      }
      .soc-export-modal__icon-wrap.is-success {
        background: rgba(16, 185, 129, 0.15);
        color: #10b981;
      }
      .soc-export-modal__title {
        font-family: 'Outfit', sans-serif;
        font-size: 1.35rem;
        font-weight: 700;
        color: var(--foreground, #f8fafc);
        margin: 0;
      }
      .light .soc-export-modal__title {
        color: #0f172a;
      }
      .soc-export-modal__desc {
        font-size: 0.875rem;
        color: var(--muted, #64748b);
        margin-top: -0.25rem;
        line-height: 1.4;
      }
      .soc-export-modal__progress-container {
        width: 100%;
        height: 8px;
        background: rgba(148, 163, 184, 0.15);
        border-radius: 4px;
        overflow: hidden;
        position: relative;
        margin: 0.75rem 0;
      }
      .soc-export-modal__progress-bar {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #3b82f6 0%, #10b981 100%);
        border-radius: 4px;
        transition: width 0.05s linear;
      }
      .soc-export-modal__progress-bar.is-success {
        background: #10b981;
      }
      .soc-export-modal__percentage {
        font-family: 'Outfit', sans-serif;
        font-size: 1.75rem;
        font-weight: 700;
        color: var(--primary, #3b82f6);
        transition: color 0.3s ease;
      }
      .soc-export-modal__percentage.is-success {
        color: #10b981;
      }
      .soc-export-modal__btn {
        border: none;
        border-radius: 8px;
        padding: 0.625rem 1.75rem;
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        opacity: 0;
        transform: translateY(10px);
        display: none;
      }
      .soc-export-modal__btn.is-visible {
        display: block;
        opacity: 1;
        transform: translateY(0);
        animation: soc-fade-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .soc-export-modal__btn--primary {
        background: var(--primary, #3b82f6);
        color: #ffffff;
      }
      .soc-export-modal__btn--primary:hover {
        background: color-mix(in srgb, var(--primary, #3b82f6) 85%, #ffffff);
      }
      .soc-export-modal__btn--secondary {
        background: rgba(148, 163, 184, 0.15);
        color: var(--foreground, #f8fafc);
      }
      .light .soc-export-modal__btn--secondary {
        background: #f1f5f9;
        color: #0f172a;
      }
      .soc-export-modal__btn--secondary:hover {
        background: rgba(148, 163, 184, 0.25);
      }
      .light .soc-export-modal__btn--secondary:hover {
        background: #e2e8f0;
      }
      @keyframes soc-fade-up {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes soc-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      .soc-spin {
        animation: soc-spin 1s linear infinite;
      }
    `;
    document.head.appendChild(style);
  }

  function showExportModal(type, onComplete) {
    injectModalStyles();
    
    const oldOverlay = document.querySelector(".soc-export-modal-overlay");
    if (oldOverlay) oldOverlay.remove();
    
    const overlay = document.createElement("div");
    overlay.className = "soc-export-modal-overlay";
    
    const spinnerSvg = `<svg class="soc-spin" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>`;
    const checkSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
    
    const primaryLabel = type === "CSV" ? "Download CSV" : "Open Print Dialog";
    
    overlay.innerHTML = `
      <div class="soc-export-modal">
        <div class="soc-export-modal__icon-wrap">
          ${spinnerSvg}
        </div>
        <div class="soc-export-modal__percentage">0%</div>
        <div style="display: flex; flex-direction: column; gap: 0.25rem;">
          <h3 class="soc-export-modal__title">Generating ${type} Report</h3>
          <p class="soc-export-modal__desc">Assembling active security metrics...</p>
        </div>
        <div class="soc-export-modal__progress-container">
          <div class="soc-export-modal__progress-bar"></div>
        </div>
        <div class="soc-export-modal__actions" style="display: flex; gap: 0.75rem; width: 100%; justify-content: center; margin-top: 0.5rem;">
          <button class="soc-export-modal__btn soc-export-modal__btn--primary" id="soc-export-primary-btn" style="flex: 1; min-width: 140px; margin-top: 0;">${primaryLabel}</button>
          <button class="soc-export-modal__btn soc-export-modal__btn--secondary" id="soc-export-secondary-btn" style="flex: 1; min-width: 100px; margin-top: 0;">Dismiss</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    setTimeout(() => overlay.classList.add("is-visible"), 10);
    
    const progressBar = overlay.querySelector(".soc-export-modal__progress-bar");
    const percentLabel = overlay.querySelector(".soc-export-modal__percentage");
    const title = overlay.querySelector(".soc-export-modal__title");
    const desc = overlay.querySelector(".soc-export-modal__desc");
    const iconWrap = overlay.querySelector(".soc-export-modal__icon-wrap");
    const primaryBtn = overlay.querySelector("#soc-export-primary-btn");
    const secondaryBtn = overlay.querySelector("#soc-export-secondary-btn");
    
    let pct = 0;
    const duration = 1200;
    const step = 30;
    const increment = (step / duration) * 100;
    
    const timer = setInterval(() => {
      pct += increment;
      if (pct >= 100) {
        pct = 100;
        clearInterval(timer);
        
        progressBar.style.width = "100%";
        progressBar.classList.add("is-success");
        percentLabel.textContent = "100%";
        percentLabel.classList.add("is-success");
        iconWrap.innerHTML = checkSvg;
        iconWrap.classList.add("is-success");
        title.textContent = `${type} Report Ready`;
        desc.textContent = "The report has been successfully generated and compiled.";
        
        primaryBtn.classList.add("is-visible");
        secondaryBtn.classList.add("is-visible");
        
        primaryBtn.addEventListener("click", () => {
          try {
            onComplete();
            overlay.classList.remove("is-visible");
            setTimeout(() => overlay.remove(), 300);
          } catch (err) {
            console.error("Export callback failed:", err);
            
            progressBar.style.width = "100%";
            progressBar.classList.remove("is-success");
            progressBar.style.background = "#ef4444";
            
            percentLabel.textContent = "Error";
            percentLabel.style.color = "#ef4444";
            
            iconWrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
            iconWrap.classList.remove("is-success");
            
            title.textContent = `${type} Export Failed`;
            desc.textContent = "An error occurred while compiling the report: " + (err.message || err);
            
            primaryBtn.classList.remove("is-visible");
          }
        });
        
        secondaryBtn.addEventListener("click", () => {
          overlay.classList.remove("is-visible");
          setTimeout(() => overlay.remove(), 300);
        });
      } else {
        progressBar.style.width = `${pct}%`;
        percentLabel.textContent = `${Math.floor(pct)}%`;
      }
    }, step);
  }

  function setupExport() {
    const exportBtn = document.getElementById("dashboard-export-btn");
    const exportPopover = document.getElementById("dashboard-export-popover");
    const exportPanel = document.getElementById("dashboard-export-panel");

    if (!exportBtn || !exportPopover) return;

    exportBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = exportPopover.classList.contains("is-hidden");
      if (isHidden) {
        exportPopover.classList.remove("is-hidden");
        exportBtn.setAttribute("aria-expanded", "true");
      } else {
        exportPopover.classList.add("is-hidden");
        exportBtn.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("click", (e) => {
      if (!exportPopover.classList.contains("is-hidden")) {
        if (exportPanel && !exportPanel.contains(e.target)) {
          exportPopover.classList.add("is-hidden");
          exportBtn.setAttribute("aria-expanded", "false");
        }
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !exportPopover.classList.contains("is-hidden")) {
        exportPopover.classList.add("is-hidden");
        exportBtn.setAttribute("aria-expanded", "false");
      }
    });

    const pdfBtn = document.getElementById("export-pdf-btn");
    const csvBtn = document.getElementById("export-csv-btn");

    if (csvBtn) {
      csvBtn.addEventListener("click", () => {
        exportPopover.classList.add("is-hidden");
        exportBtn.setAttribute("aria-expanded", "false");
        showExportModal("CSV", triggerCSVExport);
      });
    }

    if (pdfBtn) {
      pdfBtn.addEventListener("click", () => {
        exportPopover.classList.add("is-hidden");
        exportBtn.setAttribute("aria-expanded", "false");
        showExportModal("PDF", triggerPDFExport);
      });
    }
  }

  async function load() {
    try {
      const res = await SOCAuth.authFetch("/api/findings");
      if (!res.ok) throw new Error("Failed");
      findings = await res.json();
    } catch (err) {
      console.error(err);
      findings = [];
    } finally {
      loading.classList.add("is-hidden");
      content.classList.remove("is-hidden");
      refreshDashboard();
      fetchAndRenderScanStats();
    }
  }

  setupExport();
  load();

  window.addEventListener("theme-changed", () => {
    refreshDashboard();
    fetchAndRenderScanStats();
  });
})();
