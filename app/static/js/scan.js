(function () {
  if (window.SOCAuth && !SOCAuth.canTriggerScan()) {
    window.location.replace("/dashboard");
    return;
  }

  const form = document.getElementById("scan-form");
  const statusBox = document.getElementById("scan-status");
  const statusTitle = document.getElementById("scan-status-title");
  const statusMessage = document.getElementById("scan-status-message");
  const submitBtn = document.getElementById("scan-submit");

  if (!form) return;

  let pollTimer = null;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const repoUrl = document.getElementById("repo-url").value.trim();
    const branchesRaw = document.getElementById("branches").value.trim();
    const branches = branchesRaw
      ? branchesRaw.split(",").map((b) => b.trim()).filter(Boolean)
      : [];

    if (!repoUrl) return;

    setStatus("scanning", "Scan in Progress", "Starting scan pipeline…");
    submitBtn.disabled = true;
    stopPoll();

    try {
      const res = await SOCAuth.authFetch("/api/scan/trigger", {
        method: "POST",
        body: JSON.stringify({ repoUrl, branches }),
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
        setStatus("scanning", "Scan running", data.message || "Pipeline started…");
        pollScanRun(data.scanRunId);
      } else {
        setStatus("success", "Scan started", data.message || "Scan initiated.");
        submitBtn.disabled = false;
      }
    } catch (err) {
      setStatus("error", "Scan Failed", err.message);
      submitBtn.disabled = false;
    }
  });

  function pollScanRun(scanRunId) {
    const tick = async () => {
      try {
        const res = await SOCAuth.authFetch(`/api/scan/runs/${scanRunId}`);
        if (!res.ok) throw new Error("Failed to load scan status");
        const run = await res.json();
        if (run.status === "running") {
          setStatus(
            "scanning",
            "Scan running",
            `Scanning ${run.repoName || "repository"}… started ${formatTime(run.startedAt)}`
          );
          return;
        }
        stopPoll();
        if (run.status === "completed") {
          setStatus(
            "success",
            "Scan completed",
            `${run.repoName || "Repository"} finished at ${formatTime(run.completedAt)}`
          );
        } else {
          setStatus(
            "error",
            "Scan failed",
            `${run.repoName || "Repository"} — status: ${run.status}`
          );
        }
      } catch (err) {
        stopPoll();
        setStatus("error", "Status unavailable", err.message);
      } finally {
        submitBtn.disabled = false;
      }
    };
    tick();
    pollTimer = setInterval(tick, 3000);
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function formatTime(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleString();
  }

  function setStatus(kind, title, message) {
    statusBox.classList.remove("is-hidden", "alert--info", "alert--success", "alert--error");
    statusBox.classList.add(
      kind === "scanning" ? "alert--info" : kind === "success" ? "alert--success" : "alert--error"
    );
    statusTitle.textContent = title;
    statusMessage.textContent = message;
  }
})();
