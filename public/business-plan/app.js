const search = document.querySelector("#directory-search");
const items = [...document.querySelectorAll(".searchable")];
const sections = [...document.querySelectorAll(".directory-section")];
const empty = document.querySelector("#no-results");

search?.addEventListener("input", () => {
  const query = search.value.trim().toLowerCase();
  let visibleCount = 0;
  for (const item of items) {
    const visible = !query || item.dataset.search.includes(query);
    item.hidden = !visible;
    if (visible) visibleCount += 1;
  }
  for (const section of sections) {
    const hasVisibleItem = [...section.querySelectorAll(".searchable")].some((item) => !item.hidden);
    section.hidden = query && !hasVisibleItem;
  }
  empty.hidden = visibleCount !== 0;
});
