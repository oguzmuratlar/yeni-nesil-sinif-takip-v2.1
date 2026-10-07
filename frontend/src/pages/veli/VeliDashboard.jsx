import React, { useState, useEffect } from 'react';
import VeliLayout from '../../components/layouts/VeliLayout';
import VeliStudentSelector from '../../components/veli/VeliStudentSelector';
import apiClient from '../../api/axios';
import { toast } from 'sonner';
import { formatMoney } from '../../lib/utils';
import { BookOpen, GraduationCap, Wallet, CalendarCheck } from 'lucide-react';

const VeliDashboard = () => {
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
    apiClient.get(`/veli/summary?student_id=${selectedStudent}`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Veriler yüklenemedi'))
      .finally(() => setLoading(false));
  }, [selectedStudent]);

  return (
    <VeliLayout>
      <div className="mb-6">
        <h1 className="text-3xl lg:text-4xl font-extrabold text-slate-800" data-testid="veli-dashboard-title">
          Ana Sayfa
        </h1>
        <p className="text-slate-600 mt-1">
          {data?.student_name ? `${data.student_name} için ders ve bakiye özeti` : 'Ders ve bakiye özeti'}
        </p>
      </div>

      <VeliStudentSelector students={students} value={selectedStudent} onChange={setSelectedStudent} />

      {loading ? (
        <div className="text-center py-12 text-slate-500">Yükleniyor...</div>
      ) : !data || data.cards.length === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center border border-slate-100 shadow-sm">
          <BookOpen size={44} className="mx-auto mb-3 text-slate-300" />
          <p className="text-slate-600">Henüz ders kaydı bulunmuyor.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="veli-branch-cards">
          {data.cards.map((c) => (
            <div key={c.branch_id} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow" data-testid={`veli-card-${c.branch_id}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-slate-800">{c.branch_name}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium">{c.lesson_type}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
                <GraduationCap size={16} />
                <span>{c.teacher_name}</span>
              </div>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-slate-500"><CalendarCheck size={15} /> Girilen Ders</span>
                  <span className="font-semibold text-slate-800">{c.total_lessons}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-slate-500"><BookOpen size={15} /> Kalan Ders</span>
                  <span className={`font-semibold ${c.remaining_lessons < 0 ? 'text-red-600' : 'text-slate-800'}`}>{c.remaining_lessons}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="flex items-center gap-2 text-sm text-slate-500"><Wallet size={15} /> Kalan Bakiye</span>
                  <span className={`font-bold ${c.remaining_balance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {formatMoney(c.remaining_balance, false)} ₺
                  </span>
                </div>
                <div className="pt-1">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${c.status === 'borclu' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    {c.status === 'borclu' ? 'Borçlu' : 'Bakiye Mevcut'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </VeliLayout>
  );
};

export default VeliDashboard;
