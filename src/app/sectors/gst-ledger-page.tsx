import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { SectorPage, Panel, Pill, Button, SearchField, Th, Td, Eyebrow, MONO, inr } from './sector-ui';
import { api } from '../utils/api';

/**
 * B2B GST ledger — was `panel === 'gstin'`.
 *
 * Two substantive fixes carried over from the design:
 *  - Amounts are rupees. The modal printed `$` here while the table panels
 *    printed `₹` for the same database.
 *  - Intra-state versus inter-state is DERIVED from the buyer's GSTIN state
 *    code against the store's, not stored as a label. A buyer in 27 gets IGST;
 *    a buyer in 29 (the store's state) gets CGST + SGST. That was a hand-typed
 *    string before, which is how a wrong return gets filed.
 */

const DEFAULT_HOME_STATE = '29';

const STATE_NAMES: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '19': 'West Bengal',
  '24': 'Gujarat',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
};

export type Invoice = {
  id: string;
  buyerName: string;
  gstin: string;
  taxable: number;
  rate: number;
};

const SEED: Invoice[] = [
  { id: 'inv-1001', buyerName: 'SuperBazaar Hypermarkets', gstin: '29AAAAA1111A1Z1', taxable: 45000, rate: 18 },
  { id: 'inv-1002', buyerName: 'Apex Healthcare Distributors', gstin: '27BBBBB2222B2Z2', taxable: 78000, rate: 18 },
  { id: 'inv-1003', buyerName: 'Greenfield Retail Ventures', gstin: '29CCCCC3333C3Z3', taxable: 24000, rate: 18 },
  { id: 'inv-1004', buyerName: 'Sagar Medical Agencies', gstin: '33DDDDD4444D4Z4', taxable: 12500, rate: 12 },
];

export function splitInvoice(inv: Invoice, homeState: string = DEFAULT_HOME_STATE) {
  const stateCode = inv.gstin ? inv.gstin.slice(0, 2) : homeState;
  const interState = stateCode !== homeState;
  const tax = (inv.taxable * inv.rate) / 100;
  return {
    stateCode,
    stateName: STATE_NAMES[stateCode] ?? `State ${stateCode}`,
    interState,
    igst: interState ? tax : 0,
    cgst: interState ? 0 : tax / 2,
    sgst: interState ? 0 : tax / 2,
    total: inv.taxable + tax,
  };
}

export function GstLedgerPage() {
  const [invoices, setInvoices] = useState<Invoice[]>(SEED);
  const [homeState, setHomeState] = useState<string>(() => {
    try {
      const gstin = localStorage.getItem('gstNumber') || '';
      return gstin.length >= 2 ? gstin.slice(0, 2) : DEFAULT_HOME_STATE;
    } catch {
      return DEFAULT_HOME_STATE;
    }
  });
  const [query, setQuery] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get<any[]>('/bills').catch(() => []),
      api.get<any>('/settings').catch(() => null),
    ]).then(([bills, settings]) => {
      if (!active) return;
      if (settings?.store_gstin && settings.store_gstin.length >= 2) {
        setHomeState(settings.store_gstin.slice(0, 2));
      }

      if (Array.isArray(bills)) {
        const b2bBills = bills.filter((b) => b.customer_gstin);
        if (b2bBills.length > 0) {
          const mapped: Invoice[] = b2bBills.map((b) => ({
            id: b.bill_number || b.id,
            buyerName: b.customer_name || 'B2B Client',
            gstin: b.customer_gstin,
            taxable: Number(b.subtotal || b.total - (b.gst_amount || 0)),
            rate: Number(b.gst_rate || 18),
          }));
          const existingIds = new Set(mapped.map((m) => m.id));
          const merged = [...mapped, ...SEED.filter((s) => !existingIds.has(s.id))];
          setInvoices(merged);
        }
      }
    });

    return () => { active = false; };
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices
      .map(inv => ({ inv, ...splitInvoice(inv, homeState) }))
      .filter(
        r =>
          !q ||
          r.inv.buyerName.toLowerCase().includes(q) ||
          r.inv.gstin.toLowerCase().includes(q),
      );
  }, [invoices, query, homeState]);

  const totals = rows.reduce(
    (a, r) => ({
      taxable: a.taxable + r.inv.taxable,
      cgst: a.cgst + r.cgst,
      sgst: a.sgst + r.sgst,
      igst: a.igst + r.igst,
      total: a.total + r.total,
    }),
    { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
  );

  const exportGstr = () => {
    setExporting(true);
    const payload = rows.map(r => ({
      invoice: r.inv.id,
      buyer: r.inv.buyerName,
      gstin: r.inv.gstin,
      place_of_supply: `${r.stateCode} — ${r.stateName}`,
      supply_type: r.interState ? 'inter-state' : 'intra-state',
      rate: r.inv.rate,
      taxable_value: r.inv.taxable,
      cgst: r.cgst,
      sgst: r.sgst,
      igst: r.igst,
      invoice_total: r.total,
    }));
    const href =
      'data:application/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(payload, null, 2));
    const a = document.createElement('a');
    a.href = href;
    a.download = `gstr1-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setExporting(false);
    toast.success(`GSTR-1 export written · ${payload.length} invoices`);
  };

  const summary = [
    { label: 'Taxable value', value: totals.taxable },
    { label: 'CGST', value: totals.cgst },
    { label: 'SGST', value: totals.sgst },
    { label: 'IGST', value: totals.igst },
  ];

  return (
    <SectorPage
      eyebrow="Retail & Wholesale"
      title="GST ledger"
      meta={`${rows.length} B2B invoices · place of supply derived from buyer GSTIN`}
      actions={
        <Button variant="primary" onClick={exportGstr} disabled={exporting || rows.length === 0}>
          Export GSTR-1
        </Button>
      }
    >
      <div className="grid gap-[14px] grid-cols-2 lg:grid-cols-4">
        {summary.map(s => (
          <div
            key={s.label}
            className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-4"
          >
            <Eyebrow>{s.label}</Eyebrow>
            <div
              className="text-[24px] font-bold tracking-[-0.02em] text-[var(--text-primary)] mt-2"
              style={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}
            >
              {inr(s.value)}
            </div>
          </div>
        ))}
      </div>

      <Panel label="Invoices">
        <div className="max-w-[380px] mb-3">
          <SearchField value={query} onChange={setQuery} placeholder="Buyer name or GSTIN" />
        </div>

        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full border-collapse min-w-[900px]">
            <thead>
              <tr>
                <Th>Invoice / buyer</Th>
                <Th>GSTIN</Th>
                <Th>Place of supply</Th>
                <Th align="right">Rate</Th>
                <Th align="right">Taxable</Th>
                <Th align="right">CGST</Th>
                <Th align="right">SGST</Th>
                <Th align="right">IGST</Th>
                <Th align="right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.inv.id}>
                  <Td>
                    <div className="text-[13.5px] font-semibold">{r.inv.buyerName}</div>
                    <div
                      className="text-[10.5px] uppercase text-[var(--text-muted)] mt-0.5"
                      style={{ fontFamily: MONO, letterSpacing: '0.1em' }}
                    >
                      {r.inv.id.toUpperCase()}
                    </div>
                  </Td>
                  <Td mono>{r.inv.gstin}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <span className="text-[12.5px] text-[var(--text-secondary)]">
                        {r.stateName}
                      </span>
                      <Pill tone={r.interState ? 'accent' : 'neutral'}>
                        {r.interState ? 'Inter' : 'Intra'}
                      </Pill>
                    </div>
                  </Td>
                  <Td mono align="right">
                    {r.inv.rate}%
                  </Td>
                  <Td mono align="right">
                    {inr(r.inv.taxable)}
                  </Td>
                  <Td mono align="right" className="text-[var(--text-secondary)]">
                    {r.cgst ? inr(r.cgst) : '—'}
                  </Td>
                  <Td mono align="right" className="text-[var(--text-secondary)]">
                    {r.sgst ? inr(r.sgst) : '—'}
                  </Td>
                  <Td mono align="right" className="text-[var(--text-secondary)]">
                    {r.igst ? inr(r.igst) : '—'}
                  </Td>
                  <Td mono align="right" className="font-bold">
                    {inr(r.total)}
                  </Td>
                </tr>
              ))}
              <tr>
                <Td className="font-bold">Total</Td>
                <Td />
                <Td />
                <Td />
                <Td mono align="right" className="font-bold">
                  {inr(totals.taxable)}
                </Td>
                <Td mono align="right" className="font-bold">
                  {inr(totals.cgst)}
                </Td>
                <Td mono align="right" className="font-bold">
                  {inr(totals.sgst)}
                </Td>
                <Td mono align="right" className="font-bold">
                  {inr(totals.igst)}
                </Td>
                <Td mono align="right" className="font-bold">
                  {inr(totals.total)}
                </Td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>
    </SectorPage>
  );
}
