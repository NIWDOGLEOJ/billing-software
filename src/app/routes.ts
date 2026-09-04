import { createBrowserRouter } from "react-router";
import { Layout } from "./components/layout";
import { RouteErrorBoundary } from "./components/route-error-boundary";

// Layout is eager (it's the persistent shell — always needed immediately).
// All page-level components are lazy: Vite splits them into separate chunks,
// so the browser only downloads a page's JS when the user first navigates to it.
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
    // boundary too, so a failing page keeps the sidebar and stays navigable.
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
    ],
  },
]);
