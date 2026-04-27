import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layouts/AdminLayout';
import apiClient from '../../api/axios';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { ArrowLeft, Plus, Wallet, BookOpen, Tent, Youtube, ChevronRight, Receipt, Banknote, Building2, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { formatMoney } from '../../lib/utils';
import { generateMonthOptions, formatDateTurkish } from '../../lib/dateUtils';
import { ExpandableText } from '../../components/ui/expandable-text';

const AdminTeacherBalance = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [teacher, setTeacher] = useState(null);
  const [balanceData, setBalanceData] = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [earningsDetailOpen, setEarningsDetailOpen] = useState(false);
  const [paymentDetailOpen, setPaymentDetailOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [newPayment, setNewPayment] = useState({
    amount: '',
    date: new Date().toISOString().split('T')[0],
    bank_account_id: '',
    description: 'Öğretmen ödemesi',
    payment_method: 'elden',
    tax_amount: ''
  });

  // Dinamik ay listesi: 6 ay önce, 3 ay sonra
  const dynamicMonths = generateMonthOptions(6, 3);
  const months = [
    { value: 'all', label: 'Tüm Zamanlar' },
    ...dynamicMonths
  ];

  useEffect(() => {
    fetchData();
  }, [id, selectedMonth]);

  const fetchData = async () => {
    try {
      const monthParam = selectedMonth !== 'all' ? `?month=${selectedMonth}` : '';
      const [teacherRes, balanceRes, banksRes] = await Promise.all([
        apiClient.get(`/teachers/${id}`),
        apiClient.get(`/teacher-balance/${id}${monthParam}`),
        apiClient.get('/bank-accounts')
      ]);
      setTeacher(teacherRes.data);
      setBalanceData(balanceRes.data);
      setBankAccounts(banksRes.data);
    } catch (error) {
      toast.error('Veriler yüklenemedi');
    }
  };

  const handleAddPayment = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post('/payments', {
        payment_type: 'teacher_payment',
        teacher_id: id,
        amount: parseFloat(newPayment.amount),
        date: newPayment.date,
        bank_account_id: newPayment.bank_account_id || null,
        description: newPayment.description,
        payment_method: newPayment.payment_method,
        tax_amount: newPayment.tax_amount ? parseFloat(newPayment.tax_amount) : 0
      });
      toast.success('Ödeme eklendi');
      setDialogOpen(false);
      setNewPayment({ 
        amount: '', 
        date: new Date().toISOString().split('T')[0], 
        bank_account_id: '', 
        description: 'Öğretmen ödemesi',
        payment_method: 'elden',
        tax_amount: ''
      });
      fetchData();
    } catch (error) {
      toast.error('Ödeme eklenemedi');
    }
  };

  // Ödeme güncelleme işlevi (admin özelliği)
  const handleDeletePayment = async (paymentId) => {
    if (!window.confirm('Bu ödemeyi silmek istediğinizden emin misiniz?')) return;
    try {
      await apiClient.delete(`/payments/${paymentId}`);
      toast.success('Ödeme silindi');
      fetchData();
    } catch (error) {
      toast.error('Ödeme silinemedi');
    }
  };

  if (!teacher || !balanceData) {
    return (
      <AdminLayout>
        <div className="text-center py-12">Yükleniyor...</div>
      </AdminLayout>
    );
  }

  // Ödeme detayları için filtreleme
  const filteredPayments = balanceData.payments || [];
  const eldenPayments = filteredPayments.filter(p => p.payment_method === 'elden');
  const resmiPayments = filteredPayments.filter(p => p.payment_method === 'resmi');

  return (
    <AdminLayout>
      <div>
        <Button
          onClick={() => navigate(`/admin/teachers/${id}`)}
          variant="ghost"
          className="mb-4"
        >
          <ArrowLeft size={20} className="mr-2" />
          Geri Dön
        </Button>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-extrabold text-slate-800 mb-2">
              Bakiye Bilgisi - {teacher.name}
            </h1>
          </div>
          
          {/* Ay Filtresi */}
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-slate-500" />
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[180px]" data-testid="month-select">
                <SelectValue placeholder="Dönem seçin" />
              </SelectTrigger>
              <SelectContent>
                {months.map((month) => (
                  <SelectItem key={month.value} value={month.value}>
                    {month.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Ana Bakiye Kartları */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Toplam Kazanç - Tıklanabilir */}
          <div 
            className="admin-card p-6 cursor-pointer hover:shadow-lg transition-shadow border-2 border-transparent hover:border-blue-200"
            onClick={() => setEarningsDetailOpen(true)}
            data-testid="total-earnings-card"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Toplam Kazanç</p>
                <p className="text-3xl font-bold text-blue-600">{formatMoney(balanceData.total_earnings)} ₺</p>
              </div>
              <div className="flex items-center text-blue-500">
                <Wallet size={24} />
                <ChevronRight size={20} />
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-2">Detayları görmek için tıklayın</p>
          </div>
          
          {/* Yapılan Ödeme - Tıklanabilir */}
          <div 
            className="admin-card p-6 cursor-pointer hover:shadow-lg transition-shadow border-2 border-transparent hover:border-green-200"
            onClick={() => setPaymentDetailOpen(true)}
            data-testid="total-paid-card"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Yapılan Ödeme</p>
                <p className="text-3xl font-bold text-green-600">{formatMoney(balanceData.total_paid)} ₺</p>
              </div>
              <div className="flex items-center text-green-500">
                <Receipt size={24} />
                <ChevronRight size={20} />
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-2">Ödeme detayları için tıklayın</p>
          </div>
          
          <div className="admin-card p-6">
            <p className="text-sm text-slate-500 mb-1">Kalan Bakiye</p>
            <p className={`text-3xl font-bold ${balanceData.balance >= 0 ? 'text-orange-600' : 'text-red-600'}`}>
              {formatMoney(balanceData.balance)} ₺
            </p>
          </div>
        </div>

        {/* Ödeme Geçmişi */}
        <div className="admin-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-800">Ödeme Geçmişi</h2>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="add-payment-btn" className="admin-btn">
                  <Plus size={20} className="mr-2" />
                  Ödeme Girişi
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Ödeme Girişi</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddPayment} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="amount">Tutar (₺)</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      value={newPayment.amount}
                      onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date">Tarih</Label>
                    <Input
                      id="date"
                      type="date"
                      value={newPayment.date}
                      onChange={(e) => setNewPayment({ ...newPayment, date: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Ödeme Türü</Label>
                    <Select value={newPayment.payment_method} onValueChange={(value) => setNewPayment({ ...newPayment, payment_method: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Ödeme türü seçin" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="elden">Elden</SelectItem>
                        <SelectItem value="resmi">Resmi</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {newPayment.payment_method === 'resmi' && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="bank_account">Banka Hesabı</Label>
                        <Select value={newPayment.bank_account_id} onValueChange={(value) => setNewPayment({ ...newPayment, bank_account_id: value })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Banka hesabı seçin" />
                          </SelectTrigger>
                          <SelectContent>
                            {bankAccounts.map((account) => (
                              <SelectItem key={account.id} value={account.id}>
                                {account.bank_name} - {account.holder_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tax_amount">Vergi Tutarı (₺)</Label>
                        <Input
                          id="tax_amount"
                          type="number"
                          step="0.01"
                          value={newPayment.tax_amount}
                          onChange={(e) => setNewPayment({ ...newPayment, tax_amount: e.target.value })}
                          placeholder="0"
                        />
                      </div>
                    </>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="description">Açıklama</Label>
                    <Textarea
                      id="description"
                      value={newPayment.description}
                      onChange={(e) => setNewPayment({ ...newPayment, description: e.target.value })}
                      placeholder="Ödeme açıklaması"
                    />
                  </div>
                  <div className="flex gap-3">
                    <Button type="submit" className="flex-1">Kaydet</Button>
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>İptal</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {filteredPayments.length === 0 ? (
            <p className="text-slate-600 text-center py-8">Henüz ödeme yapılmamış</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {filteredPayments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {payment.payment_method === 'resmi' ? (
                      <Building2 size={20} className="text-blue-500" />
                    ) : (
                      <Banknote size={20} className="text-green-500" />
                    )}
                    <div>
                      <p className="font-semibold text-slate-800">
                        {formatDateTurkish(payment.date)}
                        <span className={`ml-2 text-xs px-2 py-0.5 rounded ${payment.payment_method === 'resmi' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                          {payment.payment_method === 'resmi' ? 'Resmi' : 'Elden'}
                        </span>
                      </p>
                      <p className="text-sm text-slate-600">{payment.description || 'Öğretmen ödemesi'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="font-bold text-green-600">{formatMoney(payment.amount)} ₺</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDeletePayment(payment.id)}
                    >
                      Sil
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Kazanç Detay Modal */}
        <Dialog open={earningsDetailOpen} onOpenChange={setEarningsDetailOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Kazanç Detayları - {teacher.name}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4">
              {/* Ders Kazancı */}
              <div 
                className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 cursor-pointer hover:shadow-md transition-all"
                onClick={() => {
                  setEarningsDetailOpen(false);
                  navigate(`/admin/teachers/${id}/lesson-income`);
                }}
                data-testid="lesson-income-card"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-blue-500 rounded-lg">
                    <BookOpen size={20} className="text-white" />
                  </div>
                  <span className="font-semibold text-slate-700">Ders Kazancı</span>
                </div>
                <p className="text-2xl font-bold text-blue-600">{formatMoney(balanceData.lesson_earnings)} ₺</p>
                <p className="text-xs text-slate-500 mt-2 flex items-center">
                  Detaylar için tıklayın <ChevronRight size={14} />
                </p>
              </div>

              {/* Kamp Kazancı */}
              <div 
                className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 cursor-pointer hover:shadow-md transition-all"
                onClick={() => {
                  setEarningsDetailOpen(false);
                  navigate(`/admin/teachers/${id}/camp-income`);
                }}
                data-testid="camp-income-card"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-emerald-500 rounded-lg">
                    <Tent size={20} className="text-white" />
                  </div>
                  <span className="font-semibold text-slate-700">Kamp Kazancı</span>
                </div>
                <p className="text-2xl font-bold text-emerald-600">{formatMoney(balanceData.camp_earnings)} ₺</p>
                <p className="text-xs text-slate-500 mt-2 flex items-center">
                  Detaylar için tıklayın <ChevronRight size={14} />
                </p>
              </div>

              {/* YouTube Kazancı */}
              <div 
                className="p-4 rounded-xl bg-gradient-to-br from-red-50 to-red-100 border border-red-200 cursor-pointer hover:shadow-md transition-all"
                onClick={() => {
                  setEarningsDetailOpen(false);
                  navigate(`/admin/teachers/${id}/youtube-income`);
                }}
                data-testid="youtube-income-card"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-red-500 rounded-lg">
                    <Youtube size={20} className="text-white" />
                  </div>
                  <span className="font-semibold text-slate-700">YouTube Kazancı</span>
                </div>
                <p className="text-2xl font-bold text-red-600">{formatMoney(balanceData.youtube_earnings)} ₺</p>
                <p className="text-xs text-slate-500 mt-2 flex items-center">
                  Detaylar için tıklayın <ChevronRight size={14} />
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Ödeme Detay Modal */}
        <Dialog open={paymentDetailOpen} onOpenChange={setPaymentDetailOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Ödeme Özeti - {teacher.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center gap-3">
                  <Banknote size={24} className="text-green-600" />
                  <div>
                    <p className="font-semibold text-slate-700">Elden Ödeme</p>
                    <p className="text-sm text-slate-500">{eldenPayments.length} işlem</p>
                  </div>
                </div>
                <p className="text-xl font-bold text-green-600">
                  {formatMoney(eldenPayments.reduce((sum, p) => sum + (p.amount || 0), 0))} ₺
                </p>
              </div>
              
              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-3">
                  <Building2 size={24} className="text-blue-600" />
                  <div>
                    <p className="font-semibold text-slate-700">Resmi Ödeme</p>
                    <p className="text-sm text-slate-500">{resmiPayments.length} işlem</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-blue-600">
                    {formatMoney(resmiPayments.reduce((sum, p) => sum + (p.amount || 0), 0))} ₺
                  </p>
                  <p className="text-xs text-slate-500">
                    (Vergi: {formatMoney(resmiPayments.reduce((sum, p) => sum + (p.tax_amount || 0), 0))} ₺)
                  </p>
                </div>
              </div>
              
              <div className="border-t pt-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-700">Toplam Brüt Ödeme</p>
                  <p className="text-xl font-bold text-slate-800">{formatMoney(balanceData.toplam_odeme_brut || balanceData.total_paid)} ₺</p>
                </div>
                <div className="flex items-center justify-between mt-2 text-sm text-slate-500">
                  <p>Net Kazanç (Vergi düşülmüş)</p>
                  <p>{formatMoney(balanceData.toplam_net_kazanc || balanceData.total_paid)} ₺</p>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminTeacherBalance;