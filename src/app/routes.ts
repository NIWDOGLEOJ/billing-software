import { createBrowserRouter } from "react-router";
import { Layout } from "./components/layout";

// Layout is eager (it's the persistent shell — always needed immediately).
// All page-level components are lazy: Vite splits them into separate chunks,
// so the browser only downloads a page's JS when the user first navigates to it.
export const router = createBrowserRouter([
  {
    path: "/login",
    lazy: async () => {
      const { LoginPage } = await import("./components/login-page");
      return { Component: LoginPage };
    },
  },
  {
    path: "/",
    Component: Layout,
    children: [
      {
        index: true,
        lazy: async () => {
          const { CashierBillingAdvanced } = await import("./components/cashier-billing-advanced");
          return { Component: CashierBillingAdvanced };
        },
      },
      {
        path: "analytics",
        lazy: async () => {
          const { AnalyticsDashboard } = await import("./components/analytics-dashboard");
          return { Component: AnalyticsDashboard };
        },
      },
      {
        path: "employees",
        lazy: async () => {
          const { EmployeeManagement } = await import("./components/employee-management");
          return { Component: EmployeeManagement };
        },
      },
      {
        path: "employee-performance",
        lazy: async () => {
          const { EmployeePerformance } = await import("./components/employee-performance");
          return { Component: EmployeePerformance };
        },
      },
      {
        path: "config",
        lazy: async () => {
          const { POSSettings } = await import("./components/pos-settings");
          return { Component: POSSettings };
        },
      },
    ],
  },
]);
