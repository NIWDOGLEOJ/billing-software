import { Router, Response } from 'express';
import { db } from '../db';
import { AuthRequest, authenticateToken, requireOwner } from '../middleware/auth';

const router = Router();

// GET /api/shifts/active — Get active shift for logged-in cashier
router.get('/active', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  try {
    const activeShift = db.prepare("SELECT * FROM shift_records WHERE user_id = ? AND status = 'active'").get(req.user.id);
    res.json(activeShift || null);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/shifts/start — Start a shift with initial floating cash
router.post('/start', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  const { initialCash } = req.body;

  if (initialCash === undefined || isNaN(Number(initialCash))) {
    return res.status(400).json({ error: 'Valid initial cash float is required' });
  }

  try {
    // Check if there is already an active shift
    const existing = db.prepare("SELECT * FROM shift_records WHERE user_id = ? AND status = 'active'").get(req.user.id);
    if (existing) {
      return res.status(400).json({ error: 'You already have an active shift in progress' });
    }

    const shiftId = `shift_${Math.random().toString(36).substring(2, 15)}`;
    const startTime = new Date().toISOString();

    db.prepare(`
      INSERT INTO shift_records (id, user_id, user_name, start_time, initial_cash, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `).run(shiftId, req.user.id, req.user.name, startTime, Number(initialCash));

    const started = db.prepare('SELECT * FROM shift_records WHERE id = ?').get(shiftId);

    const broadcast = req.app.get('broadcast');
    if (broadcast && req.user.id !== 'dev_1') {
      broadcast({ type: 'SHIFT_CHANGED', data: started });
    }

    res.status(201).json(started);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/shifts/end — End shift and compute daily Z-Report
router.post('/end', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  const { actualCash, actualUpi, actualCard, notes } = req.body;

  if (actualCash === undefined || actualUpi === undefined || actualCard === undefined) {
    return res.status(400).json({ error: 'Actual counts are required' });
  }

  try {
    // 1. Find active shift
    const activeShift = db.prepare("SELECT * FROM shift_records WHERE user_id = ? AND status = 'active'").get(req.user.id) as any;
    if (!activeShift) {
      return res.status(404).json({ error: 'No active shift found to end' });
    }

    // 2. Fetch and compile system sales totals completed by this cashier during this shift
    const bills = db.prepare('SELECT total, payment_mode FROM bills WHERE cashier_id = ? AND date >= ?').all(req.user.id, activeShift.start_time) as any[];

    let systemCash = 0;
    let systemUpi = 0;
    let systemCard = 0;

    for (const bill of bills) {
      const mode = (bill.payment_mode || 'cash').toLowerCase();
      if (mode === 'cash') systemCash += bill.total;
      else if (mode === 'upi') systemUpi += bill.total;
      else if (mode === 'card') systemCard += bill.total;
    }

    const expectedCash = activeShift.initial_cash + systemCash;
    const discrepancyCash = Number(actualCash) - expectedCash;
    const endTime = new Date().toISOString();

    // 3. Update shift Z-Report
    db.prepare(`
      UPDATE shift_records
      SET end_time = ?, system_cash = ?, system_upi = ?, system_card = ?,
          actual_cash = ?, actual_upi = ?, actual_card = ?, discrepancy_cash = ?,
          status = 'closed', notes = ?
      WHERE id = ?
    `).run(
      endTime,
      systemCash,
      systemUpi,
      systemCard,
      Number(actualCash),
      Number(actualUpi),
      Number(actualCard),
      discrepancyCash,
      notes || '',
      activeShift.id
    );

    const closedShift = db.prepare('SELECT * FROM shift_records WHERE id = ?').get(activeShift.id);

    const broadcast = req.app.get('broadcast');
    if (broadcast && req.user.id !== 'dev_1') {
      broadcast({ type: 'SHIFT_CHANGED', data: closedShift });
    }

    res.json(closedShift);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/shifts — List all closed Z-Reports for owner auditing (requires owner)
router.get('/', authenticateToken, requireOwner, (req, res) => {
  try {
    const reports = db.prepare(`
      SELECT s.*, 
        (SELECT COUNT(*) FROM break_records b WHERE b.user_id = s.user_id AND b.end_time IS NULL) as on_break
      FROM shift_records s 
      WHERE s.user_id != 'dev_1'
      ORDER BY s.start_time DESC
    `).all();
    res.json(reports);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
