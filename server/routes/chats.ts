import { Router } from 'express';
import { db } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/chats - Get recent chat history (last 24 hours)
router.get('/', authenticateToken, (req: AuthRequest, res) => {
  try {
    const cutOffTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    // Select chats that are less than 24 hours old
    const chats = db.prepare('SELECT * FROM chats WHERE timestamp >= ? ORDER BY timestamp ASC').all(cutOffTime) as any[];
    
    const parsedChats = chats.map((c: any) => ({
      id: c.id,
      senderName: c.sender_name,
      senderRole: c.sender_role,
      ciphertext: c.ciphertext,
      iv: c.iv,
      timestamp: c.timestamp,
      fingerprint: c.fingerprint,
      recipientName: c.recipient_name,
      isBillTransfer: Boolean(c.is_bill_transfer)
    }));
    
    res.json(parsedChats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/chats/developer - Retrieve chat archives by date and sender (Developer ONLY)
router.get('/developer', authenticateToken, (req: AuthRequest, res) => {
  try {
    if (req.user?.username !== 'developer') {
      return res.status(403).json({ error: 'Developer access required' });
    }
    
    const { date, sender } = req.query;
    let query = 'SELECT * FROM chats';
    const params: any[] = [];
    const conditions: string[] = [];
    
    if (date && typeof date === 'string') {
      conditions.push('timestamp >= ? AND timestamp <= ?');
      params.push(`${date}T00:00:00.000Z`, `${date}T23:59:59.999Z`);
    }
    
    if (sender && typeof sender === 'string' && sender !== 'All') {
      conditions.push('sender_name = ?');
      params.push(sender);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY timestamp ASC';
    
    const chats = db.prepare(query).all(...params) as any[];
    
    const parsedChats = chats.map((c: any) => ({
      id: c.id,
      senderName: c.sender_name,
      senderRole: c.sender_role,
      ciphertext: c.ciphertext,
      iv: c.iv,
      timestamp: c.timestamp,
      fingerprint: c.fingerprint,
      recipientName: c.recipient_name,
      isBillTransfer: Boolean(c.is_bill_transfer)
    }));
    
    res.json(parsedChats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/chats/senders - Get distinct cashiers present in chat history (Developer ONLY)
router.get('/senders', authenticateToken, (req: AuthRequest, res) => {
  try {
    if (req.user?.username !== 'developer') {
      return res.status(403).json({ error: 'Developer access required' });
    }
    
    const senders = db.prepare('SELECT DISTINCT sender_name FROM chats ORDER BY sender_name ASC').all() as any[];
    res.json(senders.map((s: any) => s.sender_name));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/chats/:id - Edit any chat message (Developer ONLY)
router.put('/:id', authenticateToken, (req: AuthRequest, res) => {
  if (req.user?.username !== 'developer') {
    return res.status(403).json({ error: 'Developer access required' });
  }
  const { id } = req.params;
  const { ciphertext, iv } = req.body;
  try {
    db.prepare('UPDATE chats SET ciphertext = ?, iv = ? WHERE id = ?').run(ciphertext, iv, id);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/chats/:id - Delete any chat message (Developer ONLY)
router.delete('/:id', authenticateToken, (req: AuthRequest, res) => {
  if (req.user?.username !== 'developer') {
    return res.status(403).json({ error: 'Developer access required' });
  }
  const { id } = req.params;
  try {
    db.prepare('DELETE FROM chats WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
