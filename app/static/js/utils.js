function escapeHtml(str) {
  const el = document.createElement("div");
  el.textContent = str;
  return el.innerHTML;
}

function severityClass(level) {
  const map = {
    Critical: "severity-critical",
    High: "severity-high",
    Medium: "severity-medium",
    Low: "severity-low",
  };
  return map[level] || "severity-low";
}

function statusClass(status) {
  const key = (status || "OPEN").toLowerCase().replace("-", "_");
  return `status-${key}`;
}

function getPageNumbers(current, total) {
  const pages = [];
  const maxButtons = 5;
  if (total <= maxButtons) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    
    let start = Math.max(2, current - 1);
    let end = Math.min(total - 1, current + 1);
    
    if (current <= 2) {
      end = 4;
    } else if (current >= total - 1) {
      start = total - 3;
    }
    
    if (start > 2) {
      pages.push("...");
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    
    if (end < total - 1) {
      pages.push("...");
    }
    
    pages.push(total);
  }
  return pages;
}

function renderPagination(container, totalItems, currentPage, pageSize, onPageChange) {
  if (!container) return;
  
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);
  
  let html = `
    <div class="soc-pagination">
      <div class="soc-pagination__info">
        Showing <span class="soc-pagination__highlight">${startItem}</span> to <span class="soc-pagination__highlight">${endItem}</span> of <span class="soc-pagination__highlight">${totalItems}</span> entries
      </div>
      <div class="soc-pagination__controls">
        <button type="button" class="soc-pagination__btn soc-pagination__btn--prev" ${currentPage === 1 ? "disabled" : ""}>
          &larr; Prev
        </button>
  `;
  
  const pageNumbers = getPageNumbers(currentPage, totalPages);
  
  pageNumbers.forEach(page => {
    if (page === "...") {
      html += `<span class="soc-pagination__ellipsis">...</span>`;
    } else {
      const activeClass = page === currentPage ? "soc-pagination__btn--active" : "";
      html += `
        <button type="button" class="soc-pagination__btn ${activeClass}" data-page="${page}">
          ${page}
        </button>
      `;
    }
  });
  
  html += `
        <button type="button" class="soc-pagination__btn soc-pagination__btn--next" ${currentPage === totalPages ? "disabled" : ""}>
          Next &rarr;
        </button>
      </div>
    </div>
  `;
  
  container.innerHTML = html;
  
  const prevBtn = container.querySelector(".soc-pagination__btn--prev");
  if (prevBtn && currentPage > 1) {
    prevBtn.addEventListener("click", () => onPageChange(currentPage - 1));
  }
  
  const nextBtn = container.querySelector(".soc-pagination__btn--next");
  if (nextBtn && currentPage < totalPages) {
    nextBtn.addEventListener("click", () => onPageChange(currentPage + 1));
  }
  
  container.querySelectorAll(".soc-pagination__btn[data-page]").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = Number(btn.dataset.page);
      if (p !== currentPage) {
        onPageChange(p);
      }
    });
  });
}

