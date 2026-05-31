import "./styles.css"; // 👈 اضافه کردن استایل‌های اصلی پروژه
import { router } from "./router";
import { createRoot } from "react-dom/client";
import React from "react";
import { RouterProvider } from "@tanstack/react-router";

const rootElement = document.getElementById("root");

if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    React.createElement(React.StrictMode, null, 
      React.createElement(RouterProvider, { router: router })
    )
  );
}