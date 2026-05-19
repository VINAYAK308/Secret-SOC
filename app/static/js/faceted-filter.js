/**
 * Reusable faceted filter popover (Repositories, Findings, …)
 */
window.FILTER_ICONS = {
  folder:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
  scan:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>',
  alert:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  calendar:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  severity:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>',
  status:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  clock:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  verdict:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>',
  active:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>',
};

window.FacetedFilter = class FacetedFilter {
  constructor({ prefix, filterDefs, filters, onChange }) {
    this.prefix = prefix;
    this.filterDefs = filterDefs;
    this.filters = filters;
    this.onChange = onChange || (() => {});
    this.activeFilterType = null;
    this.pendingSelection = new Set();

    this.el = {
      panel: document.getElementById(`${prefix}-filter-panel`),
      toggle: document.getElementById(`${prefix}-filter-toggle`),
      popover: document.getElementById(`${prefix}-filter-popover`),
      menu: document.getElementById(`${prefix}-filter-menu`),
      detail: document.getElementById(`${prefix}-filter-detail`),
      typesList: document.getElementById(`${prefix}-filter-types`),
      typeSearch: document.getElementById(`${prefix}-filter-type-search`),
      valueSearch: document.getElementById(`${prefix}-filter-value-search`),
      options: document.getElementById(`${prefix}-filter-options`),
      back: document.getElementById(`${prefix}-filter-back`),
      apply: document.getElementById(`${prefix}-filter-apply`),
      clearType: document.getElementById(`${prefix}-filter-clear-type`),
      badge: document.getElementById(`${prefix}-filter-badge`),
      activeFilters: document.getElementById(`${prefix}-active-filters`),
      detailTitle: document.getElementById(`${prefix}-filter-detail-title`),
      detailIcon: document.getElementById(`${prefix}-filter-detail-icon`),
    };

    this._bind();
    this.closePopover();
  }

  _bind() {
    const { el } = this;
    el.typeSearch?.addEventListener("input", () => this.renderFilterTypes());
    el.valueSearch?.addEventListener("input", () => this.renderFilterOptions());
    el.back?.addEventListener("click", () => this.showFilterMenu());
    el.apply?.addEventListener("click", () => this.applyPendingFilter());
    el.clearType?.addEventListener("click", () => this.clearActiveFilterType());

    el.toggle?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.togglePopover();
    });

    document.addEventListener("click", (e) => {
      if (!el.popover?.classList.contains("is-hidden")) {
        if (el.panel && !el.panel.contains(e.target)) this.closePopover();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.closePopover();
    });
  }

  togglePopover() {
    if (this.el.popover.classList.contains("is-hidden")) this.openPopover();
    else this.closePopover();
  }

  openPopover() {
    this.el.popover.classList.remove("is-hidden");
    this.el.toggle.setAttribute("aria-expanded", "true");
    this.showFilterMenu();
  }

  closePopover() {
    this.el.popover.classList.add("is-hidden");
    this.el.toggle.setAttribute("aria-expanded", "false");
    this.showFilterMenu();
  }

  showFilterMenu() {
    this.activeFilterType = null;
    this.el.menu.classList.remove("is-hidden");
    this.el.detail.classList.add("is-hidden");
    if (this.el.typeSearch) this.el.typeSearch.value = "";
    this.renderFilterTypes();
  }

  openFilterDetail(typeId) {
    const def = this.filterDefs.find((f) => f.id === typeId);
    if (!def) return;
    this.activeFilterType = typeId;
    this.pendingSelection = new Set(this.filters[typeId]);
    this.el.menu.classList.add("is-hidden");
    this.el.detail.classList.remove("is-hidden");
    this.el.detailTitle.textContent = def.label;
    this.el.detailIcon.innerHTML = FILTER_ICONS[def.icon] || "";
    if (this.el.valueSearch) {
      this.el.valueSearch.value = "";
      this.el.valueSearch.placeholder = `Search ${def.label.toLowerCase()}`;
    }
    this.renderFilterOptions();
  }

  renderFilterTypes() {
    const q = (this.el.typeSearch?.value || "").toLowerCase();
    const items = this.filterDefs.filter((f) => f.label.toLowerCase().includes(q));
    this.el.typesList.innerHTML = items
      .map((f) => {
        const count = this.filters[f.id].size;
        const badge = count
          ? `<span class="filter-popover__type-badge">${count}</span>`
          : "";
        return `<li>
          <button type="button" class="filter-popover__type" data-filter-type="${f.id}">
            <span class="filter-popover__type-icon">${FILTER_ICONS[f.icon] || ""}</span>
            <span class="filter-popover__type-label">${escapeHtml(f.label)}</span>
            ${badge}
            <span class="filter-popover__type-chevron" aria-hidden="true">›</span>
          </button>
        </li>`;
      })
      .join("");

    this.el.typesList.querySelectorAll("[data-filter-type]").forEach((btn) => {
      btn.addEventListener("click", () => this.openFilterDetail(btn.dataset.filterType));
    });
  }

  renderFilterOptions() {
    const def = this.filterDefs.find((f) => f.id === this.activeFilterType);
    if (!def) return;
    const q = (this.el.valueSearch?.value || "").toLowerCase();
    const opts = def.options().filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sublabel && o.sublabel.toLowerCase().includes(q))
    );

    this.el.options.innerHTML = opts
      .map((o) => {
        const checked = this.pendingSelection.has(o.value) ? "checked" : "";
        const sub = o.sublabel
          ? `<span class="filter-popover__option-sub">${escapeHtml(o.sublabel)}</span>`
          : "";
        return `<li>
          <label class="filter-popover__option">
            <input type="checkbox" value="${escapeHtml(o.value)}" ${checked} />
            <span class="filter-popover__option-text">
              <span>${escapeHtml(o.label)}</span>
              ${sub}
            </span>
          </label>
        </li>`;
      })
      .join("");

    this.el.options.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener("change", () => {
        if (cb.checked) this.pendingSelection.add(cb.value);
        else this.pendingSelection.delete(cb.value);
      });
    });
  }

  applyPendingFilter() {
    if (!this.activeFilterType) return;
    this.filters[this.activeFilterType] = new Set(this.pendingSelection);
    this.closePopover();
    this.updateFilterUI();
    this.onChange();
  }

  clearActiveFilterType() {
    if (!this.activeFilterType) return;
    this.filters[this.activeFilterType] = new Set();
    this.pendingSelection = new Set();
    this.applyPendingFilter();
  }

  removeFilter(typeId, value) {
    this.filters[typeId].delete(value);
    this.updateFilterUI();
    this.onChange();
  }

  clearAllFilters() {
    Object.keys(this.filters).forEach((k) => this.filters[k].clear());
    this.updateFilterUI();
    this.onChange();
  }

  activeFilterCount() {
    return Object.values(this.filters).reduce((n, set) => n + set.size, 0);
  }

  updateFilterUI() {
    const count = this.activeFilterCount();
    if (count > 0) {
      this.el.badge.textContent = String(count);
      this.el.badge.classList.remove("is-hidden");
    } else {
      this.el.badge.classList.add("is-hidden");
    }

    const chips = [];
    this.filterDefs.forEach((def) => {
      this.filters[def.id].forEach((value) => {
        const opt = def.options().find((o) => o.value === value);
        const label = opt ? opt.label : value;
        chips.push({ typeId: def.id, typeLabel: def.label, value, label });
      });
    });

    if (!chips.length) {
      this.el.activeFilters.classList.add("is-hidden");
      this.el.activeFilters.innerHTML = "";
      return;
    }

    const clearId = `${this.prefix}-clear-all-filters`;
    this.el.activeFilters.classList.remove("is-hidden");
    this.el.activeFilters.innerHTML =
      chips
        .map(
          (c) =>
            `<button type="button" class="filter-chip" data-type="${c.typeId}" data-value="${escapeHtml(c.value)}">
              <span class="filter-chip__label">${escapeHtml(c.typeLabel)}:</span>
              <span class="filter-chip__value">${escapeHtml(c.label)}</span>
              <span class="filter-chip__remove" aria-hidden="true">×</span>
            </button>`
        )
        .join("") +
      `<button type="button" class="filter-chip filter-chip--clear" id="${clearId}">Clear all</button>`;

    this.el.activeFilters.querySelectorAll(".filter-chip:not(.filter-chip--clear)").forEach((btn) => {
      btn.addEventListener("click", () => this.removeFilter(btn.dataset.type, btn.dataset.value));
    });
    document.getElementById(clearId)?.addEventListener("click", () => this.clearAllFilters());
  }
};
