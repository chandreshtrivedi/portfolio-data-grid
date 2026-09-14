import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { fetchOrders, fetchFacets } from "./api.js";

const PAGE_SIZE = 200;
const ROW_HEIGHT = 40;
// How far (in px) from the bottom of the scroll area we start fetching the
// next page. Set to a few rows' worth so the data is ready before the user
// actually reaches the end, avoiding a visible "Loading more…" gap.
const PREFETCH_THRESHOLD_PX = ROW_HEIGHT * 8;

const COLUMNS = [
  { key: "order_number", label: "Order #", width: 140 },
  { key: "customer_name", label: "Customer", width: 200 },
  { key: "product_name", label: "Product", width: 220 },
  { key: "category", label: "Category", width: 140 },
  { key: "amount", label: "Amount", width: 110, align: "right" },
  { key: "status", label: "Status", width: 120 },
  { key: "region", label: "Region", width: 160 },
  { key: "order_date", label: "Date", width: 140 },
];

function formatDate(iso) {
  return new Date(iso).toLocaleDateString();
}

function formatAmount(n) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function OrdersGrid() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [sortBy, setSortBy] = useState("order_date");
  const [sortDir, setSortDir] = useState("desc");
  const [filters, setFilters] = useState({ status: "", region: "", category: "" });
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [facets, setFacets] = useState({ statuses: [], regions: [], categories: [] });

  const [lastFetchMs, setLastFetchMs] = useState(null);

  const parentRef = useRef(null);
  const requestIdRef = useRef(0);

  // Mirrors of state, readable synchronously inside the scroll handler below
  // without needing to be effect/callback dependencies (which would force
  // the handler to be re-created, or the effect to re-run, on every change).
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const pageRef = useRef(1);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { pageRef.current = page; }, [page]);

  // Load filter dropdown values once.
  useEffect(() => {
    fetchFacets().then(setFacets).catch(() => {});
  }, []);

  // Debounce free-text search.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset and refetch from page 1 whenever sort/filter/search changes.
  useEffect(() => {
    setRows([]);
    setPage(1);
    setHasMore(true);
    // Update refs synchronously too, so a scroll event firing before the
    // next render (which is when the mirroring effects above would run)
    // still sees the correct, reset values.
    pageRef.current = 1;
    hasMoreRef.current = true;
    loadPage(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, sortDir, filters, search]);

  const loadPage = useCallback(
    async (pageToLoad, isReset = false) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);
      const start = performance.now();
      try {
        const data = await fetchOrders({
          page: pageToLoad,
          pageSize: PAGE_SIZE,
          sortBy,
          sortDir,
          filters,
          search,
        });
        // Ignore stale responses from a superseded request (e.g. rapid filter changes).
        if (requestId !== requestIdRef.current) return;

        setLastFetchMs(Math.round(performance.now() - start));
        setTotal(data.total);
        setHasMore(pageToLoad < data.totalPages);
        setRows((prev) => (isReset ? data.rows : [...prev, ...data.rows]));
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [sortBy, sortDir, filters, search]
  );

  const rowVirtualizer = useVirtualizer({
    // +1 trailing row while more data exists, purely as a visual
    // "Loading more…" placeholder. It does NOT drive fetching — see the
    // scroll listener below for that.
    count: hasMore ? rows.length + 1 : rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  // Infinite scroll: fetch exactly one page ahead of where the user actually
  // is, based on real scroll position - not on which rows the virtualizer
  // happens to have rendered. This is deliberately a plain scroll listener
  // (registered once) rather than a useEffect keyed on virtualizer output:
  // `getVirtualItems()` returns a new array on every call, so using it as an
  // effect dependency makes the effect re-fire on virtually every render,
  // racing ahead of `loading`/`page` state and firing every page at once.
  // Refs (not state) are used inside the handler so it always reads the
  // latest loading/hasMore/page without needing to be re-created.
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    const handleScroll = () => {
      if (loadingRef.current || !hasMoreRef.current) return;

      const { scrollTop, scrollHeight, clientHeight } = el;
      const distanceToBottom = scrollHeight - (scrollTop + clientHeight);

      if (distanceToBottom <= PREFETCH_THRESHOLD_PX) {
        const nextPage = pageRef.current + 1;
        // Set refs immediately so a second scroll event firing before
        // React re-renders (and the mirroring effects above run) can't
        // trigger a duplicate fetch for the same page.
        pageRef.current = nextPage;
        loadingRef.current = true;
        setPage(nextPage);
        loadPage(nextPage);
      }
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [loadPage]);

  const handleSort = (colKey) => {
    if (sortBy === colKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(colKey);
      setSortDir("asc");
    }
  };

  const totalWidth = useMemo(() => COLUMNS.reduce((sum, c) => sum + c.width, 0), []);

  return (
    <div className="grid-wrapper">
      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Search customer, product, order #..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="">All statuses</option>
          {facets.statuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={filters.region}
          onChange={(e) => setFilters((f) => ({ ...f, region: e.target.value }))}
        >
          <option value="">All regions</option>
          {facets.regions.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select
          value={filters.category}
          onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
        >
          <option value="">All categories</option>
          {facets.categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <div className="stats">
          {total.toLocaleString()} orders
          {lastFetchMs != null && <span className="stats-latency"> · last page fetched in {lastFetchMs}ms</span>}
        </div>
      </div>

      <div ref={parentRef} className="grid-scroll-area">
        <div className="header-row" style={{ width: totalWidth }}>
          {COLUMNS.map((col) => (
            <div
              key={col.key}
              className="header-cell"
              style={{ width: col.width, textAlign: col.align || "left" }}
              onClick={() => handleSort(col.key)}
            >
              {col.label}
              {sortBy === col.key && <span className="sort-arrow">{sortDir === "asc" ? " ▲" : " ▼"}</span>}
            </div>
          ))}
        </div>

        <div style={{ height: rowVirtualizer.getTotalSize(), width: totalWidth, position: "relative" }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                className="data-row"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: totalWidth,
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {row ? (
                  COLUMNS.map((col) => (
                    <div
                      key={col.key}
                      className="data-cell"
                      style={{ width: col.width, textAlign: col.align || "left" }}
                    >
                      {col.key === "amount"
                        ? formatAmount(row.amount)
                        : col.key === "order_date"
                        ? formatDate(row.order_date)
                        : row[col.key]}
                    </div>
                  ))
                ) : (
                  <div className="data-cell loading-cell">{loading ? "Loading more…" : ""}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && <div className="error-banner">Error: {error}</div>}
    </div>
  );
}
