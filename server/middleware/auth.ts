import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db';

export const JWT_SECRET = process.env.JWT_SECRET || 'retail-pos-lan-secret-2026';

export const ROLE_DEFAULT_PERMISSIONS: Record<string, string[]> = {
  owner: [
    'access_billing', 'edit_product_price', 'delete_bill_items', 'apply_discounts',
    'view_analytics', 'access_inventory', 'view_transaction_history', 'generate_reports',
    'access_settings', 'manage_employees'
  ],
  'co-owner': [
    'access_billing', 'edit_product_price', 'delete_bill_items', 'apply_discounts',
    'view_analytics', 'access_inventory', 'view_transaction_history', 'generate_reports',
    'access_settings', 'manage_employees'
  ],
  manager: [
    'access_billing', 'edit_product_price', 'delete_bill_items', 'apply_discounts',
    'view_analytics', 'access_inventory', 'view_transaction_history', 'generate_reports',
    'manage_employees'
  ],
  cashier: [
    'access_billing', 'apply_discounts', 'view_transaction_history'
  ],
  inventory_manager: [
    'access_inventory', 'view_analytics', 'generate_reports', 'view_transaction_history'
  ],
  accountant: [
    'view_analytics', 'view_transaction_history', 'generate_reports'
  ],
  employee: [
    'access_billing', 'view_transaction_history'
  ]
};

export function getEffectivePermissions(role: string, perms?: string[]): string[] {
  const normRole = (role || 'employee').toLowerCase();
  if (normRole === 'owner' || normRole === 'co-owner') {
    return [
      'access_billing', 'edit_product_price', 'delete_bill_items', 'apply_discounts',
      'view_analytics', 'access_inventory', 'view_transaction_history', 'generate_reports',
      'access_settings', 'manage_employees'
    ];
  }
  if (Array.isArray(perms) && perms.length > 0) {
    return perms;
  }
  return ROLE_DEFAULT_PERMISSIONS[normRole] || ROLE_DEFAULT_PERMISSIONS.employee;
}

export interface JwtPayload {
  id: string;
  username: string;
  name: string;
  role: string;
  permissions: string[];
  sessionId: string;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

/** Attach decoded user to req.user; reject if no/invalid token. */
export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const auth = req.headers['authorization'];
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    
    // Check if the session is still active in the database
    const session = db.prepare('SELECT logout_time FROM login_sessions WHERE id = ?').get(decoded.sessionId) as any;
    if (!session || session.logout_time !== null) {
      return res.status(401).json({ error: 'Session invalidated or logged out' });
    }
    
    req.user = decoded;
    next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

/** Allow only owner and co-owner roles. */
export function requireOwner(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  const role = (req.user.role || '').toLowerCase();
  if (role !== 'owner' && role !== 'co-owner') {
    return res.status(403).json({ error: 'Owner access required' });
  }
  next();
}

/** Check a specific permission or set of permissions (owners bypass all checks). */
export function requirePermission(permission: string | string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const normRole = (req.user.role || 'employee').toLowerCase();
    if (normRole === 'owner' || normRole === 'co-owner') return next();

    const userPerms = getEffectivePermissions(normRole, req.user.permissions);
    const required = Array.isArray(permission) ? permission : [permission];
    const hasPerm = required.some(p => userPerms.includes(p));

    if (!hasPerm) {
      return res.status(403).json({ error: `Permission required: ${required.join(' or ')}` });
    }
    next();
  };
}
