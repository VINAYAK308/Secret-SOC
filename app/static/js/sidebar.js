(function () {
  const sidebar = document.getElementById("sidebar");
  const mainShell = document.getElementById("main-shell");
  const brand = document.getElementById("sidebar-brand");
  const backdrop = document.getElementById("sidebar-backdrop");
  const toggle = document.getElementById("sidebar-toggle");
  const labels = document.querySelectorAll(".sidebar-label");

  if (!sidebar) return;

  let collapsed = localStorage.getItem("sidebar-collapsed") === "true";
  let mobileOpen = false;

  function isMobile() {
    return window.matchMedia("(max-width: 767px)").matches;
  }

  function applyCollapsed() {
    sidebar.classList.toggle("sidebar--collapsed", collapsed);
    mainShell?.classList.toggle("main-shell--collapsed", collapsed);
    labels.forEach((el) => el.classList.toggle("is-hidden", collapsed));
    brand.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
  }

  function setMobileOpen(open) {
    mobileOpen = open;
    sidebar.classList.toggle("sidebar--open", open);
    backdrop?.classList.toggle("is-hidden", !open);
    document.body.style.overflow = open && isMobile() ? "hidden" : "";
  }

  function closeMobile() {
    if (isMobile()) setMobileOpen(false);
  }

  applyCollapsed();

  brand?.addEventListener("click", () => {
    if (isMobile()) {
      closeMobile();
      return;
    }
    collapsed = !collapsed;
    localStorage.setItem("sidebar-collapsed", String(collapsed));
    applyCollapsed();
  });

  toggle?.addEventListener("click", () => setMobileOpen(!mobileOpen));
  backdrop?.addEventListener("click", closeMobile);

  sidebar.querySelectorAll(".sidebar__nav a").forEach((link) => {
    link.addEventListener("click", closeMobile);
  });

  window.addEventListener("resize", () => {
    if (!isMobile()) {
      setMobileOpen(false);
      sidebar.classList.remove("sidebar--open");
    }
  });
})();
