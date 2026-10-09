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
          const { PermissionGuard } = await import("./components/permission-guard");
          return {
            Component: () =>
              React.createElement(
                PermissionGuard,
                { permission: "access_billing" },
                React.createElement(CashierBillingAdvanced)
              ),
          };
        },
      },
      {
        path: "analytics",
        ErrorBoundary: RouteErrorBoundary,
        lazy: async () => {
          const { AnalyticsDashboard } = await import("./components/analytics-dashboard");
          const { PermissionGuard } = await import("./components/permission-guard");
          return {
            Component: () =>
              React.createElement(
                PermissionGuard,
                { permission: ["view_analytics", "access_inventory"] },
                React.createElement(AnalyticsDashboard)
              ),
          };
        },
      },
      {
        path: "employees",
        ErrorBoundary: RouteErrorBoundary,
        lazy: async () => {
          const { EmployeeManagement } = await import("./components/employee-management");
          const { PermissionGuard } = await import("./components/permission-guard");
          return {
            Component: () =>
              React.createElement(
                PermissionGuard,
                { permission: "manage_employees" },
                React.createElement(EmployeeManagement)
              ),
          };
        },
      },
      {
        path: "employee-performance",
        ErrorBoundary: RouteErrorBoundary,
        lazy: async () => {
          const { EmployeePerformance } = await import("./components/employee-performance");
          const { PermissionGuard } = await import("./components/permission-guard");
          return {
            Component: () =>
              React.createElement(
                PermissionGuard,
                { permission: ["manage_employees", "view_analytics"] },
                React.createElement(EmployeePerformance)
              ),
          };
        },
      },
      {
        path: "config",
        ErrorBoundary: RouteErrorBoundary,
        lazy: async () => {
          const { POSSettings } = await import("./components/pos-settings");
          const { PermissionGuard } = await import("./components/permission-guard");
          return {
            Component: () =>
              React.createElement(
                PermissionGuard,
                { permission: "access_settings" },
                React.createElement(POSSettings)
              ),
          };
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
          const { PermissionGuard } = await import("./components/permission-guard");
          return {
            Component: () =>
              React.createElement(
                PermissionGuard,
                { permission: ["view_analytics", "generate_reports"] },
                React.createElement(GstLedgerPage)
              ),
          };
        },
      },
      {
        path: "khata",
        ErrorBoundary: RouteErrorBoundary,
        lazy: async () => {
          const { KhataPage } = await import("./sectors/khata-page");
          const { PermissionGuard } = await import("./components/permission-guard");
          return {
            Component: () =>
              React.createElement(
                PermissionGuard,
                { permission: ["view_transaction_history", "access_billing"] },
                React.createElement(KhataPage)
              ),
          };
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
