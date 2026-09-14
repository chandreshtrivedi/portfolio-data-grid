## Author
Chandresh Trivedi (chand.trivedi@gmail.com)
# Orders Grid — High-Performance Data Grid Over 1M Rows

A virtualized, infinite-scrolling data grid built to demonstrate how a frontend
handles a genuinely large dataset without shipping it all to the browser.

**Live demo:** https://portfolio-data-grid.vercel.app/
**Stack:** React, TanStack Virtual, Express, SQLite (better-sqlite3)

## The problem

Most "data grid" demos online use a few thousand mock rows held entirely in
client-side memory, sorted and filtered with `Array.sort` / `Array.filter`.
That approach falls over well before real production scale — anywhere from
50k to 200k rows, depending on row complexity and device.

This project seeds **1,000,000** synthetic e-commerce orders into SQLite and
serves them through a real paginated API, so the grid has to solve the
problems a production data table actually has: fetching in small batches,
virtualizing rendered rows, and pushing sort/filter/search down to the server
rather than doing it in the browser.

## Approach

- **Backend pagination, not client-side slicing.** The API returns 200-row
  pages (`GET /orders?page=&pageSize=&sortBy=&sortDir=&status=&region=&search=`).
  Sorting and filtering are SQL `ORDER BY` / `WHERE` clauses backed by indexes
  on every sortable/filterable column — not JS array operations.
- **Row virtualization.** The frontend uses TanStack Virtual so the DOM only
  ever holds the rows currently in (or just outside) the viewport, regardless
  of how many rows have been fetched in total.
- **Infinite scroll with request cancellation-by-id.** Scrolling near the end
  of the loaded rows triggers the next page fetch. A monotonically increasing
  request id guards against a slow, stale request overwriting a newer one —
  important once sort/filter changes can fire fetches in quick succession.
- **Debounced search.** Free-text search waits 350ms after the last keystroke
  before hitting the API, so typing doesn't fire a request per keystroke.

## Results

- Initial page load (first 200 rows): **1422 ms**
- Scroll performance at row 500,000: **smooth, 51.4 fps**
- API response time for a filtered + sorted query over 1M rows: **1534 ms**
- Total dataset size on disk: **414 MB** (SQLite file)

## Running it locally

```bash
# 1. Backend: seed the database (~1-3 minutes for 1M rows), then start the API
cd backend
npm install
npm run seed
npm start          # http://localhost:4000

# 2. Frontend: in a separate terminal
cd frontend
npm install
npm run dev         # http://localhost:5173
```

To reduce seed time while developing, lower `TOTAL_ROWS` in `backend/seed.js`
(e.g. to `100_000`) and re-run `npm run seed`.

## Deploying

- **Backend:** Render (Render's free web services spin down after inactivity and take ~30-60s to wake up on the next request)
- **Frontend:** Vercel

## What this project is meant to show

This was built to demonstrate the same problem solved in a production
project: a data grid over roughly a million rows, where naive client-side
rendering made the page unusable and the fix was backend pagination + row
virtualization + reduced overfetching. This version uses a synthetic
dataset so the code and results can be shared publicly.

## Possible extensions

- Column resizing and reordering, persisted to localStorage
- CSV export of the current filtered view (server-side, streamed)
- Multi-column sort
- Sticky/pinned columns
