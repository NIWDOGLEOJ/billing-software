/**
 * Role-Based Access Control (RBAC) Specification & Helpers
 *
 * Defines all system permissions, roles, role default presets,
 * and permission evaluation utilities for NexusFlow Retail POS.
 */

export type Permission =
  | 'access_billing'
  | 'edit_product_price'
  | 'delete_bill_items'
  | 'apply_discounts'
  | 'view_analytics'
  | 'access_inventory'
  | 'view_transaction_history'
  | 'generate_reports'
  | 'access_settings'
  | 'manage_employees';

export type UserRole =
  | 'owner'
  | 'co-owner'
  | 'manager'
  | 'cashier'
  | 'inventory_manager'
  | 'accountant'
  | 'employee';

export interface PermissionDefinition {
  value: Permission;
  label: string;
  description: string;
  category: 'Billing' | 'Back Office' | 'Administration';
}

export const ALL_PERMISSIONS: PermissionDefinition[] = [
  {
    value: 'access_billing',
    label: 'Billing Register',
    description: 'Can access the cashier billing register and process checkouts',
    category: 'Billing',
  },
  {
    value: 'edit_product_price',
    label: 'Edit Product Price',
    description: 'Can modify item unit prices in the cart during checkout',
    category: 'Billing',
  },
  {
    value: 'delete_bill_items',
    label: 'Delete Bill Items',
    description: 'Can remove scanned items from the cart and clear the bill',
    category: 'Billing',
  },
  {
    value: 'apply_discounts',
    label: 'Apply Discounts',
    description: 'Can apply coupon codes, line discounts, and loyalty rewards',
    category: 'Billing',
  },
  {
    value: 'view_transaction_history',
    label: 'Transaction History',
    description: 'Can view past bills, customer transaction logs, and reprint receipts',
    category: 'Billing',
  },
  {
    value: 'view_analytics',
    label: 'View Analytics',
    description: 'Can access sales analytics dashboard and financial performance',
    category: 'Back Office',
  },
  {
    value: 'access_inventory',
    label: 'Inventory Management',
    description: 'Can add, edit, or delete catalog products, stock, and barcodes',
    category: 'Back Office',
  },
  {
    value: 'generate_reports',
    label: 'Generate Reports',
    description: 'Can export sales, GST tax summaries, and inventory CSV reports',
    category: 'Back Office',
  },
  {
    value: 'manage_employees',
    label: 'Staff Management',
    description: 'Can manage employees, shift drawer reconciliation, and attendance',
    category: 'Administration',
  },
  {
    value: 'access_settings',
    label: 'System Settings',
    description: 'Can configure hardware printers, shop details, and POS settings',
    category: 'Administration',
  },
];

export const PERMISSION_KEYS: Permission[] = ALL_PERMISSIONS.map(p => p.value);

export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, Permission[]> = {
  owner: [
    'access_billing',
    'edit_product_price',
    'delete_bill_items',
    'apply_discounts',
    'view_analytics',
    'access_inventory',
    'view_transaction_history',
    'generate_reports',
    'access_settings',
    'manage_employees',
  ],
  'co-owner': [
    'access_billing',
    'edit_product_price',
    'delete_bill_items',
    'apply_discounts',
    'view_analytics',
    'access_inventory',
    'view_transaction_history',
    'generate_reports',
    'access_settings',
    'manage_employees',
  ],
  manager: [
    'access_billing',
    'edit_product_price',
    'delete_bill_items',
    'apply_discounts',
    'view_analytics',
    'access_inventory',
    'view_transaction_history',
    'generate_reports',
    'manage_employees',
  ],
  cashier: [
    'access_billing',
    'apply_discounts',
    'view_transaction_history',
  ],
  inventory_manager: [
    'access_inventory',
    'view_analytics',
    'generate_reports',
    'view_transaction_history',
  ],
  accountant: [
    'view_analytics',
    'view_transaction_history',
    'generate_reports',
  ],
  employee: [
    'access_billing',
    'view_transaction_history',
  ],
};

export const ROLE_LABELS: Record<UserRole, { label: string; badge: string; description: string }> = {
  owner: {
    label: 'Store Owner',
    badge: 'Owner',
    description: 'Full unrestricted access to all store operations and configurations',
  },
  'co-owner': {
    label: 'Co-Owner',
    badge: 'Co-Owner',
    description: 'Unrestricted partner access matching Store Owner privileges',
  },
  manager: {
    label: 'Store Manager',
    badge: 'Manager',
    description: 'Oversees billing, inventory, staff, discounts, and voids',
  },
  cashier: {
    label: 'Cashier',
    badge: 'Cashier',
    description: 'Fast front-desk customer billing, coupons, and receipt reprints',
  },
  inventory_manager: {
    label: 'Inventory Manager',
    badge: 'Inventory',
    description: 'Controls stock intake, catalog updates, barcodes, and reorders',
  },
  accountant: {
    label: 'Accountant',
    badge: 'Accountant',
    description: 'Audits sales metrics, GST tax ledgers, and financial reports',
  },
  employee: {
    label: 'General Staff',
    badge: 'Staff',
    description: 'Standard retail counter checkout and receipt viewing',
  },
};

/**
 * Returns effective permissions for a user object.
 * If user is owner or co-owner, all permissions are granted.
 * If explicit permissions exist, uses them; otherwise falls back to role defaults.
 */
export function getEffectivePermissions(user: { role?: string; permissions?: (Permission | string)[] } | null | undefined): Permission[] {
  if (!user) return [];

  const role = (user.role || 'employee').toLowerCase() as UserRole;
  if (role === 'owner' || role === 'co-owner') {
    return ALL_PERMISSIONS.map(p => p.value);
  }

  if (Array.isArray(user.permissions) && user.permissions.length > 0) {
    return user.permissions as Permission[];
  }

  const defaults = ROLE_DEFAULT_PERMISSIONS[role];
  if (defaults) return defaults;

  return ROLE_DEFAULT_PERMISSIONS.employee;
}

/**
 * Checks whether a given user possesses the specified permission.
 */
export function hasUserPermission(
  user: { role?: string; permissions?: (Permission | string)[] } | null | undefined,
  permission: Permission | Permission[]
): boolean {
  if (!user) return false;
  const role = (user.role || 'employee').toLowerCase();
  if (role === 'owner' || role === 'co-owner') return true;

  const perms = getEffectivePermissions(user);
  if (Array.isArray(permission)) {
    return permission.some(p => perms.includes(p));
  }
  return perms.includes(permission);
}
