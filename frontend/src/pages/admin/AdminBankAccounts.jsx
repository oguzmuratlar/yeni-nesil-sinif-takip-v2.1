import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layouts/AdminLayout';
import apiClient from '../../api/axios';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Plus, Trash2, ArrowRightLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';

const AdminBankAccounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  // Transfer state
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [transferData, setTransferData] = useState({
    from_account_id: '',
    to_account_id: '',
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const response = await apiClient.get('/bank-accounts');
      
      // Her hesap için bakiye bilgisini al
      const accountsWithBalance = await Promise.all(
        response.data.map(async (account) => {
          try {
            const balanceRes = await apiClient.get(`/bank-accounts/${account.id}/balance`);
            return { ...account, balance: balanceRes.data.balance };
          } catch (error) {
            return { ...account, balance: 0 };
          }
        })
      );
      
      setAccounts(accountsWithBalance);
    } catch (error) {
      toast.error('Hesaplar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (account) => {
    setAccountToDelete(account);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!accountToDelete) return;
    
    setDeleting(true);
    try {
      await apiClient.delete(`/bank-accounts/${accountToDelete.id}`);
      toast.success('Banka hesabı silindi');
      setDeleteDialogOpen(false);
      setAccountToDelete(null);
      fetchAccounts();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Silme işlemi başarısız');
    } finally {
      setDeleting(false);
    }
  };

  const handleTransferOpen = () => {
    setTransferData({
      from_account_id: '',
      to_account_id: '',
      amount: '',
      description: '',
      date: new Date().toISOString().split('T')[0]
    });
    setTransferDialogOpen(true);
  };

  const handleTransferSubmit = async () => {
    // Validasyonlar
    if (!transferData.from_account_id) {
      toast.error('Lütfen çıkış hesabını seçin');
      return;
    }
    if (!transferData.to_account_id) {
      toast.error('Lütfen giriş hesabını seçin');
      return;
    }
    if (transferData.from_account_id === transferData.to_account_id) {
      toast.error('Aynı hesaba transfer yapılamaz');
      return;
    }
    if (!transferData.amount || parseFloat(transferData.amount) <= 0) {
      toast.error('Lütfen geçerli bir tutar girin');
      return;
    }
    if (!transferData.date) {
      toast.error('Lütfen tarih seçin');
      return;
    }

    setTransferring(true);
    try {
      const response = await apiClient.post('/bank-accounts/transfer', {
        ...transferData,
        amount: parseFloat(transferData.amount)
      });
      toast.success(`${response.data.amount.toFixed(2)} ₺ transfer edildi: ${response.data.from_account} → ${response.data.to_account}`);
      setTransferDialogOpen(false);
      fetchAccounts();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Transfer işlemi başarısız');
    } finally {
      setTransferring(false);
    }
  };

  const fromAccount = accounts.find(a => a.id === transferData.from_account_id);
  const toAccount = accounts.find(a => a.id === transferData.to_account_id);

  return (
    <AdminLayout>
      <div>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-extrabold text-slate-800 mb-2" data-testid="admin-bank-accounts-title">
              Banka Hesapları
            </h1>
            <p className="text-slate-600">Ödeme hesaplarını yönetin</p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={handleTransferOpen}
              data-testid="transfer-btn"
              variant="outline"
              className="border-blue-200 text-blue-700 hover:bg-blue-50"
            >
              <ArrowRightLeft size={20} className="mr-2" />
              Hesaplar Arası Transfer
            </Button>
            <Button
              onClick={() => navigate('/admin/bank-accounts/new')}
              data-testid="add-bank-account-btn"
              className="admin-btn"
            >
              <Plus size={20} className="mr-2" />
              Hesap Ekle
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-slate-600">Yükleniyor...</p>
          </div>
        ) : accounts.length === 0 ? (
          <div className="admin-card p-12 text-center">
            <p className="text-slate-600">Henüz banka hesabı eklenmemiş</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {accounts.map((account) => (
              <div
                key={account.id}
                data-testid={`bank-account-card-${account.id}`}
                className="admin-card p-6"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-slate-800 mb-1">{account.bank_name}</h3>
                    <div className="flex gap-2 flex-wrap">
                      {account.is_legal && (
                        <Badge variant="secondary">Kurumsal</Badge>
                      )}
                      <Badge variant={account.balance === 0 ? 'outline' : account.balance > 0 ? 'default' : 'destructive'}>
                        Bakiye: {account.balance?.toFixed(2) || '0.00'} ₺
                      </Badge>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteClick(account)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    data-testid={`delete-account-${account.id}`}
                  >
                    <Trash2 size={18} />
                  </Button>
                </div>
                <div className="space-y-2 text-slate-700">
                  <div>
                    <span className="text-sm text-slate-500">Hesap Sahibi:</span>
                    <p className="font-semibold">{account.holder_name}</p>
                  </div>
                  <div>
                    <span className="text-sm text-slate-500">IBAN:</span>
                    <p className="font-mono text-sm">{account.iban}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Banka Hesabını Sil</AlertDialogTitle>
              <AlertDialogDescription>
                {accountToDelete && accountToDelete.balance !== 0 ? (
                  <span className="text-red-600">
                    Bu hesabın bakiyesi {accountToDelete.balance?.toFixed(2)} ₺. 
                    Hesabı silmeden önce bakiyeyi sıfırlayın.
                  </span>
                ) : (
                  <>
                    <strong>{accountToDelete?.bank_name}</strong> hesabını silmek istediğinize emin misiniz? 
                    Bu işlem geri alınamaz.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>İptal</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                disabled={deleting || (accountToDelete && accountToDelete.balance !== 0)}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleting ? 'Siliniyor...' : 'Sil'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Transfer Dialog */}
        <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-blue-600" />
                Hesaplar Arası Transfer
              </DialogTitle>
              <DialogDescription>
                Banka hesapları arasında para transferi yapın. Bu işlem branş kasalarını etkilemez.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              {/* Çıkış Hesabı */}
              <div className="space-y-2">
                <Label htmlFor="from_account" className="text-sm font-medium">
                  Paranın Çıkacağı Hesap <span className="text-red-500">*</span>
                </Label>
                <Select 
                  value={transferData.from_account_id} 
                  onValueChange={(value) => setTransferData({...transferData, from_account_id: value})}
                >
                  <SelectTrigger data-testid="from-account-select">
                    <SelectValue placeholder="Hesap seçin..." />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map(account => (
                      <SelectItem 
                        key={account.id} 
                        value={account.id}
                        disabled={account.id === transferData.to_account_id}
                      >
                        <span className="flex items-center justify-between w-full gap-4">
                          <span>{account.bank_name}</span>
                          <span className="text-slate-500 text-sm">
                            ({account.balance?.toFixed(2)} ₺)
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fromAccount && (
                  <p className="text-xs text-slate-500">
                    Mevcut bakiye: <span className="font-semibold">{fromAccount.balance?.toFixed(2)} ₺</span>
                  </p>
                )}
              </div>

              {/* Giriş Hesabı */}
              <div className="space-y-2">
                <Label htmlFor="to_account" className="text-sm font-medium">
                  Paranın Geçeceği Hesap <span className="text-red-500">*</span>
                </Label>
                <Select 
                  value={transferData.to_account_id} 
                  onValueChange={(value) => setTransferData({...transferData, to_account_id: value})}
                >
                  <SelectTrigger data-testid="to-account-select">
                    <SelectValue placeholder="Hesap seçin..." />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map(account => (
                      <SelectItem 
                        key={account.id} 
                        value={account.id}
                        disabled={account.id === transferData.from_account_id}
                      >
                        <span className="flex items-center justify-between w-full gap-4">
                          <span>{account.bank_name}</span>
                          <span className="text-slate-500 text-sm">
                            ({account.balance?.toFixed(2)} ₺)
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {toAccount && (
                  <p className="text-xs text-slate-500">
                    Mevcut bakiye: <span className="font-semibold">{toAccount.balance?.toFixed(2)} ₺</span>
                  </p>
                )}
              </div>

              {/* Transfer Özeti */}
              {fromAccount && toAccount && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800 flex items-center gap-2">
                    <span className="font-medium">{fromAccount.bank_name}</span>
                    <ArrowRightLeft className="w-4 h-4" />
                    <span className="font-medium">{toAccount.bank_name}</span>
                  </p>
                </div>
              )}

              {/* Tutar */}
              <div className="space-y-2">
                <Label htmlFor="amount" className="text-sm font-medium">
                  Tutar (₺) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={transferData.amount}
                  onChange={(e) => setTransferData({...transferData, amount: e.target.value})}
                  data-testid="transfer-amount-input"
                />
              </div>

              {/* Tarih */}
              <div className="space-y-2">
                <Label htmlFor="date" className="text-sm font-medium">
                  Tarih <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="date"
                  type="date"
                  value={transferData.date}
                  onChange={(e) => setTransferData({...transferData, date: e.target.value})}
                  data-testid="transfer-date-input"
                />
              </div>

              {/* Açıklama */}
              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-medium">
                  Açıklama (Opsiyonel)
                </Label>
                <Input
                  id="description"
                  type="text"
                  placeholder="Transfer açıklaması..."
                  value={transferData.description}
                  onChange={(e) => setTransferData({...transferData, description: e.target.value})}
                  data-testid="transfer-description-input"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setTransferDialogOpen(false)}>
                İptal
              </Button>
              <Button 
                onClick={handleTransferSubmit} 
                disabled={transferring}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="confirm-transfer-btn"
              >
                {transferring ? 'Transfer Yapılıyor...' : 'Transfer Yap'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminBankAccounts;
