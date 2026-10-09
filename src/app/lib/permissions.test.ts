import { describe, it, expect, vi } from 'vitest';
import {
  ALL_PERMISSIONS,
  PERMISSION_KEYS,
  ROLE_DEFAULT_PERMISSIONS,
  getEffectivePermissions,
  hasUserPermission,
  type Permission,
  type UserRole
} from './permissions';
import {
  getEffectivePermissions as getServerEffectivePermissions,
  requirePermission,
  requireOwner,
  type AuthRequest
} from '../../../server/middleware/auth';

describe('Role-Based Access Control (RBAC) System', () => {
  describe('Permission Definitions & Role Default Presets', () => {
    it('defines exactly the 10 supported system permissions with metadata', () => {
      expect(ALL_PERMISSIONS).toHaveLength(10);
      expect(PERMISSION_KEYS).toHaveLength(10);
      expect(PERMISSION_KEYS).toEqual([
        'access_billing',
        'edit_product_price',
        'delete_bill_items',
        'apply_discounts',
        'view_transaction_history',
        'view_analytics',
        'access_inventory',
        'generate_reports',
        'manage_employees',
        'access_settings'
      ]);
    });

    it('assigns all 10 permissions to owner and co-owner', () => {
      expect(ROLE_DEFAULT_PERMISSIONS.owner).toHaveLength(10);
      expect(ROLE_DEFAULT_PERMISSIONS['co-owner']).toHaveLength(10);
      PERMISSION_KEYS.forEach(p => {
        expect(ROLE_DEFAULT_PERMISSIONS.owner).toContain(p);
        expect(ROLE_DEFAULT_PERMISSIONS['co-owner']).toContain(p);
      });
    });

    it('assigns managerial permissions to manager (all except access_settings)', () => {
      expect(ROLE_DEFAULT_PERMISSIONS.manager).toHaveLength(9);
      expect(ROLE_DEFAULT_PERMISSIONS.manager).toContain('access_billing');
      expect(ROLE_DEFAULT_PERMISSIONS.manager).toContain('edit_product_price');
      expect(ROLE_DEFAULT_PERMISSIONS.manager).toContain('delete_bill_items');
      expect(ROLE_DEFAULT_PERMISSIONS.manager).toContain('apply_discounts');
      expect(ROLE_DEFAULT_PERMISSIONS.manager).toContain('view_analytics');
      expect(ROLE_DEFAULT_PERMISSIONS.manager).toContain('access_inventory');
      expect(ROLE_DEFAULT_PERMISSIONS.manager).toContain('view_transaction_history');
      expect(ROLE_DEFAULT_PERMISSIONS.manager).toContain('generate_reports');
      expect(ROLE_DEFAULT_PERMISSIONS.manager).toContain('manage_employees');
      expect(ROLE_DEFAULT_PERMISSIONS.manager).not.toContain('access_settings');
    });

    it('restricts cashier default preset to safe register operations', () => {
      expect(ROLE_DEFAULT_PERMISSIONS.cashier).toEqual([
        'access_billing',
        'apply_discounts',
        'view_transaction_history'
      ]);
      expect(ROLE_DEFAULT_PERMISSIONS.cashier).not.toContain('edit_product_price');
      expect(ROLE_DEFAULT_PERMISSIONS.cashier).not.toContain('delete_bill_items');
      expect(ROLE_DEFAULT_PERMISSIONS.cashier).not.toContain('access_settings');
      expect(ROLE_DEFAULT_PERMISSIONS.cashier).not.toContain('manage_employees');
    });

    it('assigns inventory and analytical permissions to inventory_manager', () => {
      expect(ROLE_DEFAULT_PERMISSIONS.inventory_manager).toEqual([
        'access_inventory',
        'view_analytics',
        'generate_reports',
        'view_transaction_history'
      ]);
      expect(ROLE_DEFAULT_PERMISSIONS.inventory_manager).not.toContain('access_billing');
      expect(ROLE_DEFAULT_PERMISSIONS.inventory_manager).not.toContain('edit_product_price');
    });

    it('assigns ledger, history, and report permissions to accountant', () => {
      expect(ROLE_DEFAULT_PERMISSIONS.accountant).toEqual([
        'view_analytics',
        'view_transaction_history',
        'generate_reports'
      ]);
      expect(ROLE_DEFAULT_PERMISSIONS.accountant).not.toContain('access_billing');
      expect(ROLE_DEFAULT_PERMISSIONS.accountant).not.toContain('access_inventory');
      expect(ROLE_DEFAULT_PERMISSIONS.accountant).not.toContain('access_settings');
    });

    it('assigns base billing and history permissions to general employee', () => {
      expect(ROLE_DEFAULT_PERMISSIONS.employee).toEqual([
        'access_billing',
        'view_transaction_history'
      ]);
    });
  });

  describe('Client getEffectivePermissions() evaluation', () => {
    it('returns empty array when user is null or undefined', () => {
      expect(getEffectivePermissions(null)).toEqual([]);
      expect(getEffectivePermissions(undefined)).toEqual([]);
    });

    it('always returns all 10 permissions for owner regardless of user.permissions', () => {
      const ownerUser = { id: 'u1', role: 'owner' as UserRole, permissions: [] };
      const effective = getEffectivePermissions(ownerUser);
      expect(effective).toEqual(PERMISSION_KEYS);
    });

    it('always returns all 10 permissions for co-owner regardless of user.permissions', () => {
      const coOwnerUser = { id: 'u2', role: 'co-owner' as UserRole, permissions: ['access_billing' as Permission] };
      const effective = getEffectivePermissions(coOwnerUser);
      expect(effective).toEqual(PERMISSION_KEYS);
    });

    it('returns role defaults when user.permissions is empty or undefined', () => {
      const cashierUser = { id: 'u3', role: 'cashier' as UserRole, permissions: [] };
      expect(getEffectivePermissions(cashierUser)).toEqual(ROLE_DEFAULT_PERMISSIONS.cashier);

      const managerUser = { id: 'u4', role: 'manager' as UserRole };
      expect(getEffectivePermissions(managerUser)).toEqual(ROLE_DEFAULT_PERMISSIONS.manager);
    });

    it('preserves custom explicit permissions overrides for non-owners', () => {
      const customCashier = {
        id: 'u5',
        role: 'cashier' as UserRole,
        permissions: ['access_billing', 'edit_product_price'] as Permission[]
      };
      expect(getEffectivePermissions(customCashier)).toEqual(['access_billing', 'edit_product_price']);
    });
  });

  describe('Client hasUserPermission() check', () => {
    it('returns false for unauthenticated / null user', () => {
      expect(hasUserPermission(null, 'access_billing')).toBe(false);
      expect(hasUserPermission(undefined, 'view_analytics')).toBe(false);
    });

    it('returns true for owner and co-owner for ANY permission', () => {
      const owner = { id: 'o1', role: 'owner' as UserRole };
      const coOwner = { id: 'co1', role: 'co-owner' as UserRole };

      PERMISSION_KEYS.forEach(p => {
        expect(hasUserPermission(owner, p)).toBe(true);
        expect(hasUserPermission(coOwner, p)).toBe(true);
      });
    });

    it('correctly checks individual permissions for cashier', () => {
      const cashier = { id: 'c1', role: 'cashier' as UserRole };

      expect(hasUserPermission(cashier, 'access_billing')).toBe(true);
      expect(hasUserPermission(cashier, 'apply_discounts')).toBe(true);
      expect(hasUserPermission(cashier, 'view_transaction_history')).toBe(true);

      // Denied actions
      expect(hasUserPermission(cashier, 'edit_product_price')).toBe(false);
      expect(hasUserPermission(cashier, 'delete_bill_items')).toBe(false);
      expect(hasUserPermission(cashier, 'access_settings')).toBe(false);
      expect(hasUserPermission(cashier, 'manage_employees')).toBe(false);
      expect(hasUserPermission(cashier, 'access_inventory')).toBe(false);
    });

    it('supports array of permissions (logical OR)', () => {
      const cashier = { id: 'c1', role: 'cashier' as UserRole };
      // Cashier has access_billing, but lacks manage_employees
      expect(hasUserPermission(cashier, ['manage_employees', 'access_billing'])).toBe(true);
      // Cashier has neither manage_employees nor access_settings
      expect(hasUserPermission(cashier, ['manage_employees', 'access_settings'])).toBe(false);
    });

    it('respects explicitly granted custom permissions', () => {
      const trustedCashier = {
        id: 'c2',
        role: 'cashier' as UserRole,
        permissions: ['access_billing', 'edit_product_price', 'delete_bill_items'] as Permission[]
      };

      expect(hasUserPermission(trustedCashier, 'edit_product_price')).toBe(true);
      expect(hasUserPermission(trustedCashier, 'delete_bill_items')).toBe(true);
      expect(hasUserPermission(trustedCashier, 'access_settings')).toBe(false);
    });
  });

  describe('Server Auth Middleware RBAC', () => {
    it('getServerEffectivePermissions mirrors role presets and handles owner bypass', () => {
      const ownerPerms = getServerEffectivePermissions('owner');
      expect(ownerPerms).toHaveLength(10);
      PERMISSION_KEYS.forEach(p => expect(ownerPerms).toContain(p));

      const coOwnerPerms = getServerEffectivePermissions('co-owner');
      expect(coOwnerPerms).toHaveLength(10);
      PERMISSION_KEYS.forEach(p => expect(coOwnerPerms).toContain(p));

      expect(getServerEffectivePermissions('cashier')).toEqual(ROLE_DEFAULT_PERMISSIONS.cashier);
      expect(getServerEffectivePermissions('cashier', ['access_billing', 'edit_product_price'])).toEqual([
        'access_billing',
        'edit_product_price'
      ]);
    });

    it('requirePermission middleware permits owners unconditionally', () => {
      const middleware = requirePermission('access_settings');
      const req: Partial<AuthRequest> = {
        user: {
          id: 'dev_1',
          username: 'developer',
          name: 'Developer',
          role: 'owner',
          permissions: [],
          sessionId: 's1'
        }
      };
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      middleware(req as AuthRequest, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('requirePermission middleware blocks unauthorized roles with 403', () => {
      const middleware = requirePermission('access_settings');
      const req: Partial<AuthRequest> = {
        user: {
          id: 'cashier_1',
          username: 'cashier',
          name: 'Cashier Staff',
          role: 'cashier',
          permissions: ['access_billing', 'view_transaction_history'],
          sessionId: 's2'
        }
      };
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      middleware(req as AuthRequest, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.stringContaining('access_settings')
      }));
    });

    it('requirePermission middleware permits users with role default or explicit permission', () => {
      const middleware = requirePermission('access_inventory');
      const req: Partial<AuthRequest> = {
        user: {
          id: 'inv_1',
          username: 'inv_manager',
          name: 'Inventory Head',
          role: 'inventory_manager',
          permissions: [],
          sessionId: 's3'
        }
      };
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      middleware(req as AuthRequest, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('requireOwner blocks managers and non-owners with 403', () => {
      const req: Partial<AuthRequest> = {
        user: {
          id: 'mgr_1',
          username: 'manager',
          name: 'Store Manager',
          role: 'manager',
          permissions: [],
          sessionId: 's4'
        }
      };
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      requireOwner(req as AuthRequest, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Owner access required' });
    });

    it('requireOwner permits co-owners', () => {
      const req: Partial<AuthRequest> = {
        user: {
          id: 'co_1',
          username: 'coowner',
          name: 'Co-Owner',
          role: 'co-owner',
          permissions: [],
          sessionId: 's5'
        }
      };
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      requireOwner(req as AuthRequest, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
