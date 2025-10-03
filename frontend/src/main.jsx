import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx"; // will use App.jsx or App.js

// Mount React into #root div
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
