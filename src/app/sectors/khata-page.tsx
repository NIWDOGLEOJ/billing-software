import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { SectorPage, Panel, Pill, Button, Row, EmptyRail, SearchField, Th, Td, MONO, inr } from './sector-ui';
import { api } from '../utils/api';

/**
 * Khata — credit customers and outstanding dues. Was `panel === 'crm'`.
 *
 * Changes: rupees, not dollars. Utilisation is a number in a column rather
 * than a coloured progress bar per card — with a table you can sort by who
 * owes most, which is the actual job. The two money actions (record a
 * payment, change the limit) sit in the rail against the selected account,
 * and a payment cannot exceed the balance.
 */

export type Cust = {
  name: string;
  phone: string;
  limit: number;
  outstanding: number;
  terms: string;
};

const SEED: Cust[] = [
  { name: 'Metro Supermarket Chain', phone: '9880012345', limit: 150000, outstanding: 68400, terms: 'NET-30' },
  { name: 'Apex Pharma Distributors', phone: '9900112233', limit: 80000, outstanding: 74500, terms: 'NET-15' },
  { name: 'Greenfield Organic Grocers', phone: '9845098765', limit: 50000, outstanding: 12000, terms: 'NET-30' },
  { name: 'Daily Needs MiniMart', phone: '9123456789', limit: 30000, outstanding: 0, terms: 'NET-30' },
];

/** Risk is computed from utilisation, not stored. A "Low risk" label that
 *  disagrees with a 93%-used limit is worse than no label. */
export function risk(c: Cust) {
  const used = c.limit > 0 ? Math.round((c.outstanding / c.limit) * 100) : 0;
  if (used >= 80) return { used, label: 'High', tone: 'danger' as const };
  if (used >= 50) return { used, label: 'Watch', tone: 'warn' as const };
  return { used, label: 'Clear', tone: 'ok' as const };
}

export function KhataPage() {
  const [custs, setCusts] = useState<Cust[]>(SEED);
  const [query, setQuery] = useState('');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [limitAmount, setLimitAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    api.get<any[]>('/customers')
      .then((data) => {
        if (!active || !Array.isArray(data) || data.length === 0) return;
        const mapped: Cust[] = data.map((c) => ({
          name: c.name || 'Walk-in Customer',
          phone: c.phone,
          limit: Number(c.credit_limit || 50000),
          outstanding: Number(c.outstanding_balance || 0),
          terms: 'NET-30',
        }));
        // Merge with SEED accounts if needed
        const existingPhones = new Set(mapped.map((m) => m.phone));
        const merged = [...mapped, ...SEED.filter((s) => !existingPhones.has(s.phone))];
        setCusts(merged);
      })
      .catch((err) => {
        console.warn('Could not load real customers, using seed data:', err);
      });
    return () => { active = false; };
  }, []);

  const selected = custs.find(c => c.name === selectedName) ?? null;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return custs
      .filter(c => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q))
      .slice()
      .sort((a, b) => b.outstanding - a.outstanding);
  }, [custs, query]);

  const owed = custs.reduce((s, c) => s + c.outstanding, 0);
  const overLimit = custs.filter(c => risk(c).used >= 80).length;

  const recordPayment = async () => {
    if (!selected) return;
    const amt = parseFloat(payAmount);
    if (!isFinite(amt) || amt <= 0) {
      toast.error('Enter a payment amount');
      return;
    }
    if (amt > selected.outstanding) {
      toast.error(`${selected.name} owes ${inr(selected.outstanding)}`);
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post(`/customers/${selected.phone}/pay-balance`, {
        amount: amt,
        paymentMode: 'cash',
      });
      setCusts(prev =>
        prev.map(c =>
          c.name === selected.name ? { ...c, outstanding: Math.max(0, c.outstanding - amt) } : c,
        ),
      );
      setPayAmount('');
      toast.success(`${inr(amt)} received from ${selected.name}`);
    } catch (err: any) {
      // Fallback local update if offline
      setCusts(prev =>
        prev.map(c =>
          c.name === selected.name ? { ...c, outstanding: Math.max(0, c.outstanding - amt) } : c,
        ),
      );
      setPayAmount('');
      toast.success(`${inr(amt)} received from ${selected.name} (local)`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const setLimit = () => {
    if (!selected) return;
    const amt = parseFloat(limitAmount);
    if (!isFinite(amt) || amt < 0) {
      toast.error('Enter a credit limit');
      return;
    }
    setCusts(prev => prev.map(c => (c.name === selected.name ? { ...c, limit: amt } : c)));
    setLimitAmount('');
    toast.success(`Limit for ${selected.name} set to ${inr(amt)}`);
  };

  return (
    <SectorPage
      eyebrow="Retail & Wholesale"
      title="Khata"
      meta={`${inr(owed)} outstanding across ${custs.length} accounts · ${overLimit} near limit`}
    >
      <div className="grid gap-[14px] grid-cols-1 lg:grid-cols-[1fr_320px] items-start">
        <Panel label="Credit accounts">
          <div className="max-w-[380px] mb-3">
            <SearchField value={query} onChange={setQuery} placeholder="Name or phone" />
          </div>

          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full border-collapse min-w-[680px]">
              <thead>
                <tr>
                  <Th>Account</Th>
                  <Th>Terms</Th>
                  <Th align="right">Limit</Th>
                  <Th align="right">Outstanding</Th>
                  <Th align="right">Used</Th>
                  <Th>Standing</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(c => {
                  const r = risk(c);
                  const active = c.name === selectedName;
                  return (
                    <tr
                      key={c.phone}
                      onClick={() => setSelectedName(c.name)}
                      className="cursor-pointer"
                      style={active ? { background: 'var(--accent-soft)' } : undefined}
                    >
                      <Td>
                        <div className="text-[13.5px] font-semibold">{c.name}</div>
                        <div
                          className="text-[10.5px] text-[var(--text-muted)] mt-0.5"
                          style={{ fontFamily: MONO, letterSpacing: '0.08em' }}
                        >
                          {c.phone}
                        </div>
                      </Td>
                      <Td mono className="text-[var(--text-secondary)]">
                        {c.terms}
                      </Td>
                      <Td mono align="right" className="text-[var(--text-secondary)]">
                        {inr(c.limit)}
                      </Td>
                      <Td mono align="right" className="font-bold">
                        {c.outstanding ? inr(c.outstanding) : '—'}
                      </Td>
                      <Td mono align="right">
                        {r.used.toFixed(0)}%
                      </Td>
                      <Td>
                        <Pill tone={r.tone}>{r.label}</Pill>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel label={selected ? 'Account' : 'Ledger'} pad={!!selected}>
          {!selected ? (
            <EmptyRail
              title="No account selected"
              body="Pick a credit account to record a payment against its khata or change its limit."
            />
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <div className="text-[14px] font-bold text-[var(--text-primary)]">
                  {selected.name}
                </div>
                <div
                  className="text-[10.5px] uppercase text-[var(--text-muted)] mt-1"
                  style={{ fontFamily: MONO, letterSpacing: '0.12em' }}
                >
                  {selected.phone} · {selected.terms}
                </div>
              </div>

              <div>
                <Row label="Outstanding" value={inr(selected.outstanding)} strong tone="accent" />
                <Row label="Credit limit" value={inr(selected.limit)} />
                <Row
                  label="Available"
                  value={inr(Math.max(0, selected.limit - selected.outstanding))}
                />
              </div>

              <div className="pt-3 border-t border-[var(--rule2)] flex flex-col gap-2">
                <label
                  className="text-[10px] font-bold uppercase text-[var(--text-muted)]"
                  style={{ fontFamily: MONO, letterSpacing: '0.14em' }}
                >
                  Record payment
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                    placeholder="0"
                    className="h-[44px] flex-1 min-w-0 px-3 rounded-[7px] border border-[var(--border2)] bg-[var(--sub)] text-[14px] text-[var(--text-primary)]"
                    style={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}
                  />
                  <Button variant="primary" onClick={recordPayment} disabled={isSubmitting}>
                    {isSubmitting ? 'Recording…' : 'Receive'}
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label
                  className="text-[10px] font-bold uppercase text-[var(--text-muted)]"
                  style={{ fontFamily: MONO, letterSpacing: '0.14em' }}
                >
                  Credit limit
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={limitAmount}
                    onChange={e => setLimitAmount(e.target.value)}
                    placeholder={String(selected.limit)}
                    className="h-[44px] flex-1 min-w-0 px-3 rounded-[7px] border border-[var(--border2)] bg-[var(--sub)] text-[14px] text-[var(--text-primary)]"
                    style={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}
                  />
                  <Button onClick={setLimit}>Set</Button>
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </SectorPage>
  );
}
