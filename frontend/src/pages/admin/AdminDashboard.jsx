import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layouts/AdminLayout';
import { Users, GraduationCap, CreditCard, TrendingUp, ArrowRight, Calendar, Landmark, BookOpen, Lock, Eye, EyeOff } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import AuditLogPopup from '../../components/admin/AuditLogPopup';
import apiClient from '../../api/axios';
import { toast } from 'sonner';
import { formatMoney } from '../../lib/utils';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [yearEndDialogOpen, setYearEndDialogOpen] = useState(false);
  const [yearEndLoading, setYearEndLoading] = useState(false);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [showBankBalances, setShowBankBalances] = useState(false);
  const [auditLogPopupOpen, setAuditLogPopupOpen] = useState(false);
  const [seasonStats, setSeasonStats] = useState(null);
  const [currentSeason, setCurrentSeason] = useState(null);

  const fetchSeasonData = useCallback(async () => {
    try {
      // Aktif dönem bilgisi
      const seasonResponse = await apiClient.get('/seasons/current');
      setCurrentSeason(seasonResponse.data);
      
      // Dönem istatistikleri
      const statsResponse = await apiClient.get('/dashboard/season-stats');
      setSeasonStats(statsResponse.data);
    } catch (error) {
      console.error('Dönem bilgileri yüklenemedi');
    }
  }, []);

  useEffect(() => {
    fetchBankAccounts();
    checkForAuditLogs();
    fetchSeasonData();
  }, [fetchSeasonData]);

  const checkForAuditLogs = async () => {
    try {
      const response = await apiClient.get('/admin/audit-logs/recent');
      if (response.data.has_new_changes) {
        setAuditLogPopupOpen(true);
      }
    } catch (error) {
      console.error('Audit logs kontrol edilemedi');
    }
  };

  const fetchBankAccounts = async () => {
    try {
      const response = await apiClient.get('/bank-accounts');
      setBankAccounts(response.data);
    } catch (error) {
      console.error('Banka hesapları yüklenemedi');
    }
  };

  const cards = [
    {
      title: 'Öğrenciler',
      description: 'Öğrenci yönetimi ve ders takibi',
      icon: Users,
      color: 'bg-blue-500',
      path: '/admin/students',
      testId: 'admin-dashboard-students-card'
    },
    {
      title: 'Öğretmenler',
      description: 'Öğretmen profilleri ve ödemeler',
      icon: GraduationCap,
      color: 'bg-orange-500',
      path: '/admin/teachers',
      testId: 'admin-dashboard-teachers-card'
    },
    {
      title: 'Ödemeler',
      description: 'Gelen ve giden ödeme takibi',
      icon: CreditCard,
      color: 'bg-green-500',
      path: '/admin/payments',
      testId: 'admin-dashboard-payments-card'
    },
    {
      title: 'Aylık Program',
      description: 'Ders ve ödeme planları',
      icon: TrendingUp,
      color: 'bg-purple-500',
      path: '/admin/monthly-program',
      testId: 'admin-dashboard-monthly-card'
    },
  ];

  const handleYearEnd = async () => {
    setYearEndLoading(true);
    try {
      const response = await apiClient.post('/year-end');
      toast.success(
        `Sene sonu işlemi tamamlandı! ${response.data.upgraded_count} öğrenci sınıf atladı, ${response.data.deactivated_count} öğrenci (8. sınıf) pasife alındı.`
      );
      setYearEndDialogOpen(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Sene sonu işlemi başarısız');
    } finally {
      setYearEndLoading(false);
    }
  };

  return (
    <AdminLayout>
      <div>
        <div className="mb-8">
          <h1 className="text-4xl font-extrabold text-slate-800 mb-2" data-testid="admin-dashboard-title">
            Yönetim Paneli
          </h1>
          <p className="text-slate-600">
            Eğitim merkezinizi yönetin
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.path}
                onClick={() => navigate(card.path)}
                data-testid={card.testId}
                className="admin-card p-6 cursor-pointer group hover:scale-105 transition-all duration-200"
              >
                <div className={`${card.color} w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <Icon size={24} className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">{card.title}</h3>
                <p className="text-slate-600 text-sm mb-4">{card.description}</p>
                <div className="flex items-center gap-2 text-blue-600 font-semibold text-sm group-hover:gap-3 transition-all">
                  <span>Görüntüle</span>
                  <ArrowRight size={16} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Dönem Bilgisi Kartı - FAZ 5 */}
          <div className="admin-card p-6 bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BookOpen size={24} className="text-indigo-600" />
                <h3 className="text-lg font-bold text-slate-800">Aktif Dönem</h3>
              </div>
              {currentSeason ? (
                <Badge className={currentSeason.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                  {currentSeason.status === 'active' ? 'Açık' : 'Kapalı'}
                </Badge>
              ) : (
                <Badge variant="outline">Dönem Yok</Badge>
              )}
            </div>
            
            {currentSeason ? (
              <div className="space-y-3">
                <p className="text-2xl font-bold text-indigo-700">{currentSeason.name}</p>
                {seasonStats && (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-white/50 p-2 rounded">
                      <p className="text-gray-500">Toplam Ders</p>
                      <p className="font-bold text-indigo-600">{seasonStats.lessons?.total || 0}</p>
                    </div>
                    <div className="bg-white/50 p-2 rounded">
                      <p className="text-gray-500">Aktif Gruplar</p>
                      <p className="font-bold text-indigo-600">{seasonStats.groups?.active || 0}</p>
                    </div>
                  </div>
                )}
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full mt-2 border-indigo-300 text-indigo-700"
                  onClick={() => navigate('/admin/year-end-preview')}
                >
                  <Calendar size={16} className="mr-2" />
                  Sene Sonu İşlemi
                </Button>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-gray-500 mb-3">Henüz dönem oluşturulmamış</p>
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/admin/settings')}
                >
                  Dönem Oluştur
                </Button>
              </div>
            )}
          </div>

          <div className="admin-card p-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Landmark size={24} className="text-blue-600" />
                <h3 className="text-2xl font-bold text-slate-800">Banka Hesapları</h3>
              </div>
              <Button
                onClick={() => setShowBankBalances(!showBankBalances)}
                variant="outline"
                size="sm"
                data-testid="toggle-bank-balances-btn"
              >
                {showBankBalances ? <EyeOff size={16} className="mr-1" /> : <Eye size={16} className="mr-1" />}
                {showBankBalances ? 'Gizle' : 'Göster'}
              </Button>
            </div>
            {bankAccounts.length === 0 ? (
              <p className="text-slate-500 text-center py-4">Henüz banka hesabı eklenmemiş</p>
            ) : (
              <div className="space-y-3">
                {bankAccounts.map((account) => (
                  <div 
                    key={account.id} 
                    className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-lg"
                  >
                    <div>
                      <p className="font-semibold text-slate-800">{account.bank_name}</p>
                      <p className="text-sm text-slate-500">{account.holder_name}</p>
                    </div>
                    <p className="font-bold text-blue-600 text-lg" data-testid={`bank-balance-${account.id}`}>
                      {showBankBalances ? `${formatMoney(account.balance || 0)} ₺` : <span className="tracking-widest text-slate-400">••••••</span>}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="admin-card p-8 bg-gradient-to-br from-blue-50 to-indigo-50">
            <h3 className="text-2xl font-bold text-slate-800 mb-2">Hoş Geldiniz!</h3>
            <p className="text-slate-600 mb-4">
              Eğitim yönetim sisteminize hoş geldiniz. Sol menüden istediğiniz bölüme hızlıca erişebilirsiniz.
            </p>
            
            {/* Dönem İstatistikleri */}
            {seasonStats && (
              <div className="mt-4 pt-4 border-t border-blue-200">
                <p className="text-sm font-medium text-slate-700 mb-2">Dönem İstatistikleri</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white/70 p-2 rounded">
                    <p className="text-gray-500">Aktif Öğrenci</p>
                    <p className="font-bold">{seasonStats.students?.total_active || 0}</p>
                  </div>
                  <div className="bg-white/70 p-2 rounded">
                    <p className="text-gray-500">Aktif Öğretmen</p>
                    <p className="font-bold">{seasonStats.teachers?.total_active || 0}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Year End Confirmation Dialog */}
        <AlertDialog open={yearEndDialogOpen} onOpenChange={setYearEndDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-amber-700">Sene Sonu İşlemi</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>Bu işlem şunları yapacak:</p>
                <ul className="list-disc list-inside text-sm space-y-1">
                  <li>5, 6, 7. sınıf öğrenciler bir üst sınıfa geçecek</li>
                  <li>8. sınıf öğrenciler <strong>pasife alınacak</strong></li>
                </ul>
                <p className="text-red-600 font-medium mt-4">
                  Bu işlem geri alınamaz! Emin misiniz?
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>İptal</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleYearEnd}
                disabled={yearEndLoading}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {yearEndLoading ? 'İşleniyor...' : 'Evet, Sene Sonunu Uygula'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Audit Log Popup */}
        <AuditLogPopup 
          open={auditLogPopupOpen} 
          onClose={() => setAuditLogPopupOpen(false)} 
        />
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
