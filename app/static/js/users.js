(function () {
  if (!SOCAuth.isAdmin()) {
    window.location.replace("/dashboard");
    return;
  }

  const loading = document.getElementById("users-loading");
  const empty = document.getElementById("users-empty");
  const tableWrap = document.getElementById("users-table-wrap");
  const tbody = document.getElementById("users-tbody");
  const dialog = document.getElementById("user-dialog");
  const form = document.getElementById("user-form");
  const titleEl = document.getElementById("user-dialog-title");
  const idInput = document.getElementById("user-id");
  const usernameInput = document.getElementById("user-username");
  const passwordInput = document.getElementById("user-password");
  const passwordHint = document.getElementById("user-password-hint");
  const roleSelect = document.getElementById("user-role");
  const errorEl = document.getElementById("user-form-error");
  const submitBtn = document.getElementById("user-form-submit");
  const currentUserId = SOCAuth.getUser()?.id;
  const searchInput = document.getElementById("user-search");

  let users = [];
  let searchQuery = "";
  let currentPage = 1;
  const pageSize = 10;

  document.getElementById("user-add-btn")?.addEventListener("click", () => openDialog());
  document.querySelectorAll("[data-dialog-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeDialog());
  });
  dialog?.addEventListener("click", (e) => {
    if (e.target === dialog) closeDialog();
  });
  form?.addEventListener("submit", onSubmit);

  searchInput?.addEventListener("input", (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    currentPage = 1;
    renderTable();
  });

  async function load() {
    try {
      const res = await SOCAuth.authFetch("/api/users");
      if (res.status === 403) {
        window.location.replace("/dashboard");
        return;
      }
      if (!res.ok) throw new Error("Failed to load users");
      users = await res.json();
    } catch (err) {
      console.error(err);
      users = [];
    } finally {
      loading.classList.add("is-hidden");
      renderTable();
    }
  }

  function renderTable() {
    const filtered = users.filter((u) => {
      if (!searchQuery) return true;
      const usernameMatch = u.username?.toLowerCase().includes(searchQuery);
      const roleMatch = u.role?.toLowerCase().includes(searchQuery);
      return usernameMatch || roleMatch;
    });

    let paginationContainer = document.getElementById("users-pagination");

    if (!filtered.length) {
      tableWrap.classList.add("is-hidden");
      empty.classList.remove("is-hidden");
      tbody.innerHTML = "";
      if (paginationContainer) paginationContainer.innerHTML = "";
      return;
    }
    empty.classList.add("is-hidden");
    tableWrap.classList.remove("is-hidden");

    if (!paginationContainer) {
      paginationContainer = document.createElement("div");
      paginationContainer.id = "users-pagination";
      tableWrap.appendChild(paginationContainer);
    }

    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    tbody.innerHTML = paginated
      .map((u) => {
        const created = u.created_at ? new Date(u.created_at).toLocaleString() : "—";
        const roleBadge =
          u.role === "admin"
            ? '<span class="badge badge--role-admin">Admin</span>'
            : '<span class="badge badge--role-reviewer">Reviewer</span>';
        const isSelf = u.id === currentUserId;
        const deleteDisabled = isSelf ? " disabled title=\"You cannot delete your own account\"" : "";
        return `<tr>
          <td class="cell-mono">${escapeHtml(u.username)}</td>
          <td>${roleBadge}</td>
          <td class="cell-muted">${escapeHtml(created)}</td>
          <td class="cell-actions">
            <button type="button" class="btn btn--ghost btn--sm" data-edit="${u.id}">Edit</button>
            <button type="button" class="btn btn--ghost btn--sm text-danger" data-delete="${u.id}"${deleteDisabled}>Delete</button>
          </td>
        </tr>`;
      })
      .join("");

    tbody.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const user = users.find((u) => u.id === Number(btn.dataset.edit));
        if (user) openDialog(user);
      });
    });
    tbody.querySelectorAll("[data-delete]:not([disabled])").forEach((btn) => {
      btn.addEventListener("click", () => deleteUser(Number(btn.dataset.delete)));
    });

    renderPagination(paginationContainer, filtered.length, currentPage, pageSize, (newPage) => {
      currentPage = newPage;
      renderTable();
    });
  }

  function openDialog(user) {
    errorEl.classList.add("is-hidden");
    errorEl.textContent = "";
    if (user) {
      titleEl.textContent = "Edit user";
      idInput.value = String(user.id);
      usernameInput.value = user.username;
      passwordInput.value = "";
      passwordInput.removeAttribute("required");
      passwordHint.classList.remove("is-hidden");
      roleSelect.value = user.role;
      submitBtn.textContent = "Update";
    } else {
      titleEl.textContent = "Add user";
      idInput.value = "";
      usernameInput.value = "";
      passwordInput.value = "";
      passwordInput.setAttribute("required", "required");
      passwordHint.classList.add("is-hidden");
      roleSelect.value = "reviewer";
      submitBtn.textContent = "Create";
    }
    dialog.showModal();
    usernameInput.focus();
  }

  function closeDialog() {
    dialog.close();
    form.reset();
    idInput.value = "";
  }

  async function onSubmit(e) {
    e.preventDefault();
    errorEl.classList.add("is-hidden");
    const id = idInput.value ? Number(idInput.value) : null;
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const role = roleSelect.value;

    if (!username) {
      showError("Username is required");
      return;
    }
    if (!id && !password) {
      showError("Password is required for new users");
      return;
    }

    submitBtn.disabled = true;
    try {
      let res;
      if (id) {
        const body = { username, role };
        if (password) body.password = password;
        res = await SOCAuth.authFetch(`/api/users/${id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      } else {
        res = await SOCAuth.authFetch("/api/users", {
          method: "POST",
          body: JSON.stringify({ username, password, role }),
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(formatApiError(data));
        return;
      }
      closeDialog();
      await load();
    } catch (err) {
      console.error(err);
      showError("Network error");
    } finally {
      submitBtn.disabled = false;
    }
  }

  async function deleteUser(id) {
    const user = users.find((u) => u.id === id);
    if (!user) return;
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;

    try {
      const res = await SOCAuth.authFetch(`/api/users/${id}`, { method: "DELETE" });
      if (res.status === 204) {
        await load();
        return;
      }
      const data = await res.json().catch(() => ({}));
      alert(data.detail || "Could not delete user");
    } catch (err) {
      console.error(err);
      alert("Network error");
    }
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove("is-hidden");
  }

  function formatApiError(data) {
    const d = data?.detail;
    if (!d) return "Request failed";
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return d.map((x) => x.msg || String(x)).join("; ");
    return String(d);
  }

  load();
})();
