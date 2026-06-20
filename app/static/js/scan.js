(function () {
  if (window.SOCAuth && !SOCAuth.canTriggerScan()) {
    window.location.replace("/dashboard");
    return;
  }

  const form = document.getElementById("scan-form");
  const visualizer = document.getElementById("pipeline-visualizer");
  const stepsList = document.getElementById("pipeline-steps-list");
  const consoleLog = document.getElementById("pipeline-console-log");
  const submitBtn = document.getElementById("scan-submit");

  if (!form) return;

  let pollTimer = null;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const repoUrl = document.getElementById("repo-url").value.trim();
    const repoName = document.getElementById("repo-name").value.trim();
    const branchesRaw = document.getElementById("branches").value.trim();
    const branches = branchesRaw
      ? branchesRaw.split(",").map((b) => b.trim()).filter(Boolean)
      : [];

    if (!repoUrl) return;
    if (!repoName) {
      alert("Repository Name is required.");
      return;
    }

    submitBtn.disabled = true;
    stopPoll();

    // Show visualizer container with queueing status
    visualizer.classList.remove("is-hidden");
    consoleLog.textContent = `[INFO] Initializing scan run telemetry pipeline...\n[INFO] Contacting backend to initiate repository registration...`;
    stepsList.innerHTML = `<div style="text-align: center; padding: var(--space-6); color: var(--muted);"><span class="step-spinner" style="display: inline-block; margin-inline-end: var(--space-2);"></span> Initializing system components...</div>`;

    try {
      const res = await SOCAuth.authFetch("/api/scan/trigger", {
        method: "POST",
        body: JSON.stringify({ repoUrl, repoName, branches }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data.detail;
        const msg = Array.isArray(detail)
          ? detail.map((d) => d.msg).join(", ")
          : detail || data.error || "Failed to trigger scan";
        throw new Error(msg);
      }

      if (data.scanRunId) {
        consoleLog.textContent += `\n[OK] Scan run triggered successfully with ID: ${data.scanRunId}\n[INFO] Starting live telemetry monitoring...`;
        pollScanRun(data.scanRunId);
      } else {
        consoleLog.textContent += `\n[WARN] Scan started, but no ScanRunId was returned by backend.`;
        submitBtn.disabled = false;
      }
    } catch (err) {
      consoleLog.textContent += `\n[FATAL] Scan Trigger Failed: ${err.message}`;
      submitBtn.disabled = false;
    }
  });

  function pollScanRun(scanRunId) {
    const tick = async () => {
      try {
        const res = await SOCAuth.authFetch(`/api/scan/runs/${scanRunId}`);
        if (!res.ok) throw new Error("Failed to load scan status");
        const run = await res.json();

        // Render pipeline steps
        renderPipeline(run.stages, run.status);

        if (run.status === "running") {
          return;
        }

        // Finalized
        stopPoll();
        submitBtn.disabled = false;
      } catch (err) {
        stopPoll();
        consoleLog.textContent += `\n[FATAL] Telemetry Connection Interrupted: ${err.message}`;
        submitBtn.disabled = false;
      }
    };
    tick();
    pollTimer = setInterval(tick, 2000);
  }

  function renderPipeline(stages, status) {
    if (!stages || !stages.length) return;

    let html = "";
    let logLines = [
      `[INFO] Telemetry interface connected. Monitoring Scan Run...`,
      `[INFO] Target Repository Verified: ${document.getElementById("repo-url").value}`
    ];

    stages.forEach((stg) => {
      const isCompleted = stg.status === "completed";
      const isRunning   = stg.status === "running";
      const isFailed    = stg.status === "failed";

      let classAttr = "pipeline-step";
      let icon = "";

      if (isCompleted) {
        classAttr += " pipeline-step--completed";
        icon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        logLines.push(`[OK] Stage [${stg.name}] completed. Elapsed: ${stg.time || "N/A"}`);
      } else if (isRunning) {
        classAttr += " pipeline-step--running";
        icon = `<span class="step-spinner"></span>`;
        logLines.push(`[RUNNING] Stage [${stg.name}]: ${stg.desc || "Processing..."}`);
      } else if (isFailed) {
        classAttr += " pipeline-step--failed";
        icon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
        logLines.push(`[FATAL] Stage [${stg.name}] failed! Exception occurred.`);
      } else {
        classAttr += " pipeline-step--pending";
        icon = `<span style="width:6px;height:6px;background:var(--border);border-radius:50%;"></span>`;
      }

      const badgeText = isCompleted ? (stg.time || "Done")
                      : isRunning   ? "Active"
                      : isFailed    ? "Failed"
                      : "Pending";

      html += `
        <div class="${classAttr}">
          <div class="step-icon-wrap">${icon}</div>
          <div class="step-content">
            <h4 class="step-title">${stg.name}</h4>
            <p class="step-desc">${stg.desc || ""}</p>
          </div>
          <div class="step-badge">${badgeText}</div>
        </div>
      `;
    });

    if (status === "completed") {
      logLines.push(`[OK] Global scanning operation completed successfully.`);
      document.getElementById("pipeline-title").textContent = "Pipeline Execution Monitor (COMPLETED)";
      document.getElementById("pipeline-title").style.color = "var(--success)";
    } else if (status === "failed") {
      logLines.push(`[FATAL] Global scanning operation execution aborted.`);
      document.getElementById("pipeline-title").textContent = "Pipeline Execution Monitor (FAILED)";
      document.getElementById("pipeline-title").style.color = "var(--danger)";
    } else {
      document.getElementById("pipeline-title").textContent = "Pipeline Execution Monitor";
      document.getElementById("pipeline-title").style.color = "var(--text)";
    }

    stepsList.innerHTML = html;
    consoleLog.textContent = logLines.join("\n");
    consoleLog.scrollTop = consoleLog.scrollHeight;
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }
})();
