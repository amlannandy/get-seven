import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { router } from "./router";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
    <Toaster
      position="top-center"
      toastOptions={{
        style: {
          background: "#1e3a2f",
          color: "#f1f5f9",
          border: "1px solid #2d5a3d",
          fontFamily: "Inter, sans-serif",
        },
      }}
    />
  </StrictMode>,
);
