(function () {
  const TOKEN_KEY = "soc_token";
  const USER_KEY = "soc_user";

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || "null");
    } catch {
      return null;
    }
  }

  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function isLoginPage() {
    return window.location.pathname === "/login";
  }

  function requireAuth() {
    if (isLoginPage()) return;
    if (!getToken()) {
      window.location.replace("/login?next=" + encodeURIComponent(window.location.pathname));
    }
  }

  async function authFetch(url, options = {}) {
    const token = getToken();
    const headers = new Headers(options.headers || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Content-Type") && options.body) {
      headers.set("Content-Type", "application/json");
    }
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401 && !isLoginPage()) {
      clearSession();
      window.location.replace("/login?next=" + encodeURIComponent(window.location.pathname));
      throw new Error("Session expired");
    }
    return res;
  }

  function isAdmin() {
    return getUser()?.role === "admin";
  }

  function canTriggerScan() {
    return isAdmin();
  }

  function canUpdateWorkflowStatus() {
    return false;
  }

  /** @deprecated Workflow status is read-only in the dashboard */
  function canSetStatus() {
    return false;
  }

  function applyNavPermissions() {
    const scanLink = document.querySelector('a[href="/scan"]');
    if (scanLink && !canTriggerScan()) {
      scanLink.classList.add("is-hidden");
    }
    const usersLink = document.querySelector('a[href="/users"]');
    if (usersLink && !isAdmin()) {
      usersLink.classList.add("is-hidden");
    }
    const logoutBtn = document.getElementById("logout-btn");
    if (isLoginPage()) {
      logoutBtn?.classList.add("is-hidden");
      return;
    }
    logoutBtn?.classList.remove("is-hidden");
  }

  function bindLogout() {
    document.getElementById("logout-btn")?.addEventListener("click", () => {
      clearSession();
      window.location.href = "/login";
    });
  }

  window.SOCAuth = {
    getToken,
    getUser,
    setSession,
    clearSession,
    requireAuth,
    authFetch,
    isAdmin,
    canTriggerScan,
    canUpdateWorkflowStatus,
    canSetStatus,
    applyNavPermissions,
    bindLogout,
  };

  requireAuth();
  document.addEventListener("DOMContentLoaded", () => {
    applyNavPermissions();
    bindLogout();
  });
})();
