(function () {
  let findings = [];

  const loading = document.getElementById("dashboard-loading");
  const content = document.getElementById("dashboard-content");
  const filters = FindingsFilters.createDashboardFilters();
  const facetedFilter = FindingsFilters.createDashboardFaceted({
    prefix: "dashboard",
    getFindings: () => findings,
    filters,
    onChange: refreshDashboard,
  });
  facetedFilter.closePopover();

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

  function refreshDashboard() {
    const filtered = getFiltered();
    const stats = FindingsFilters.computeStats(filtered);
    document.getElementById("stat-total").textContent = stats.totalSecrets;
    document.getElementById("stat-critical").textContent = stats.criticalExposures;
    document.getElementById("stat-incidents").textContent = stats.activeIncidents;
    document.getElementById("stat-repos").textContent = stats.repositoriesScanned;

    renderTrend(filtered);
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
    }
  }

  load();

  window.addEventListener("theme-changed", () => {
    if (window.trendChartInstance) refreshDashboard();
  });
})();
