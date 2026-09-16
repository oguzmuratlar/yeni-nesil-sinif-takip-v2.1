import React, { useState, useEffect, useCallback, useRef } from 'react';
import AdminLayout from '../../components/layouts/AdminLayout';
import apiClient from '../../api/axios';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { TrendingUp, TrendingDown, Scale, GraduationCap, CalendarRange, BarChart3 } from 'lucide-react';
import { formatMoney } from '../../lib/utils';
import { toast } from 'sonner';

const BASE_LINES = [
  { key: 'total_income', label: 'Toplam Gelir', color: '#16a34a' },
  { key: 'total_expense', label: 'Toplam Gider', color: '#dc2626' },
  { key: 'net_balance', label: 'Net Bilanço', color: '#2563eb' },
];

const OPTIONAL_LINES = [
  { key: 'teacher_payment', label: 'Öğretmen Ödemesi', color: '#8b5cf6' },
  { key: 'reklam', label: 'Reklam', color: '#f97316' },
  { key: 'ofis', label: 'Ofis', color: '#14b8a6' },
  { key: 'vergi', label: 'Vergi', color: '#eab308' },
  { key: 'sermaye', label: 'Sermaye Çıkışı', color: '#64748b' },
  { key: 'diger', label: 'Diğer Giderler', color: '#ec4899' },
];

const CATEGORY_OPTIONS = ['Maaş', 'Kira', 'Reklam', 'Ofis', 'Vergi', 'Sermaye', 'Diğer'];

const FinChart = ({ title, data, activeOptional }) => {
  const hasAny = data && data.some(d => d.total_income || d.total_expense || d.net_balance ||
    d.teacher_payment || d.reklam || d.ofis || d.vergi || d.sermaye || d.diger);
  return (
    <div className="admin-card p-4" data-testid={`fin-chart-${title}`}>
      <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
        <BarChart3 size={18} className="text-purple-500" />
        {title}
      </h3>
      {!hasAny ? (
        <div className="h-[280px] flex items-center justify-center text-slate-400 text-sm">
          Bu grafik için veri yok
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={55} tickFormatter={(v) => formatMoney(v, false)} />
            <Tooltip formatter={(v) => `${formatMoney(v)} ₺`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {BASE_LINES.map(l => (
              <Line key={l.key} type="monotone" dataKey={l.key} name={l.label} stroke={l.color} strokeWidth={2} dot={false} />
            ))}
            {OPTIONAL_LINES.filter(l => activeOptional.includes(l.key)).map(l => (
              <Line key={l.key} type="monotone" dataKey={l.key} name={l.label} stroke={l.color} strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

const MonthlyTable = ({ title, rows }) => {
  const totals = rows.reduce((acc, r) => {
    acc.total_income += r.total_income;
    acc.total_expense += r.total_expense;
    acc.teacher_payment += r.teacher_payment;
    acc.reklam += r.reklam;
    acc.ofis += r.ofis;
    acc.vergi += r.vergi;
    acc.diger += r.diger;
    return acc;
  }, { total_income: 0, total_expense: 0, teacher_payment: 0, reklam: 0, ofis: 0, vergi: 0, diger: 0 });
  totals.net_balance = totals.total_income - totals.total_expense;

  return (
  <div className="mb-6" data-testid={`fin-table-block-${title}`}>
    <h3 className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
      <BarChart3 size={16} className="text-purple-500" />
      {title} - Aylık Özet
    </h3>
    <div className="admin-card overflow-x-auto">
      <table className="w-full text-sm" data-testid={`fin-monthly-table-${title}`}>
        <thead className="bg-slate-50">
          <tr>
            <th className="text-left py-3 px-3 font-semibold text-slate-700">Ay</th>
            <th className="text-right py-3 px-3 font-semibold text-green-700">Toplam Gelir</th>
            <th className="text-right py-3 px-3 font-semibold text-red-700">Toplam Gider</th>
            <th className="text-right py-3 px-3 font-semibold text-blue-700">Net Bilanço</th>
            <th className="text-right py-3 px-3 font-semibold text-slate-700">Öğretmen Ödemesi</th>
            <th className="text-right py-3 px-3 font-semibold text-slate-700">Reklam</th>
            <th className="text-right py-3 px-3 font-semibold text-slate-700">Ofis</th>
            <th className="text-right py-3 px-3 font-semibold text-slate-700">Vergi</th>
            <th className="text-right py-3 px-3 font-semibold text-slate-700">Diğer Giderler</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.month} className="border-t hover:bg-slate-50" data-testid={`fin-row-${title}-${row.month}`}>
              <td className="py-2.5 px-3 font-medium text-slate-800">{row.label}</td>
              <td className="py-2.5 px-3 text-right text-green-600">{formatMoney(row.total_income)}</td>
              <td className="py-2.5 px-3 text-right text-red-600">{formatMoney(row.total_expense)}</td>
              <td className={`py-2.5 px-3 text-right font-semibold ${row.net_balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{formatMoney(row.net_balance)}</td>
              <td className="py-2.5 px-3 text-right text-slate-600">{formatMoney(row.teacher_payment)}</td>
              <td className="py-2.5 px-3 text-right text-slate-600">{formatMoney(row.reklam)}</td>
              <td className="py-2.5 px-3 text-right text-slate-600">{formatMoney(row.ofis)}</td>
              <td className="py-2.5 px-3 text-right text-slate-600">{formatMoney(row.vergi)}</td>
              <td className="py-2.5 px-3 text-right text-slate-600">{formatMoney(row.diger)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold" data-testid={`fin-total-row-${title}`}>
            <td className="py-3 px-3 text-slate-800">TOPLAM</td>
            <td className="py-3 px-3 text-right text-green-700">{formatMoney(totals.total_income)}</td>
            <td className="py-3 px-3 text-right text-red-700">{formatMoney(totals.total_expense)}</td>
            <td className={`py-3 px-3 text-right ${totals.net_balance >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{formatMoney(totals.net_balance)}</td>
            <td className="py-3 px-3 text-right text-slate-800">{formatMoney(totals.teacher_payment)}</td>
            <td className="py-3 px-3 text-right text-slate-800">{formatMoney(totals.reklam)}</td>
            <td className="py-3 px-3 text-right text-slate-800">{formatMoney(totals.ofis)}</td>
            <td className="py-3 px-3 text-right text-slate-800">{formatMoney(totals.vergi)}</td>
            <td className="py-3 px-3 text-right text-slate-800">{formatMoney(totals.diger)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
  );
};

const AdminFinancialReport = () => {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [activeOptional, setActiveOptional] = useState([]);
  const initedRef = useRef(false);

  // Reference data for filters
  const [cashboxes, setCashboxes] = useState([]);
  const [branches, setBranches] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);

  const [filters, setFilters] = useState({
    month: '',
    start_date: '',
    end_date: '',
    cashbox_id: 'all',
    branch_id: 'all',
    category: 'all',
    teacher_id: 'all',
    bank_account_id: 'all',
  });

  useEffect(() => {
    const loadRef = async () => {
      try {
        const [cb, br, tc, ba] = await Promise.all([
          apiClient.get('/cashboxes'),
          apiClient.get('/branches'),
          apiClient.get('/teachers'),
          apiClient.get('/bank-accounts'),
        ]);
        setCashboxes(Array.isArray(cb.data) ? cb.data : (cb.data?.cashboxes || []));
        setBranches(Array.isArray(br.data) ? br.data : (br.data?.branches || []));
        setTeachers(Array.isArray(tc.data) ? tc.data : (tc.data?.teachers || []));
        setBankAccounts(Array.isArray(ba.data) ? ba.data : (ba.data?.bank_accounts || []));
      } catch (e) {
        console.error('Referans veriler yüklenemedi');
      }
    };
    loadRef();
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.month) {
        params.month = filters.month;
      } else {
        if (filters.start_date) params.start_date = filters.start_date;
        if (filters.end_date) params.end_date = filters.end_date;
      }
      ['cashbox_id', 'branch_id', 'category', 'teacher_id', 'bank_account_id'].forEach(k => {
        if (filters[k] && filters[k] !== 'all') params[k] = filters[k];
      });
      const res = await apiClient.get('/admin/financial-report', { params });
      setReport(res.data);
      // İlk yüklemede tarih filtrelerini aktif dönem aralığıyla doldur
      if (!initedRef.current) {
        initedRef.current = true;
        if (!filters.month && !filters.start_date && !filters.end_date && res.data.applied_start) {
          setFilters(prev => ({ ...prev, start_date: res.data.applied_start, end_date: res.data.applied_end }));
        }
      }
    } catch (e) {
      toast.error('Finansal rapor yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const toggleOptional = (key) => {
    setActiveOptional(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const clearFilters = () => {
    initedRef.current = false;
    setFilters({
      month: '', start_date: '', end_date: '',
      cashbox_id: 'all', branch_id: 'all', category: 'all', teacher_id: 'all', bank_account_id: 'all',
    });
  };

  const setF = (k, v) => setFilters(prev => ({ ...prev, [k]: v }));

  const s = report?.summary_cards;
  const branchNames = report ? Object.keys(report.branch_charts || {}) : [];

  const summaryCards = [
    { label: 'Toplam Gelir', value: s?.total_income, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-100', testId: 'card-total-income' },
    { label: 'Toplam Gider', value: s?.total_expense, icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-100', testId: 'card-total-expense' },
    { label: 'Net Bilanço', value: s?.net_balance, icon: Scale, color: (s?.net_balance ?? 0) >= 0 ? 'text-blue-600' : 'text-red-600', bg: 'bg-blue-100', testId: 'card-net-balance' },
    { label: 'Öğretmen Ödemeleri', value: s?.teacher_payments, icon: GraduationCap, color: 'text-purple-600', bg: 'bg-purple-100', testId: 'card-teacher-payments' },
  ];

  return (
    <AdminLayout>
      <div>
        <div className="mb-6">
          <h1 className="page-title" data-testid="financial-report-title">Finansal Rapor</h1>
          <p className="page-subtitle mt-1">Aylık gelir, gider ve net bilanço takibi (tahsilat bazlı)</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {summaryCards.map(card => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="admin-card p-4" data-testid={card.testId}>
                <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center mb-2`}>
                  <Icon size={20} className={card.color} />
                </div>
                <p className="text-xs text-slate-500">{card.label}</p>
                <p className={`text-xl font-bold ${card.color}`}>
                  {loading || !s ? '...' : `${formatMoney(card.value || 0)} ₺`}
                </p>
              </div>
            );
          })}
          <div className="admin-card p-4 bg-gradient-to-br from-indigo-50 to-purple-50" data-testid="card-period">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center mb-2">
              <CalendarRange size={20} className="text-indigo-600" />
            </div>
            <p className="text-xs text-slate-500">Seçili Dönem</p>
            <p className="text-sm font-bold text-indigo-700">{s?.period_label || '...'}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="admin-card p-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Ay</Label>
              <Input type="month" value={filters.month} onChange={(e) => setF('month', e.target.value)} data-testid="fin-filter-month" className="h-10" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Başlangıç (aralık)</Label>
              <Input type="date" value={filters.start_date} disabled={!!filters.month} onChange={(e) => setF('start_date', e.target.value)} data-testid="fin-filter-start" className="h-10" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Bitiş (aralık)</Label>
              <Input type="date" value={filters.end_date} disabled={!!filters.month} onChange={(e) => setF('end_date', e.target.value)} data-testid="fin-filter-end" className="h-10" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Kasa</Label>
              <Select value={filters.cashbox_id} onValueChange={(v) => setF('cashbox_id', v)}>
                <SelectTrigger className="h-10" data-testid="fin-filter-cashbox"><SelectValue placeholder="Tümü" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Kasalar</SelectItem>
                  {cashboxes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Branş</Label>
              <Select value={filters.branch_id} onValueChange={(v) => setF('branch_id', v)}>
                <SelectTrigger className="h-10" data-testid="fin-filter-branch"><SelectValue placeholder="Tümü" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Branşlar</SelectItem>
                  {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Kategori</Label>
              <Select value={filters.category} onValueChange={(v) => setF('category', v)}>
                <SelectTrigger className="h-10" data-testid="fin-filter-category"><SelectValue placeholder="Tümü" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Kategoriler</SelectItem>
                  {CATEGORY_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Öğretmen</Label>
              <Select value={filters.teacher_id} onValueChange={(v) => setF('teacher_id', v)}>
                <SelectTrigger className="h-10" data-testid="fin-filter-teacher"><SelectValue placeholder="Tümü" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Öğretmenler</SelectItem>
                  {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Banka / Hesap</Label>
              <Select value={filters.bank_account_id} onValueChange={(v) => setF('bank_account_id', v)}>
                <SelectTrigger className="h-10" data-testid="fin-filter-bank"><SelectValue placeholder="Tümü" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Hesaplar</SelectItem>
                  {bankAccounts.map(b => <SelectItem key={b.id} value={b.id}>{b.bank_name} - {b.holder_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <Button variant="outline" onClick={clearFilters} data-testid="fin-filter-clear" className="h-9">Filtreleri Temizle</Button>
          </div>
        </div>

        {/* Optional line toggles */}
        <div className="admin-card p-3 mb-6">
          <p className="text-xs text-slate-500 mb-2">Gider kalemleri (grafiklerde göster/gizle):</p>
          <div className="flex flex-wrap gap-2">
            {OPTIONAL_LINES.map(l => (
              <button
                key={l.key}
                onClick={() => toggleOptional(l.key)}
                data-testid={`fin-toggle-${l.key}`}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  activeOptional.includes(l.key) ? 'text-white border-transparent' : 'text-slate-600 bg-white border-slate-200'
                }`}
                style={activeOptional.includes(l.key) ? { backgroundColor: l.color } : {}}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="admin-card p-12 text-center text-slate-500">Yükleniyor...</div>
        ) : !report?.has_data ? (
          <div className="admin-card p-12 text-center" data-testid="fin-empty">
            <BarChart3 size={40} className="mx-auto mb-3 text-slate-300" />
            <p className="text-slate-600">Seçili filtrelere uygun finansal veri bulunamadı.</p>
          </div>
        ) : (
          <>
            {/* Charts */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
              <FinChart title="Genel" data={report.general_chart} activeOptional={activeOptional} />
              {branchNames.map(name => (
                <FinChart key={name} title={name} data={report.branch_charts[name]} activeOptional={activeOptional} />
              ))}
            </div>

            {/* Monthly tables - her branş (kasa) için ayrı */}
            <div>
              {branchNames.map(name => (
                <MonthlyTable key={name} title={name} rows={report.branch_charts[name]} />
              ))}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminFinancialReport;
