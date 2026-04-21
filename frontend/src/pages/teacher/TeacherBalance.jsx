import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import TeacherLayout from '../../components/layouts/TeacherLayout';
import apiClient from '../../api/axios';
import { useAuth } from '../../contexts/AuthContext';
import { Wallet, BookOpen, Tent, Youtube, Filter, ChevronRight, X, Banknote, Building2, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { ExpandableText } from '../../components/ui/expandable-text';
import { formatDateTurkish, generateMonthOptions } from '../../lib/dateUtils';
import { formatMoney } from '../../lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';

const TeacherBalance = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [balanceData, setBalanceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [paymentDetailOpen, setPaymentDetailOpen] = useState(false);

  // Dinamik ay listesi: 6 ay önce, 3 ay sonra
  const dynamicMonths = generateMonthOptions(6, 3);
  const months = [
    { value: 'all', label: 'Tüm Zamanlar' },
    ...dynamicMonths
  ];

  useEffect(() => {
    if (user?.teacher_id) {
      fetchBalance();
    }
  }, [user, selectedMonth]);

  const fetchBalance = async () => {
    setLoading(true);
    try {
      let url = `/teacher-balance/${user.teacher_id}`;
      if (selectedMonth !== 'all') {
        url += `?month=${selectedMonth}`;
      }
      const response = await apiClient.get(url);
      setBalanceData(response.data);
    } catch (error) {
      toast.error('Bakiye bilgileri yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <TeacherLayout>
        <div className="text-center py-12">Yükleniyor...</div>
      </TeacherLayout>
    );
  }

  if (!balanceData) {
    return (
      <TeacherLayout>
        <div className="text-center py-12">Bakiye bilgileri yüklenemedi</div>
      </TeacherLayout>
    );
  }

  const paymentDetails = balanceData.payment_details || {};

  return (
    <TeacherLayout>
      <div className="max-w-5xl mx-auto">
        {/* Header - Mobile optimized */}
        <div className="mb-8 lg:mb-12 text-center">
          <Wallet size={40} className="lg:hidden mx-auto mb-3 text-teal-600" />
          <Wallet size={48} className="hidden lg:block mx-auto mb-4 text-teal-600" />
          <h1 className="text-3xl lg:text-5xl font-extrabold text-slate-800 mb-2 lg:mb-3" data-testid="teacher-balance-title">
            Bakiye Takip
          </h1>
          <p className="text-base lg:text-lg text-stone-600">
            Kazancınızı ve ödeme geçmişinizi görüntüleyin
          </p>
        </div>

        {/* Ay Filtresi - Mobile optimized */}
        <div className="teacher-card p-3 lg:p-4 mb-6 lg:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <Filter size={18} className="text-stone-500" />
              <span className="text-sm font-medium text-stone-700">Dönem:</span>
            </div>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="h-11 lg:h-10 w-full sm:w-48" data-testid="month-filter">
                <SelectValue placeholder="Dönem seçin" />
              </SelectTrigger>
              <SelectContent>
                {months.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedMonth !== 'all' && (
              <span className="text-xs lg:text-sm text-teal-600 font-medium">
                {months.find(m => m.value === selectedMonth)?.label}
              </span>
            )}
          </div>
        </div>

        {/* Ana Özet Kartları - Mobile optimized */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-8 mb-6 lg:mb-10">
          <div className="teacher-card p-4 lg:p-8 text-center">
            <p className="text-xs lg:text-sm text-stone-500 mb-1 lg:mb-2">Toplam Kazanç</p>
            <p className="text-2xl lg:text-4xl font-bold text-teal-600">{formatMoney(balanceData.total_earnings, false)} ₺</p>
          </div>
          <div 
            className="teacher-card p-4 lg:p-8 text-center cursor-pointer hover:shadow-lg transition-shadow border-2 border-transparent hover:border-green-200"
            onClick={() => setPaymentDetailOpen(true)}
            data-testid="payment-detail-trigger"
          >
            <p className="text-xs lg:text-sm text-stone-500 mb-1 lg:mb-2">Yapılan Ödeme</p>
            <p className="text-2xl lg:text-4xl font-bold text-green-600">{formatMoney(balanceData.total_paid, false)} ₺</p>
            <p className="text-xs text-green-600 mt-1">Detay için tıklayın →</p>
          </div>
          <div className="teacher-card p-4 lg:p-8 text-center">
            <p className="text-xs lg:text-sm text-stone-500 mb-1 lg:mb-2">Kalan Bakiye</p>
            <p className="text-2xl lg:text-4xl font-bold text-amber-600">{formatMoney(balanceData.balance, false)} ₺</p>
          </div>
        </div>

        {/* Ödeme Detay Modalı */}
        <Dialog open={paymentDetailOpen} onOpenChange={setPaymentDetailOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt size={20} className="text-green-600" />
                Ödeme Detayları
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              {/* Elden Alınan Tutar */}
              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Banknote size={24} className="text-blue-600" />
                  <div>
                    <p className="font-medium text-slate-800">Elden Alınan Tutar</p>
                    <p className="text-xs text-slate-500">Nakit ödemeler</p>
                  </div>
                </div>
                <p className="text-xl font-bold text-blue-600">{formatMoney(paymentDetails.elden_tutar || 0, false)} ₺</p>
              </div>

              {/* Resmi Yatırılan Tutar (Brüt) */}
              <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Building2 size={24} className="text-purple-600" />
                  <div>
                    <p className="font-medium text-slate-800">Resmi Yatırılan Tutar (Brüt)</p>
                    <p className="text-xs text-slate-500">Banka/Resmi ödemeler</p>
                  </div>
                </div>
                <p className="text-xl font-bold text-purple-600">{formatMoney(paymentDetails.resmi_brut_tutar || 0, false)} ₺</p>
              </div>

              {/* Resmi Maaştan Kesilen Vergi */}
              <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Receipt size={24} className="text-red-600" />
                  <div>
                    <p className="font-medium text-slate-800">Resmi Maaştan Kesilen Vergi</p>
                    <p className="text-xs text-slate-500">Vergi kesintileri toplamı</p>
                  </div>
                </div>
                <p className="text-xl font-bold text-red-600">-{formatMoney(paymentDetails.resmi_vergi_toplami || 0, false)} ₺</p>
              </div>

              <hr className="border-slate-200" />

              {/* Toplam Ödeme (Brüt) */}
              <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                <div>
                  <p className="font-medium text-slate-800">Toplam Ödeme (Brüt)</p>
                  <p className="text-xs text-slate-500">Elden + Resmi</p>
                </div>
                <p className="text-xl font-bold text-green-600">{formatMoney(paymentDetails.toplam_odeme_brut || 0, false)} ₺</p>
              </div>

              {/* Toplam Net Kazanç */}
              <div className="flex items-center justify-between p-4 bg-teal-50 rounded-lg border-2 border-teal-200">
                <div>
                  <p className="font-medium text-slate-800">Toplam Net Kazanç</p>
                  <p className="text-xs text-slate-500">Brüt - Vergi</p>
                </div>
                <p className="text-2xl font-bold text-teal-600">{formatMoney(paymentDetails.toplam_net_kazanc || 0, false)} ₺</p>
              </div>

              <p className="text-xs text-slate-500 text-center mt-4">
                * Kalan Bakiye = Toplam Kazanç - Toplam Ödeme (Brüt)
              </p>
            </div>
          </DialogContent>
        </Dialog>

        {/* Kazanç Detayları - Mobile optimized - Clickable */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-6 mb-6 lg:mb-10">
          <div 
            className="teacher-card p-4 lg:p-6 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/teacher/lesson-income')}
          >
            <div className="flex items-center justify-between mb-2 lg:mb-4">
              <div className="flex items-center gap-2 lg:gap-3">
                <BookOpen size={20} className="lg:hidden text-blue-600" />
                <BookOpen size={24} className="hidden lg:block text-blue-600" />
                <h3 className="text-base lg:text-lg font-bold text-slate-800">Ders Kazancı</h3>
              </div>
              <ChevronRight size={18} className="text-slate-400" />
            </div>
            <p className="text-xl lg:text-3xl font-bold text-blue-600">{formatMoney(balanceData.lesson_earnings, false)} ₺</p>
            <p className="text-xs lg:text-sm text-slate-500 mt-1 lg:mt-2">Detay için tıklayın</p>
          </div>
          
          <div 
            className="teacher-card p-4 lg:p-6 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/teacher/camp-income')}
          >
            <div className="flex items-center justify-between mb-2 lg:mb-4">
              <div className="flex items-center gap-2 lg:gap-3">
                <Tent size={20} className="lg:hidden text-emerald-600" />
                <Tent size={24} className="hidden lg:block text-emerald-600" />
                <h3 className="text-base lg:text-lg font-bold text-slate-800">Kamp Kazancı</h3>
              </div>
              <ChevronRight size={18} className="text-slate-400" />
            </div>
            <p className="text-xl lg:text-3xl font-bold text-emerald-600">{formatMoney(balanceData.camp_earnings, false)} ₺</p>
            <p className="text-xs lg:text-sm text-slate-500 mt-1 lg:mt-2">Detay için tıklayın</p>
          </div>

          <div 
            className="teacher-card p-4 lg:p-6 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/teacher/youtube-income')}
          >
            <div className="flex items-center justify-between mb-2 lg:mb-4">
              <div className="flex items-center gap-2 lg:gap-3">
                <Youtube size={20} className="lg:hidden text-red-600" />
                <Youtube size={24} className="hidden lg:block text-red-600" />
                <h3 className="text-base lg:text-lg font-bold text-slate-800">YouTube Kazancı</h3>
              </div>
              <ChevronRight size={18} className="text-slate-400" />
            </div>
            <p className="text-xl lg:text-3xl font-bold text-red-600">{formatMoney(balanceData.youtube_earnings, false)} ₺</p>
            <p className="text-xs lg:text-sm text-slate-500 mt-1 lg:mt-2">Detay için tıklayın</p>
          </div>
        </div>

        {/* Ödeme Geçmişi - Mobile optimized */}
        <div className="teacher-card p-4 lg:p-8">
          <h2 className="text-lg lg:text-2xl font-bold text-slate-800 mb-4 lg:mb-6">Ödeme Geçmişi</h2>
          {!balanceData.payments || balanceData.payments.length === 0 ? (
            <p className="text-stone-600 text-center py-8 lg:py-12">Henüz ödeme yapılmamış</p>
          ) : (
            <div className="space-y-2 lg:space-y-4">
              {balanceData.payments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between p-3 lg:p-6 bg-stone-50 rounded-lg lg:rounded-xl">
                  <div className="min-w-0 flex-1 mr-3">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-800 text-sm lg:text-lg">{formatDateTurkish(payment.date)}</p>
                      {payment.payment_method && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          payment.payment_method === 'elden' 
                            ? 'bg-blue-100 text-blue-700' 
                            : 'bg-purple-100 text-purple-700'
                        }`}>
                          {payment.payment_method === 'elden' ? 'Elden' : 'Resmi'}
                        </span>
                      )}
                    </div>
                    <div className="text-xs lg:text-sm text-stone-600">
                      <ExpandableText text={payment.description || 'Öğretmen ödemesi'} maxLength={40} />
                      {payment.payment_method === 'resmi' && payment.tax_amount > 0 && (
                        <span className="text-red-500 ml-2">(Vergi: {formatMoney(payment.tax_amount, false)} ₺)</span>
                      )}
                    </div>
                  </div>
                  <p className="font-bold text-green-600 text-base lg:text-xl whitespace-nowrap">{formatMoney(payment.amount, false)} ₺</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </TeacherLayout>
  );
};

export default TeacherBalance;
