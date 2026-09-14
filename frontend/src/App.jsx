import React from "react";
import OrdersGrid from "./OrdersGrid.jsx";

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Orders Grid</h1>
        <p>
          A virtualized, infinite-scrolling grid over 1,000,000 synthetic e-commerce orders.
          Sorting and filtering hit the backend directly — the browser never holds more
          than a couple of pages of rows in memory at once.
        </p>
      </header>
      <OrdersGrid />
      <footer className="app-footer">
        Built with React, TanStack Virtual, Express, and SQLite. See the README for
        the performance approach and numbers.
      </footer>
    </div>
  );
}
