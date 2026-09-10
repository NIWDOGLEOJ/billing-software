import React from "react";
import { createBrowserRouter, Navigate } from "react-router";
import { Layout } from "./components/layout";
import { RouteErrorBoundary } from "./components/route-error-boundary";

// Layout is eager (it's the persistent shell — always needed immediately).
// All page-level components are lazy: Vite splits them into separate chunks,
// so the browser only downloads a page's JS when the user first navigates to it.
//
// The six sector screens below were `activeSectorPanel` modals inside
// layout.tsx. As routes they are lazy like every other page, so a retail
// terminal never downloads the kitchen display or the prescription register.
export const router = createBrowserRouter([
  {
    path: "/login",
    ErrorBoundary: RouteErrorBoundary,
    lazy: async () => {
      const { LoginPage } = await import("./components/login-page");
      return { Component: LoginPage };
    },
  },
  {
    path: "/invite",
    ErrorBoundary: RouteErrorBoundary,
    lazy: async () => {
      const { InvitePage } = await import("./components/invite-page");
      return { Component: InvitePage };
    },
  },
  {
    path: "/",
    Component: Layout,
    // Catches a crash in the shell itself. Each child below declares its own
    // boundary too, so a failing page keeps the nav and stays navigable.
    ErrorBoundary: RouteErrorBoundary,
    children: [
      {
        index: true,
        ErrorBoundary: RouteErrorBoundary,
        lazy: async () => {
          const { CashierBillingAdvanced } = await import("./components/cashier-billing-advanced");
          return { Component: CashierBillingAdvanced };
        },
      },
      {
        path: "analytics",
        ErrorBoundary: RouteErrorBoundary,
        lazy: async () => {
          const { AnalyticsDashboard } = await import("./components/analytics-dashboard");
          return { Component: AnalyticsDashboard };
        },
      },
      {
        path: "employees",
        ErrorBoundary: RouteErrorBoundary,
        lazy: async () => {
          const { EmployeeManagement } = await import("./components/employee-management");
          return { Component: EmployeeManagement };
        },
      },
      {
        path: "employee-performance",
        ErrorBoundary: RouteErrorBoundary,
        lazy: async () => {
          const { EmployeePerformance } = await import("./components/employee-performance");
          return { Component: EmployeePerformance };
        },
      },
      {
        path: "config",
        ErrorBoundary: RouteErrorBoundary,
        lazy: async () => {
          const { POSSettings } = await import("./components/pos-settings");
          return { Component: POSSettings };
        },
      },
      {
        path: "settings",
        Component: () => React.createElement(Navigate, { to: "/config", replace: true }),
      },

      // --- Retail & Wholesale combined screens ------------------------------
      // GST ledger and Khata are first-class destinations in the combined
      // Retail, Grocery & Wholesale architecture.
      {
        path: "gst",
        ErrorBoundary: RouteErrorBoundary,
        lazy: async () => {
          const { GstLedgerPage } = await import("./sectors/gst-ledger-page");
          return { Component: GstLedgerPage };
        },
      },
      {
        path: "khata",
        ErrorBoundary: RouteErrorBoundary,
        lazy: async () => {
          const { KhataPage } = await import("./sectors/khata-page");
          return { Component: KhataPage };
        },
      },
      {
        path: "attendance",
        ErrorBoundary: RouteErrorBoundary,
        lazy: async () => {
          const { AttendancePage } = await import("./sectors/attendance-page");
          return { Component: AttendancePage };
        },
      },
      {
        path: "*",
        Component: () => React.createElement(Navigate, { to: "/", replace: true }),
      },
    ],
  },
]);
