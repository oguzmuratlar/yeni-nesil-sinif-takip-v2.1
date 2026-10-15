import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layouts/AdminLayout';
import TeacherLayout from '../../components/layouts/TeacherLayout';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../api/axios';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { ArrowLeft, Megaphone, Calendar, Film, BookImage } from 'lucide-react';
import { generateMonthOptions } from '../../lib/dateUtils';

const TeacherSponsorDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.user_type === 'admin';
  const teacherId = isAdmin ? id : user?.teacher_id;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const Layout = isAdmin ? AdminLayout : TeacherLayout;

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId, selectedMonth]);

  const formatCurrency = (amount) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2 }).format(amount || 0);

  const months = [{ value: 'all', label: 'Tüm Zamanlar' }, ...generateMonthOptions(6, 3)];

  const fetchData = async () => {
    setLoading(true);
    try {
      let url;
      if (isAdmin) {
        url = `/teachers/${teacherId}/sponsored-contents`;
      } else {
        url = `/teacher/sponsored-contents`;
      }
      if (selectedMonth && selectedMonth !== 'all') {
        url += `${url.includes('?') ? '&' : '?'}month=${selectedMonth}`;
      }
      const response = await apiClient.get(url);
      setData(response.data);
    } catch (error) {
      console.error('Error fetching sponsor detail:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div>
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="page-title" data-testid="sponsor-detail-title">Sponsorlu Paylaşım Kazancı</h1>
            <p className="page-subtitle mt-1">Sponsorlu içerik kazançlarınız</p>
          </div>
        </div>

        {/* Toplam kazanç */}
        <div className="admin-card p-6 mb-6 text-center bg-gradient-to-br from-fuchsia-50 to-indigo-50">
          <p className="text-sm text-slate-500 mb-1">Toplam Sponsorlu Paylaşım Kazancı</p>
          <p className="text-4xl font-extrabold text-fuchsia-600" data-testid="sponsor-total-earning">
            {formatCurrency(data?.total_earning)}
          </p>
          <p className="text-sm text-slate-500 mt-1">{data?.record_count || 0} paylaşım</p>
        </div>

        {/* Filtre */}
        <div className="admin-card p-4 mb-6">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-700">Ay Filtresi:</span>
            <Select value={selectedMonth || 'all'} onValueChange={(v) => setSelectedMonth(v)}>
              <SelectTrigger className="w-48" data-testid="sponsor-month-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Liste */}
        {loading ? (
          <div className="text-center py-12"><p className="text-slate-600">Yükleniyor...</p></div>
        ) : !data?.details || data.details.length === 0 ? (
          <div className="admin-card p-12 text-center">
            <Megaphone size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-600">Bu dönemde sponsorlu paylaşım bulunamadı</p>
          </div>
        ) : (
          <>
            {/* Masaüstü tablo */}
            <div className="hidden sm:block admin-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Tarih</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Yayınevi Adı</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Paylaşım Adı</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Paylaşım Türü</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-700">Öğretmen Kazancı</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.details.map((item, i) => (
                    <tr key={i} className="hover:bg-slate-50" data-testid={`sponsor-row-${i}`}>
                      <td className="py-3 px-4 text-slate-700">{item.date}</td>
                      <td className="py-3 px-4 text-slate-600">{item.publisher_name}</td>
                      <td className="py-3 px-4 font-medium text-slate-800">{item.share_name}</td>
                      <td className="py-3 px-4">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-700">
                          {item.share_type === 'reels' ? 'Reels' : 'Hikaye'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-green-600">{formatCurrency(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobil kartlar */}
            <div className="sm:hidden space-y-3">
              {data.details.map((item, i) => (
                <div key={i} className="admin-card p-4" data-testid={`sponsor-card-${i}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-fuchsia-100 rounded-lg">
                        {item.share_type === 'reels' ? <Film size={18} className="text-fuchsia-600" /> : <BookImage size={18} className="text-fuchsia-600" />}
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-800">{item.share_name}</h3>
                        <p className="text-xs text-slate-500">{item.publisher_name}</p>
                      </div>
                    </div>
                    <p className="font-bold text-green-600">{formatCurrency(item.amount)}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                    <Calendar size={12} /> {item.date} · {item.share_type === 'reels' ? 'Reels' : 'Hikaye'}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default TeacherSponsorDetail;
