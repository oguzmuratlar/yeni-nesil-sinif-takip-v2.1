import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layouts/AdminLayout';
import TeacherLayout from '../../components/layouts/TeacherLayout';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../api/axios';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { ArrowLeft, Users, BookOpen, Calendar, Trash2, Edit } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { formatDateTurkish, generateMonthOptions } from '../../lib/dateUtils';
import { toast } from 'sonner';

const TeacherLessonIncomeDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.user_type === 'admin';
  const teacherId = isAdmin ? id : user?.teacher_id;
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState('');
  
  const Layout = isAdmin ? AdminLayout : TeacherLayout;

  useEffect(() => {
    fetchData();
  }, [teacherId, selectedMonth]);

  const fetchData = async () => {
    if (!teacherId) return;
    try {
      let url = `/teachers/${teacherId}/lesson-income-detail`;
      if (selectedMonth && selectedMonth !== 'all') {
        url += `?month=${selectedMonth}`;
      }
      const response = await apiClient.get(url);
      setData(response.data);
    } catch (error) {
      console.error('Error fetching lesson income detail:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('tr-TR', { 
      style: 'currency', 
      currency: 'TRY',
      minimumFractionDigits: 2 
    }).format(amount || 0);
  };

  // Dinamik ay listesi: 6 ay önce, 3 ay sonra
  const dynamicMonths = generateMonthOptions(6, 3);
  const months = [
    { value: 'all', label: 'Tüm Zamanlar' },
    ...dynamicMonths
  ];

  // Admin: Ders silme işlevi
  const handleDeleteLesson = async (lessonId) => {
    if (!isAdmin) return;
    if (!window.confirm('Bu ders kaydını silmek istediğinizden emin misiniz?')) return;
    try {
      await apiClient.delete(`/lessons/${lessonId}`);
      toast.success('Ders kaydı silindi');
      fetchData();
    } catch (error) {
      toast.error('Ders kaydı silinemedi');
    }
  };

  return (
    <Layout>
      <div>
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="page-title" data-testid="lesson-income-detail-title">
              Ders Kazanç Detayı
            </h1>
            <p className="page-subtitle mt-1">Grup ve birebir ders kazançlarınız</p>
          </div>
        </div>

        {/* Summary Cards */}
        {data && (
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="admin-card p-4">
              <p className="text-sm text-slate-500">Toplam Kazanç</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(data.total_earning)}</p>
            </div>
            <div className="admin-card p-4">
              <p className="text-sm text-slate-500">Toplam Ders</p>
              <p className="text-2xl font-bold text-blue-600">{data.total_lessons} ders</p>
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="admin-card p-4 mb-6">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-700">Ay Filtresi:</span>
            <Select value={selectedMonth || 'all'} onValueChange={(v) => setSelectedMonth(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Tüm zamanlar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Zamanlar</SelectItem>
                {months.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Detail List */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-slate-600">Yükleniyor...</p>
          </div>
        ) : data?.details?.length === 0 ? (
          <div className="admin-card p-12 text-center">
            <BookOpen size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-600">Bu dönemde ders kaydı bulunamadı</p>
          </div>
        ) : (
          <div className="space-y-4">
            {data?.details?.map((item, index) => (
              <div key={index} className="admin-card p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-slate-800">{item.source_name}</h3>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="secondary">{item.branch_name}</Badge>
                      <Badge variant={item.source_type === 'Grup Dersi' ? 'default' : 'outline'}>
                        {item.source_type}
                      </Badge>
                      {item.group_size > 1 && (
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Users size={12} />
                          {item.group_size} kişi
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-green-600">{formatCurrency(item.total_earning)}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-4 text-sm text-slate-600 pt-3 border-t">
                  <div>
                    <p className="text-slate-400">Ders Sayısı</p>
                    <p className="font-semibold text-slate-800">{item.total_lessons} ders</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Birim Ücret</p>
                    <p className="font-semibold text-slate-800">{formatCurrency(item.unit_price)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Hesaplama</p>
                    <p className="font-semibold text-slate-800">{item.total_lessons} × {formatCurrency(item.unit_price)}</p>
                  </div>
                </div>
                
                {item.dates?.length > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                      <Calendar size={12} />
                      Ders Tarihleri
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {item.dates.slice(0, 10).map((date, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{formatDateTurkish(date)}</Badge>
                      ))}
                      {item.dates.length > 10 && (
                        <Badge variant="outline" className="text-xs">+{item.dates.length - 10} daha</Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default TeacherLessonIncomeDetail;
