import jwt from 'jsonwebtoken';
import { db } from '../db';
export const JWT_SECRET = process.env.JWT_SECRET || 'retail-pos-lan-secret-2026';
/** Attach decoded user to req.user; reject if no/invalid token. */
export function authenticateToken(req, res, next) {
    const auth = req.headers['authorization'];
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token)
        return res.status(401).json({ error: 'Authentication required' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        // Check if the session is still active in the database
        const session = db.prepare('SELECT logout_time FROM login_sessions WHERE id = ?').get(decoded.sessionId);
        if (!session || session.logout_time !== null) {
            return res.status(401).json({ error: 'Session invalidated or logged out' });
        }
        req.user = decoded;
        next();
    }
    catch {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
}
/** Allow only owner and co-owner roles. */
export function requireOwner(req, res, next) {
    if (!req.user)
        return res.status(401).json({ error: 'Authentication required' });
    if (req.user.role !== 'owner' && req.user.role !== 'co-owner') {
        return res.status(403).json({ error: 'Owner access required' });
    }
    next();
}
/** Check a specific permission (owners bypass all checks). */
export function requirePermission(permission) {
    return (req, res, next) => {
        if (!req.user)
            return res.status(401).json({ error: 'Authentication required' });
        if (req.user.role === 'owner' || req.user.role === 'co-owner')
            return next();
        if (!req.user.permissions.includes(permission)) {
            return res.status(403).json({ error: `Permission required: ${permission}` });
        }
        next();
    };
}
