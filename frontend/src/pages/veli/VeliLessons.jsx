import React, { useState, useEffect, useMemo } from 'react';
import VeliLayout from '../../components/layouts/VeliLayout';
import VeliStudentSelector from '../../components/veli/VeliStudentSelector';
import apiClient from '../../api/axios';
import { toast } from 'sonner';
import { formatMoney } from '../../lib/utils';
import { Button } from '../../components/ui/button';
import { BookOpen } from 'lucide-react';

const VeliLessons = () => {
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState('all');

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
    setBranchFilter('all');
    apiClient.get(`/veli/lessons?student_id=${selectedStudent}`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Veriler yüklenemedi'))
      .finally(() => setLoading(false));
  }, [selectedStudent]);

  const branchNames = useMemo(() => {
    if (!data?.rows) return [];
    return [...new Set(data.rows.map(r => r.branch_name))];
  }, [data]);

  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    if (branchFilter === 'all') return data.rows;
    return data.rows.filter(r => r.branch_name === branchFilter);
  }, [data, branchFilter]);

  return (
    <VeliLayout>
      <div className="mb-6">
        <h1 className="text-3xl lg:text-4xl font-extrabold text-slate-800" data-testid="veli-lessons-title">
          Dersler
        </h1>
        <p className="text-slate-600 mt-1">Branş bazlı ders ve bakiye detayları</p>
      </div>

      <VeliStudentSelector students={students} value={selectedStudent} onChange={setSelectedStudent} />

      {/* Branş filtresi */}
      {branchNames.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4" data-testid="veli-branch-filter">
          <Button
            variant={branchFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            className={branchFilter === 'all' ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
            onClick={() => setBranchFilter('all')}
            data-testid="veli-filter-all"
          >
            Tümü
          </Button>
          {branchNames.map((b) => (
            <Button
              key={b}
              variant={branchFilter === b ? 'default' : 'outline'}
              size="sm"
              className={branchFilter === b ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
              onClick={() => setBranchFilter(b)}
              data-testid={`veli-filter-${b}`}
            >
              {b}
            </Button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-500">Yükleniyor...</div>
      ) : filteredRows.length === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center border border-slate-100 shadow-sm">
          <BookOpen size={44} className="mx-auto mb-3 text-slate-300" />
          <p className="text-slate-600">Ders kaydı bulunmuyor.</p>
        </div>
      ) : (
        <>
          {/* Masaüstü tablo */}
          <div className="hidden lg:block bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Branş</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Öğretmen</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Ders Tipi</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-700">Birim Ücret</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-700">Girilen Ders</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-700">Toplam Ödenen</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-700">Kalan Ders</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-700">Kalan Bakiye</th>
                    <th className="text-center py-3 px-4 font-semibold text-slate-700">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map((r) => (
                    <tr key={r.branch_id} className="hover:bg-slate-50" data-testid={`veli-lesson-row-${r.branch_id}`}>
                      <td className="py-3 px-4 font-medium text-slate-800">{r.branch_name}</td>
                      <td className="py-3 px-4 text-slate-600">{r.teacher_name}</td>
                      <td className="py-3 px-4"><span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{r.lesson_type}</span></td>
                      <td className="py-3 px-4 text-right text-slate-700">{formatMoney(r.student_price, false)} ₺</td>
                      <td className="py-3 px-4 text-right text-slate-700">{r.total_lessons}</td>
                      <td className="py-3 px-4 text-right text-slate-700">{formatMoney(r.total_paid, false)} ₺</td>
                      <td className={`py-3 px-4 text-right font-medium ${r.remaining_lessons < 0 ? 'text-red-600' : 'text-slate-800'}`}>{r.remaining_lessons}</td>
                      <td className={`py-3 px-4 text-right font-bold ${r.remaining_balance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatMoney(r.remaining_balance, false)} ₺</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${r.status === 'borclu' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                          {r.status === 'borclu' ? 'Borçlu' : 'Bakiye Mevcut'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobil kartlar */}
          <div className="lg:hidden space-y-3">
            {filteredRows.map((r) => (
              <div key={r.branch_id} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm" data-testid={`veli-lesson-card-${r.branch_id}`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-slate-800">{r.branch_name}</h3>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${r.status === 'borclu' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    {r.status === 'borclu' ? 'Borçlu' : 'Bakiye Mevcut'}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mb-3">{r.teacher_name} • {r.lesson_type}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">Birim</span><span className="font-medium">{formatMoney(r.student_price, false)}₺</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Girilen</span><span className="font-medium">{r.total_lessons}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Ödenen</span><span className="font-medium">{formatMoney(r.total_paid, false)}₺</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Kalan Ders</span><span className={`font-medium ${r.remaining_lessons < 0 ? 'text-red-600' : ''}`}>{r.remaining_lessons}</span></div>
                  <div className="col-span-2 flex justify-between pt-2 border-t border-slate-100"><span className="text-slate-500">Kalan Bakiye</span><span className={`font-bold ${r.remaining_balance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatMoney(r.remaining_balance, false)}₺</span></div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </VeliLayout>
  );
};

export default VeliLessons;
