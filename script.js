const cards = Array.from(document.querySelectorAll(".post-card"));
const searchInput = document.querySelector("#post-search");
const filterButtons = Array.from(document.querySelectorAll(".filter-button"));
const visibleCount = document.querySelector("#visible-count");
const yearLinks = Array.from(document.querySelectorAll(".year-list a"));

let activeFilter = "all";

function updateCards() {
  const query = searchInput?.value.trim().toLowerCase() || "";
  let shown = 0;

  for (const card of cards) {
    const haystack = [
      card.dataset.title,
      card.dataset.tags,
      card.dataset.date,
      card.dataset.excerpt,
    ].join(" ");
    const matchesQuery = !query || haystack.includes(query);
    const matchesFilter = activeFilter === "all" || haystack.includes(activeFilter);
    const isVisible = matchesQuery && matchesFilter;

    card.classList.toggle("is-hidden", !isVisible);
    if (isVisible) {
      shown += 1;
    }
  }

  if (visibleCount) {
    visibleCount.textContent = String(shown);
  }
}

searchInput?.addEventListener("input", updateCards);

for (const button of filterButtons) {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter || "all";
    filterButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    updateCards();
  });
}

for (const link of yearLinks) {
  link.addEventListener("click", () => {
    const year = link.dataset.year || "";
    if (searchInput) {
      searchInput.value = year;
      searchInput.focus({ preventScroll: true });
    }
    activeFilter = "all";
    filterButtons.forEach((item) => item.classList.toggle("is-active", item.dataset.filter === "all"));
    updateCards();
  });
}
