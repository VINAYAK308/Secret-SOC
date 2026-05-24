(function () {
  var sidebar   = document.getElementById("sidebar");
  var mainShell = document.getElementById("main-shell");
  var brand     = document.getElementById("sidebar-brand");
  var backdrop  = document.getElementById("sidebar-backdrop");
  var toggle    = document.getElementById("sidebar-toggle");
  var labels    = document.querySelectorAll(".sidebar-label");

  if (!sidebar) return;

  /* ── Persistent state ──────────────────────────────────────────── */
  var collapsed  = localStorage.getItem("sidebar-collapsed") === "true";
  var mobileOpen = false;

  /* ── Helpers ───────────────────────────────────────────────────── */
  function isMobile() {
    return window.matchMedia("(max-width: 767px)").matches;
  }

  /* ── Apply desktop collapsed / expanded state ──────────────────── */
  function applyCollapsed() {
    sidebar.classList.toggle("sidebar--collapsed", collapsed);
    if (mainShell) mainShell.classList.toggle("main-shell--collapsed", collapsed);
    labels.forEach(function (el) { el.classList.toggle("is-hidden", collapsed); });
    if (brand) brand.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
  }

  /* ── Apply mobile drawer open / closed state ───────────────────── */
  function applyMobileOpen(open) {
    mobileOpen = open;

    /* Sidebar visibility */
    sidebar.classList.toggle("sidebar--open", open);

    /* Backdrop: show only when open on mobile */
    if (backdrop) {
      if (open) {
        backdrop.classList.remove("is-hidden");
        backdrop.style.pointerEvents = "auto";
      } else {
        backdrop.classList.add("is-hidden");
        backdrop.style.pointerEvents = "none";
      }
    }

    /* Prevent body scroll behind open drawer */
    document.body.style.overflow = (open && isMobile()) ? "hidden" : "";
  }

  /* ── Sync everything to current viewport ──────────────────────── */
  function syncToViewport() {
    if (isMobile()) {
      /* On mobile: desktop collapsed/expanded classes must be neutral */
      sidebar.classList.remove("sidebar--collapsed");
      if (mainShell) {
        mainShell.classList.remove("main-shell--collapsed");
        mainShell.style.paddingLeft = "";   /* Let CSS media-query rule take over */
      }
      /* Keep or restore drawer state */
      applyMobileOpen(mobileOpen);
    } else {
      /* On desktop: always close drawer, restore collapsed state */
      applyMobileOpen(false);   /* clears sidebar--open, hides backdrop, clears overflow */
      applyCollapsed();
    }
  }

  /* ── Initial render ────────────────────────────────────────────── */
  syncToViewport();

  /* ── Brand button: collapse on desktop / close on mobile ───────── */
  if (brand) {
    brand.addEventListener("click", function () {
      if (isMobile()) {
        applyMobileOpen(false);
        return;
      }
      collapsed = !collapsed;
      localStorage.setItem("sidebar-collapsed", String(collapsed));
      applyCollapsed();
    });
  }

  /* ── Hamburger toggle (mobile only) ────────────────────────────── */
  if (toggle) {
    toggle.addEventListener("click", function () {
      if (isMobile()) {
        applyMobileOpen(!mobileOpen);
      }
    });
  }

  /* ── Backdrop tap: close mobile drawer ─────────────────────────── */
  if (backdrop) {
    backdrop.addEventListener("click", function () {
      applyMobileOpen(false);
    });
  }

  /* ── Nav link clicks: auto-close on mobile ──────────────────────── */
  sidebar.querySelectorAll(".sidebar__nav a").forEach(function (link) {
    link.addEventListener("click", function () {
      if (isMobile()) applyMobileOpen(false);
    });
  });

  /* ── Escape key: close mobile drawer ───────────────────────────── */
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Escape" || e.key === "Esc") && mobileOpen && isMobile()) {
      applyMobileOpen(false);
    }
  });

  /* ── Resize: re-sync when crossing the mobile breakpoint ───────── */
  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(syncToViewport, 80);
  });
})();
