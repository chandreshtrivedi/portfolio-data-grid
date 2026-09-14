const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

export async function fetchOrders({ page, pageSize, sortBy, sortDir, filters, search }) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    sortBy,
    sortDir,
  });
  if (search) params.set("search", search);
  for (const [key, value] of Object.entries(filters || {})) {
    if (value) params.set(key, value);
  }

  const res = await fetch(`${API_BASE}/orders?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch orders: ${res.status}`);
  return res.json();
}

export async function fetchFacets() {
  const res = await fetch(`${API_BASE}/orders/facets`);
  if (!res.ok) throw new Error(`Failed to fetch facets: ${res.status}`);
  return res.json();
}
