import React, { useState, useEffect } from 'react';
import VeliLayout from '../../components/layouts/VeliLayout';
import VeliStudentSelector from '../../components/veli/VeliStudentSelector';
import apiClient from '../../api/axios';
import { toast } from 'sonner';
import { formatMoney } from '../../lib/utils';
import { formatDateTurkish } from '../../lib/dateUtils';
import { CreditCard } from 'lucide-react';

const VeliPayments = () => {
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get('/veli/students').then(r => {
      setStudents(r.data);
      if (r.data.length > 0) setSelectedStudent(r.data[0].id);
      else setLoading(false);
    }).catch(() => { setLoading(false); toast.error('Öğrenci bilgisi yüklenemedi'); });
  }, []);

  useEffect(() => {
    if (!selectedStudent) return;
    setLoading(true);
    apiClient.get(`/veli/payments?student_id=${selectedStudent}`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Veriler yüklenemedi'))
      .finally(() => setLoading(false));
  }, [selectedStudent]);

  const total = (data?.payments || []).reduce((s, p) => s + (p.amount || 0), 0);

  return (
    <VeliLayout>
      <div className="mb-6">
        <h1 className="text-3xl lg:text-4xl font-extrabold text-slate-800" data-testid="veli-payments-title">
          Ödemeler
        </h1>
        <p className="text-slate-600 mt-1">Yapılan ödemelerin listesi</p>
      </div>

      <VeliStudentSelector students={students} value={selectedStudent} onChange={setSelectedStudent} />

      {loading ? (
        <div className="text-center py-12 text-slate-500">Yükleniyor...</div>
      ) : !data || data.payments.length === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center border border-slate-100 shadow-sm">
          <CreditCard size={44} className="mx-auto mb-3 text-slate-300" />
          <p className="text-slate-600">Henüz ödeme kaydı bulunmuyor.</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm mb-4 flex items-center justify-between">
            <span className="text-sm text-slate-500">Toplam Ödeme</span>
            <span className="text-xl font-bold text-emerald-600" data-testid="veli-payments-total">{formatMoney(total, false)} ₺</span>
          </div>

          {/* Masaüstü tablo */}
          <div className="hidden sm:block bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Tarih</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Branş</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Hesap Adı</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Tutar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.payments.map((p, i) => (
                  <tr key={i} className="hover:bg-slate-50" data-testid={`veli-payment-row-${i}`}>
                    <td className="py-3 px-4 text-slate-700">{formatDateTurkish(p.date)}</td>
                    <td className="py-3 px-4 text-slate-600">{p.branch_name}</td>
                    <td className="py-3 px-4 text-slate-600">{p.account_name}</td>
                    <td className="py-3 px-4 text-right font-semibold text-emerald-600">{formatMoney(p.amount, false)} ₺</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobil kartlar */}
          <div className="sm:hidden space-y-3">
            {data.payments.map((p, i) => (
              <div key={i} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm" data-testid={`veli-payment-card-${i}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">{formatDateTurkish(p.date)}</span>
                  <span className="font-bold text-emerald-600">{formatMoney(p.amount, false)} ₺</span>
                </div>
                <p className="text-sm text-slate-500 mt-1">{p.branch_name} • {p.account_name}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </VeliLayout>
  );
};

export default VeliPayments;
