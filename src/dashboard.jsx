import { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
//import { Card, CardContent } from '@/components/ui/card';
//import { Input } from '@/components/ui/input';
//import { Button } from '@/components/ui/button';
//import { Checkbox } from '@/components/ui/checkbox';
//import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/table';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import { motion } from 'framer-motion';

/**
 * Vapotank – Interactive e‑commerce dashboard
 * -------------------------------------------------
 * Drop /public/orders.csv (WooCommerce export) – no header edits required.
 * The dashboard auto‑parses the file and generates:
 *  – Top‑selling products
 *  – Best customers
 *  – Dormant customers (no purchase ≥ 120 days)
 *  – Best sales days (week‑day)
 *  – 20 most frequent product pairs (market‑basket)
 *  – E‑liquid sales by brand
 *  – Global KPIs & monthly trend
 *  – Multi‑criteria quick filter (customer email, product, date range)
 * -------------------------------------------------
 * Styling: Tailwind + shadcn/ui; animations via framer‑motion.
 */

/* ------------------------------------------------------------------
   Petits composants de secours (remplacent Card, Input, Button…)
------------------------------------------------------------------ */
/* ---------- Composants de base avec un peu de style ---------- */
const Card = ({ children, className = '' }) => (
  <div
    className={`mb-6 rounded-lg border border-gray-200 bg-white shadow-sm ${className}`}
  >
    {children}
  </div>
);

const CardContent = ({ children, className = '' }) => (
  <div className={`p-6 ${className}`}>{children}</div>
);

const Input = ({ className = '', ...rest }) => (
  <input
    {...rest}
    className={`w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring focus:ring-indigo-300 ${className}`}
  />
);

const Button = ({ children, variant = 'primary', className = '', ...rest }) => {
  const base =
    'inline-block rounded px-4 py-2 text-sm font-medium transition focus:outline-none';
  const styles =
    variant === 'secondary'
      ? 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
      : 'bg-indigo-600 text-white hover:bg-indigo-700';
  return (
    <button {...rest} className={`${base} ${styles} ${className}`}>
      {children}
    </button>
  );
};

/* ------------------------------------------------------------------ */

export default function Dashboard() {
  const [raw, setRaw] = useState([]);
  const [filters, setFilters] = useState({
    search: '', // free‑text fuzzy
    dateFrom: '',
    dateTo: '',
  });

  // Load CSV once ➜ array of objects
  useEffect(() => {
    Papa.parse('/orders.csv', {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: ({ data }) => setRaw(data),
    });
  }, []);

  // ---------- Helpers ----------
  function toNumber(val) {
    const n = parseFloat(String(val).replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }
  function parseDate(str) {
    return new Date(str);
  }

  // ---------- Filtered dataset ----------
  const data = useMemo(() => {
    if (!raw.length) return [];

    return raw.filter((row) => {
      const haystack = JSON.stringify(row).toLowerCase();
      const searchOk = filters.search
        ? haystack.includes(filters.search.toLowerCase())
        : true;

      const date = parseDate(row['Date de commande']);
      const fromOk = filters.dateFrom
        ? date >= new Date(filters.dateFrom)
        : true;
      const toOk = filters.dateTo ? date <= new Date(filters.dateTo) : true;

      return searchOk && fromOk && toOk;
    });
  }, [raw, filters]);

  // ---------- KPI cards ----------
  const kpi = useMemo(() => {
    if (!data.length) return null;
    const ordersByNo = groupBy(data, 'Numéro de commande');
    const orderSet = Object.values(ordersByNo).map((rows) => rows[0]);

    const totalSales = orderSet.reduce(
      (sum, o) => sum + toNumber(o['Montant total de la commande']),
      0
    );

    const totalOrders = orderSet.length;
    const aov = totalSales / (totalOrders || 1);

    const repeatRate =
      Object.values(groupBy(orderSet, 'E-mail (Facturation)')).filter(
        (arr) => arr.length > 1
      ).length / (orderSet.length || 1);

    return { totalSales, totalOrders, aov, repeatRate };
  }, [data]);

  // ---------- Top products ----------
  const topProducts = useMemo(() => {
    const map = {};
    data.forEach((row) => {
      const name = row['Nom de l’élément'];
      const qty = toNumber(row['Quantité (- Remboursement)']);
      map[name] = (map[name] || 0) + qty;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
  }, [data]);

  // ---------- Top customers ----------
  const topCustomers = useMemo(() => {
    const map = {};
    const ordersByNo = groupBy(data, 'Numéro de commande');
    Object.values(ordersByNo).forEach((rows) => {
      const row = rows[0];
      const email = row['E-mail (Facturation)'];
      const amount = toNumber(row['Montant total de la commande']);
      map[email] = (map[email] || 0) + amount;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
  }, [data]);

  // ---------- Dormant customers (≥120 days) ----------
  const dormantCustomers = useMemo(() => {
    const map = {};
    data.forEach((row) => {
      const email = row['E-mail (Facturation)'];
      const date = parseDate(row['Date de commande']);
      map[email] = map[email] ? (date > map[email] ? date : map[email]) : date;
    });
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 120);
    return Object.entries(map)
      .filter(([, last]) => last <= cutoff)
      .map(([email, last]) => ({ email, last: last.toLocaleDateString() }))
      .sort((a, b) => new Date(a.last) - new Date(b.last));
  }, [data]);

  // ---------- Best weekday ----------
  const weekdayData = useMemo(() => {
    const map = {
      Monday: 0,
      Tuesday: 0,
      Wednesday: 0,
      Thursday: 0,
      Friday: 0,
      Saturday: 0,
      Sunday: 0,
    };
    const ordersByNo = groupBy(data, 'Numéro de commande');
    Object.values(ordersByNo).forEach((rows) => {
      const row = rows[0];
      const amount = toNumber(row['Montant total de la commande']);
      const day = new Date(row['Date de commande']).toLocaleDateString(
        'en-US',
        {
          weekday: 'long',
        }
      );
      map[day] += amount;
    });
    return Object.keys(map)
      .map((day) => ({ day, total: map[day] }))
      .sort((a, b) => b.total - a.total);
  }, [data]);

  // ---------- Product pairs (market basket) ----------
  const productPairs = useMemo(() => {
    const counter = {};
    const ordersByNo = groupBy(data, 'Numéro de commande');
    Object.values(ordersByNo).forEach((rows) => {
      const items = [...new Set(rows.map((r) => r['Nom de l’élément']))];
      items.sort();
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const key = `${items[i]} | ${items[j]}`;
          counter[key] = (counter[key] || 0) + 1;
        }
      }
    });
    const sorted = Object.entries(counter)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([pair, count]) => ({ pair, count }));
    return sorted;
  }, [data]);

  // ---------- E‑liquid sales by brand ----------
  const eliquidByBrand = useMemo(() => {
    const result = {};
    data.forEach((row) => {
      const name = row['Nom de l’élément'] || '';
      if (!name.includes('E-liquide')) return;
      const brandMatch = name.match(/E-liquide\s+([A-Za-z0-9\-']+)/);
      const brand = brandMatch ? brandMatch[1] : '?';
      const qty = toNumber(row['Quantité (- Remboursement)']);
      result[brand] = (result[brand] || 0) + qty;
    });
    return Object.entries(result)
      .sort((a, b) => b[1] - a[1])
      .map(([brand, qty]) => ({ brand, qty }));
  }, [data]);

  // ---------- Utility ----------
  function groupBy(arr, key) {
    return arr.reduce((acc, cur) => {
      const k = cur[key];
      acc[k] = acc[k] || [];
      acc[k].push(cur);
      return acc;
    }, {});
  }

  // ---------- Render ----------
  if (!raw.length) {
    return (
      <div className="flex h-screen items-center justify-center text-xl">
        Chargement des données…
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-8">
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-4xl font-bold mb-4"
      >
        Tableau de bord Vapotank
      </motion.h1>

      {/* ---- Filters ---- */}
      <Card className="shadow-lg">
        <CardContent className="p-4 grid md:grid-cols-4 gap-4">
          <Input
            placeholder="Recherche libre (email, produit, marque…)"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="col-span-2"
          />
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={(e) =>
              setFilters({ ...filters, dateFrom: e.target.value })
            }
            className="col-span-1"
          />
          <Input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
            className="col-span-1"
          />
          <Button
            variant="secondary"
            onClick={() => setFilters({ search: '', dateFrom: '', dateTo: '' })}
          >
            Réinitialiser
          </Button>
        </CardContent>
      </Card>

      {/* ---- KPI Cards ---- */}
      {kpi && (
        <div className="grid md:grid-cols-4 gap-4">
          <StatCard
            label="CA total (filtré)"
            value={kpi.totalSales.toFixed(2) + ' €'}
          />
          <StatCard label="Nombre de commandes" value={kpi.totalOrders} />
          <StatCard label="Panier moyen" value={kpi.aov.toFixed(2) + ' €'} />
          <StatCard
            label="Taux de repeat"
            value={Math.round(kpi.repeatRate * 100) + '%'}
          />
        </div>
      )}

      {/* ---- Charts & Tables ---- */}
      <div className="grid xl:grid-cols-2 gap-8">
        <Card className="shadow-lg">
          <CardContent className="p-4">
            <h2 className="text-xl font-semibold mb-2">Top 20 Produits</h2>
            <DataTable
              columns={['Produit', 'Quantité']}
              rows={topProducts.map(([p, q]) => [p, q])}
            />
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardContent className="p-4">
            <h2 className="text-xl font-semibold mb-2">Top 20 Clients</h2>
            <DataTable
              columns={['Client (email)', 'CA (€)']}
              rows={topCustomers.map(([c, v]) => [c, v.toFixed(2)])}
            />
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardContent className="p-4">
            <h2 className="text-xl font-semibold mb-2">
              Clients inactifs (≥4 mois)
            </h2>
            <DataTable
              columns={['Client (email)', 'Dernière commande']}
              rows={dormantCustomers.map((d) => [d.email, d.last])}
            />
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardContent className="p-4 h-[340px]">
            <h2 className="text-xl font-semibold mb-2">
              Meilleurs jours de la semaine
            </h2>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekdayData.slice(0, 3)}>
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="total" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardContent className="p-4">
            <h2 className="text-xl font-semibold mb-2">
              Paires de produits fréquentes
            </h2>
            <DataTable
              columns={['Paire', 'Occurrences']}
              rows={productPairs.map((p) => [p.pair, p.count])}
            />
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardContent className="p-4 h-[340px]">
            <h2 className="text-xl font-semibold mb-2">
              Ventes e‑liquides par marque
            </h2>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={eliquidByBrand.slice(0, 10)}
                  dataKey="qty"
                  nameKey="brand"
                  outerRadius={120}
                  label
                >
                  {eliquidByBrand.slice(0, 10).map((_, index) => (
                    <Cell key={index} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------- Reusable components ----------
function StatCard({ label, value }) {
  return (
    <Card className="shadow-md">
      <CardContent className="p-4 text-center space-y-1">
        <div className="text-sm text-gray-500">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function DataTable({ columns, rows }) {
  return (
    <div className="overflow-auto max-h-72">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="sticky top-0 bg-gray-100">
            {columns.map((c) => (
              <th key={c} className="px-2 py-1 text-left font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="odd:bg-gray-50">
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-1 whitespace-nowrap">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
