(function () {
  const root = document.documentElement;
  const toggles = document.querySelectorAll("[data-theme-toggle]");
  const labels = document.querySelectorAll("[data-theme-label]");
  const icons = document.querySelectorAll("[data-theme-icon]");

  let theme = localStorage.getItem("theme") === "light" ? "light" : "dark";
  applyTheme(theme);

  toggles.forEach((btn) => {
    btn.addEventListener("click", () => {
      theme = theme === "dark" ? "light" : "dark";
      applyTheme(theme);
      localStorage.setItem("theme", theme);
    });
  });

  function applyTheme(next) {
    const isDark = next === "dark";
    root.classList.toggle("dark", isDark);
    root.classList.toggle("light", !isDark);

    const labelText = isDark ? "Light" : "Dark";
    const aria = isDark ? "Switch to light mode" : "Switch to dark mode";
    
    // Premium feather/lucide vector SVGs for perfect sizing and current-color styling
    const sunSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block;"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
    const moonSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block;"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    const iconHTML = isDark ? sunSVG : moonSVG;

    labels.forEach((el) => {
      el.textContent = labelText;
    });
    icons.forEach((el) => {
      el.innerHTML = iconHTML;
    });
    toggles.forEach((btn) => {
      btn.dataset.theme = next;
      btn.setAttribute("aria-label", aria);
    });

    window.dispatchEvent(new CustomEvent("theme-changed", { detail: { theme: next } }));
  }
})();
