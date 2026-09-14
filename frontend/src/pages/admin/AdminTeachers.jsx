import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layouts/AdminLayout';
import apiClient from '../../api/axios';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Plus, Search, Wallet, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { formatMoney } from '../../lib/utils';

const AdminTeachers = () => {
  const [teachers, setTeachers] = useState([]);
  const [balances, setBalances] = useState({});
  const [showBalances, setShowBalances] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchTeachers();
    fetchBalances();
  }, [showInactive]);

  const fetchBalances = async () => {
    try {
      const response = await apiClient.get('/teacher-balances-summary');
      setBalances(response.data);
    } catch (error) {
      console.error('Bakiyeler yüklenemedi');
    }
  };

  const renderBalance = (teacherId) => {
    const bal = balances[teacherId] ?? 0;
    if (!showBalances) {
      return <span className="text-slate-400 tracking-widest">••••••</span>;
    }
    const isPositive = bal >= 0;
    return (
      <span className={isPositive ? 'text-green-600' : 'text-red-600'}>
        {formatMoney(bal)} ₺
      </span>
    );
  };

  const fetchTeachers = async () => {
    try {
      const response = await apiClient.get('/teachers');
      const filtered = showInactive 
        ? response.data 
        : response.data.filter(t => t.status === 'active');
      setTeachers(filtered);
    } catch (error) {
      toast.error('Öğretmenler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (teacherId, currentStatus) => {
    try {
      const teacher = teachers.find(t => t.id === teacherId);
      await apiClient.put(`/teachers/${teacherId}`, {
        ...teacher,
        status: currentStatus === 'active' ? 'inactive' : 'active'
      });
      toast.success('Durum güncellendi');
      fetchTeachers();
    } catch (error) {
      toast.error('Güncelleme başarısız');
    }
  };

  const filteredTeachers = teachers.filter(teacher =>
    teacher.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AdminLayout>
      <div>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 lg:mb-8">
          <div>
            <h1 className="page-title" data-testid="admin-teachers-title">
              Öğretmenler
            </h1>
            <p className="page-subtitle mt-1">Öğretmenlerinizi yönetin</p>
          </div>
          <Button
            onClick={() => navigate('/admin/teachers/new')}
            data-testid="add-teacher-btn"
            className="admin-btn w-full sm:w-auto"
          >
            <Plus size={20} className="mr-2" />
            Öğretmen Ekle
          </Button>
        </div>

        {/* Balance mask toggle */}
        <div className="flex justify-end mb-4">
          <Button
            onClick={() => setShowBalances(!showBalances)}
            variant="outline"
            data-testid="toggle-balances-btn"
            className="h-10"
          >
            {showBalances ? <EyeOff size={18} className="mr-2" /> : <Eye size={18} className="mr-2" />}
            {showBalances ? 'Bakiyeleri Gizle' : 'Bakiyeleri Göster'}
          </Button>
        </div>

        {/* Search & Filter */}
        <div className="admin-card p-4 lg:p-6 mb-4 lg:mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <Input
                type="text"
                placeholder="Öğretmen adı ile ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="teacher-search-input"
                className="pl-10 h-12"
              />
            </div>
            <Button
              onClick={() => setShowInactive(!showInactive)}
              variant={showInactive ? "default" : "outline"}
              className="h-12 whitespace-nowrap"
            >
              {showInactive ? 'Sadece Aktifler' : 'Pasifleri Göster'}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-slate-600">Yükleniyor...</p>
          </div>
        ) : filteredTeachers.length === 0 ? (
          <div className="admin-card p-8 lg:p-12 text-center">
            <p className="text-slate-600">Henüz öğretmen eklenmemiş</p>
          </div>
        ) : (
          <div className="space-y-3 lg:space-y-4">
            {filteredTeachers.map((teacher) => (
              <div
                key={teacher.id}
                data-testid={`teacher-card-${teacher.id}`}
                className="admin-card p-4 lg:p-6"
              >
                {/* Mobile Layout */}
                <div className="lg:hidden">
                  <div 
                    className="flex items-start justify-between mb-3 cursor-pointer"
                    onClick={() => navigate(`/admin/teachers/${teacher.id}`)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold text-slate-800 truncate">{teacher.name}</h3>
                        <Badge variant={teacher.status === 'active' ? 'default' : 'secondary'} className="text-xs shrink-0">
                          {teacher.status === 'active' ? 'Aktif' : 'Pasif'}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600">{teacher.phone}</p>
                      <p className="text-sm font-semibold mt-1" data-testid={`teacher-balance-value-${teacher.id}`}>
                        Bakiye: {renderBalance(teacher.id)}
                      </p>
                    </div>
                    <ChevronRight size={20} className="text-slate-400 shrink-0 mt-1" />
                  </div>
                  
                  {/* Mobile Action Buttons */}
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100">
                    <Button
                      onClick={() => navigate(`/admin/teachers/${teacher.id}/edit`)}
                      variant="outline"
                      size="sm"
                      className="h-10 text-xs"
                    >
                      Düzenle
                    </Button>
                    <Button
                      onClick={() => navigate(`/admin/teachers/${teacher.id}/balance`)}
                      variant="outline"
                      size="sm"
                      className="h-10 text-xs"
                    >
                      <Wallet size={14} className="mr-1" />
                      Bakiye
                    </Button>
                    <Button
                      onClick={() => toggleStatus(teacher.id, teacher.status)}
                      size="sm"
                      variant={teacher.status === 'active' ? 'destructive' : 'default'}
                      className="h-10 text-xs"
                    >
                      {teacher.status === 'active' ? 'Pasif' : 'Aktif'}
                    </Button>
                  </div>
                </div>

                {/* Desktop Layout */}
                <div className="hidden lg:flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold text-slate-800">{teacher.name}</h3>
                      <Badge variant={teacher.status === 'active' ? 'default' : 'secondary'}>
                        {teacher.status === 'active' ? 'Aktif' : 'Pasif'}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600">Telefon: {teacher.phone}</p>
                    <p className="text-sm font-semibold mt-1" data-testid={`teacher-balance-value-desktop-${teacher.id}`}>
                      Bakiye: {renderBalance(teacher.id)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => navigate(`/admin/teachers/${teacher.id}`)}
                      data-testid={`view-teacher-${teacher.id}`}
                      variant="outline"
                      size="sm"
                    >
                      Profil
                    </Button>
                    <Button
                      onClick={() => navigate(`/admin/teachers/${teacher.id}/edit`)}
                      variant="outline"
                      size="sm"
                    >
                      Düzenle
                    </Button>
                    <Button
                      onClick={() => navigate(`/admin/teachers/${teacher.id}/balance`)}
                      data-testid={`teacher-balance-${teacher.id}`}
                      variant="outline"
                      size="sm"
                    >
                      <Wallet size={16} className="mr-1" />
                      Bakiye
                    </Button>
                    <Button
                      onClick={() => toggleStatus(teacher.id, teacher.status)}
                      size="sm"
                      variant={teacher.status === 'active' ? 'destructive' : 'default'}
                    >
                      {teacher.status === 'active' ? 'Pasifleştir' : 'Aktifleştir'}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminTeachers;
