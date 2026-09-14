import React from "react";
import OrdersGrid from "./OrdersGrid.jsx";

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Orders Grid - By Chandresh Trivedi (chand.trivedi@gmail.com)</h1>
        <p>
          A virtualized, infinite-scrolling grid over 1,000,000 synthetic e-commerce orders.
          Sorting and filtering hit the backend directly — the browser never holds more
          than a couple of pages of rows in memory at once.
        </p>
        <p><strong>Free tier cold starts:</strong> Render's free web services spin down after inactivity and take ~30-60s to wake up on the next request</p>
      </header>
      <OrdersGrid />
      <footer className="app-footer">
        Built with React, TanStack Virtual, Express, and SQLite. See the <a href="https://github.com/chandreshtrivedi/portfolio-data-grid">README</a> for
        the performance approach and numbers.
      </footer>
    </div>
  );
}
