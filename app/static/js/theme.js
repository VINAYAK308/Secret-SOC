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

    const labelText = isDark ? "Light mode" : "Dark mode";
    const aria = isDark ? "Switch to light mode" : "Switch to dark mode";
    const iconChar = isDark ? "☀" : "☾";

    labels.forEach((el) => {
      el.textContent = labelText;
    });
    icons.forEach((el) => {
      el.textContent = iconChar;
    });
    toggles.forEach((btn) => {
      btn.dataset.theme = next;
      btn.setAttribute("aria-label", aria);
    });

    window.dispatchEvent(new CustomEvent("theme-changed", { detail: { theme: next } }));
  }
})();
