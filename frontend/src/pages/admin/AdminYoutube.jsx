import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/layouts/AdminLayout';
import apiClient from '../../api/axios';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Youtube, Edit, Trash2 } from 'lucide-react';

const AdminYoutube = () => {
  const [records, setRecords] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [filterTeacher, setFilterTeacher] = useState('all');
  const [formData, setFormData] = useState({
    teacher_id: '',
    title: '',
    amount: '',
    date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [recordsRes, teachersRes] = await Promise.all([
        apiClient.get('/youtube-contents'),
        apiClient.get('/teachers')
      ]);
      setRecords(recordsRes.data);
      setTeachers(teachersRes.data.filter(t => t.status === 'active'));
    } catch (error) {
      toast.error('Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (record = null) => {
    if (record) {
      setEditingRecord(record);
      setFormData({
        teacher_id: record.teacher_id,
        title: record.title,
        amount: record.amount.toString(),
        date: record.date
      });
    } else {
      setEditingRecord(null);
      setFormData({
        teacher_id: '',
        title: '',
        amount: '',
        date: new Date().toISOString().split('T')[0]
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.teacher_id || !formData.title || !formData.amount) {
      toast.error('Tüm alanları doldurun');
      return;
    }

    try {
      const payload = {
        teacher_id: formData.teacher_id,
        title: formData.title,
        amount: parseFloat(formData.amount),
        date: formData.date
      };

      if (editingRecord) {
        await apiClient.put(`/youtube-contents/${editingRecord.id}`, payload);
        toast.success('Kayıt güncellendi');
      } else {
        await apiClient.post('/youtube-contents', payload);
        toast.success('Kayıt oluşturuldu');
      }
      
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('İşlem başarısız');
    }
  };

  const handleDelete = async (recordId) => {
    if (!window.confirm('Bu kaydı kalıcı olarak silmek istediğinize emin misiniz?')) {
      return;
    }

    try {
      await apiClient.delete(`/youtube-contents/${recordId}`);
      toast.success('Kayıt silindi');
      fetchData();
    } catch (error) {
      toast.error('İşlem başarısız');
    }
  };

  // Filtreleme: ay ve öğretmen
  const filteredRecords = records.filter((r) => {
    if (filterMonth && !(r.date || '').startsWith(filterMonth)) return false;
    if (filterTeacher !== 'all' && r.teacher_id !== filterTeacher) return false;
    return true;
  });

  // Toplam kazanç hesapla (filtrelenmiş)
  const totalEarnings = filteredRecords.reduce((sum, r) => sum + r.amount, 0);

  return (
    <AdminLayout>
      <div>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-extrabold text-slate-800 mb-2" data-testid="admin-youtube-title">
              YouTube Video Çekimi
            </h1>
            <p className="text-slate-600">Öğretmenlerin YouTube kazançlarını yönetin</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()} className="admin-btn" data-testid="new-youtube-btn">
                <Plus size={20} className="mr-2" />
                Yeni Kayıt
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingRecord ? 'Kayıt Düzenle' : 'Yeni YouTube Kaydı'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Öğretmen *</Label>
                  <Select value={formData.teacher_id} onValueChange={(value) => setFormData({ ...formData, teacher_id: value })}>
                    <SelectTrigger data-testid="youtube-teacher-select">
                      <SelectValue placeholder="Öğretmen seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {teachers.map((teacher) => (
                        <SelectItem key={teacher.id} value={teacher.id}>{teacher.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Başlık *</Label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Örn: 7. Sınıf Matematik - Denklemler"
                    data-testid="youtube-title-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tutar (₺) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="500"
                    data-testid="youtube-amount-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tarih</Label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    data-testid="youtube-date-input"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button onClick={handleSave} className="flex-1" data-testid="save-youtube-btn">
                    {editingRecord ? 'Güncelle' : 'Kaydet'}
                  </Button>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>İptal</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary */}
        <div className="admin-card p-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <Youtube size={24} className="text-red-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Toplam YouTube Kazancı {filterMonth ? `(${filterMonth})` : ''}</p>
              <p className="text-2xl font-bold text-red-600">{totalEarnings.toFixed(2)} ₺</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="admin-card p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-slate-500">Ay</Label>
              <Input
                type="month"
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                data-testid="youtube-filter-month"
                className="h-10"
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-slate-500">Öğretmen</Label>
              <Select value={filterTeacher} onValueChange={setFilterTeacher}>
                <SelectTrigger data-testid="youtube-filter-teacher" className="h-10">
                  <SelectValue placeholder="Tümü" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  {teachers.map((teacher) => (
                    <SelectItem key={teacher.id} value={teacher.id}>{teacher.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => { setFilterMonth(''); setFilterTeacher('all'); }}
                data-testid="youtube-filter-clear"
                className="h-10"
              >
                Temizle
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-slate-600">Yükleniyor...</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="admin-card p-12 text-center">
            <Youtube size={48} className="mx-auto mb-4 text-slate-400" />
            <p className="text-slate-600 text-lg">Bu filtreye uygun YouTube kaydı yok</p>
            <p className="text-slate-500 text-sm mt-2">Filtreleri değiştirin veya yeni kayıt oluşturun</p>
          </div>
        ) : (
          <div className="admin-card overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left py-4 px-4 font-semibold text-slate-700">Öğretmen</th>
                  <th className="text-left py-4 px-4 font-semibold text-slate-700">Başlık</th>
                  <th className="text-center py-4 px-4 font-semibold text-slate-700">Tutar</th>
                  <th className="text-center py-4 px-4 font-semibold text-slate-700">Tarih</th>
                  <th className="text-right py-4 px-4 font-semibold text-slate-700">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => (
                  <tr key={record.id} className="border-t hover:bg-slate-50" data-testid={`youtube-row-${record.id}`}>
                    <td className="py-4 px-4 font-medium text-slate-800">{record.teacher_name}</td>
                    <td className="py-4 px-4 text-slate-600">{record.title}</td>
                    <td className="py-4 px-4 text-center font-semibold text-green-600">{record.amount} ₺</td>
                    <td className="py-4 px-4 text-center text-slate-600">{record.date}</td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenDialog(record)}
                          data-testid={`youtube-edit-btn-${record.id}`}
                        >
                          <Edit size={16} />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(record.id)}
                          className="text-red-600 hover:bg-red-50"
                          data-testid={`youtube-delete-btn-${record.id}`}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminYoutube;
