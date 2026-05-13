import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layouts/AdminLayout';
import { Users, GraduationCap, CreditCard, TrendingUp, ArrowRight, Calendar, Landmark } from 'lucide-react';
import { Button } from '../../components/ui/button';
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
  const [auditLogPopupOpen, setAuditLogPopupOpen] = useState(false);

  useEffect(() => {
    fetchBankAccounts();
    checkForAuditLogs();
  }, []);

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

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="admin-card p-8">
            <div className="flex items-center gap-3 mb-4">
              <Landmark size={24} className="text-blue-600" />
              <h3 className="text-2xl font-bold text-slate-800">Banka Hesapları</h3>
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
                    <p className="font-bold text-blue-600 text-lg">{formatMoney(account.balance || 0)} ₺</p>
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
            
            {/* Sene Sonu Butonu */}
            <div className="mt-6 pt-4 border-t border-blue-200">
              <Button
                variant="outline"
                onClick={() => setYearEndDialogOpen(true)}
                className="w-full bg-white hover:bg-amber-50 text-amber-700 border-amber-300"
                data-testid="year-end-btn"
              >
                <Calendar size={18} className="mr-2" />
                Sene Sonu İşlemi
              </Button>
              <p className="text-xs text-slate-500 mt-2">
                Tüm öğrencilerin sınıfını 1 arttırır. 8. sınıflar pasife alınır.
              </p>
            </div>
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
