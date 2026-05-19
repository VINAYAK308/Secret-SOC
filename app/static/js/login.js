(function () {
  const form = document.getElementById("login-form");
  const errorEl = document.getElementById("login-error");
  const submitBtn = document.getElementById("login-submit");

  const params = new URLSearchParams(window.location.search);
  const next = params.get("next") || "/dashboard";

  if (localStorage.getItem("soc_token")) {
    window.location.replace(next);
    return;
  }

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("is-hidden");
    submitBtn.disabled = true;

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      let data = {};
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        if (!res.ok) {
          throw new Error(text || "Sign in failed");
        }
      }
      if (!res.ok) {
        const detail = data.detail;
        throw new Error(
          typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? detail.map((d) => d.msg || d).join(", ")
              : "Invalid credentials"
        );
      }
      localStorage.setItem("soc_token", data.token);
      localStorage.setItem("soc_user", JSON.stringify(data.user));
      window.location.replace(next);
    } catch (err) {
      errorEl.textContent = err.message || "Sign in failed";
      errorEl.classList.remove("is-hidden");
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
