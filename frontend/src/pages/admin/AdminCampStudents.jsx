import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layouts/AdminLayout';
import apiClient from '../../api/axios';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { Plus, ArrowLeft, Edit, Trash2, User } from 'lucide-react';

const AdminCampStudents = () => {
  const { campId } = useParams();
  const navigate = useNavigate();
  const [camp, setCamp] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [formData, setFormData] = useState({
    student_name: '',
    parent_name: '',
    phone: '',
    registration_status: 'on_kayit',
    payment_amount: '',
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, [campId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [campRes, studentsRes] = await Promise.all([
        apiClient.get(`/camps/${campId}`),
        apiClient.get(`/camps/${campId}/students`)
      ]);
      setCamp(campRes.data);
      setStudents(studentsRes.data);
    } catch (error) {
      toast.error('Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (student = null) => {
    if (student) {
      setEditingStudent(student);
      setFormData({
        student_name: student.student_name,
        parent_name: student.parent_name,
        phone: student.phone,
        registration_status: student.registration_status,
        payment_amount: student.payment_amount.toString(),
        notes: student.notes || ''
      });
    } else {
      setEditingStudent(null);
      setFormData({
        student_name: '',
        parent_name: '',
        phone: '',
        registration_status: 'on_kayit',
        payment_amount: '',
        notes: ''
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.student_name || !formData.parent_name || !formData.phone || !formData.payment_amount) {
      toast.error('Zorunlu alanları doldurun');
      return;
    }

    try {
      // Ödeme durumu statüye göre otomatik belirlenir
      const isPaymentCompleted = formData.registration_status === 'kesin_kayit';
      
      const payload = {
        student_name: formData.student_name,
        parent_name: formData.parent_name,
        phone: formData.phone,
        registration_status: formData.registration_status,
        payment_amount: parseFloat(formData.payment_amount),
        payment_completed: isPaymentCompleted,  // Statüye bağlı otomatik
        notes: formData.notes || null,
        camp_id: campId
      };

      if (editingStudent) {
        await apiClient.put(`/camp-students/${editingStudent.id}`, payload);
        toast.success('Katılımcı güncellendi');
      } else {
        await apiClient.post(`/camps/${campId}/students`, payload);
        toast.success('Katılımcı eklendi');
      }
      
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('İşlem başarısız');
    }
  };

  const handleDelete = async (studentId) => {
    if (!window.confirm('Bu katılımcıyı silmek istediğinize emin misiniz?')) {
      return;
    }

    try {
      await apiClient.delete(`/camp-students/${studentId}`);
      toast.success('Katılımcı silindi');
      fetchData();
    } catch (error) {
      toast.error('Silme işlemi başarısız');
    }
  };

  // Statü değişikliği - ödeme durumu statüye bağlı
  const handleStatusChange = async (student, newStatus) => {
    try {
      await apiClient.put(`/camp-students/${student.id}`, {
        registration_status: newStatus,
        payment_completed: newStatus === 'kesin_kayit'  // Kesin kayıt = ödeme yapılmış
      });
      toast.success('Durum güncellendi');
      fetchData();
    } catch (error) {
      toast.error('İşlem başarısız');
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'kesin_kayit':
        return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700">Kesin Kayıt</span>;
      case 'yedek':
        return <span className="px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-700">Yedek</span>;
      default:
        return <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700">Ön Kayıt</span>;
    }
  };

  // Özet hesaplamaları - kesin kayıt = ödeme yapılmış
  const totalStudents = students.length;
  const confirmedCount = students.filter(s => s.registration_status === 'kesin_kayit').length;
  const paidCount = confirmedCount;  // Kesin kayıt = ödeme yapılmış
  const totalRevenue = students.filter(s => s.registration_status === 'kesin_kayit').reduce((sum, s) => sum + s.payment_amount, 0);
  const teacherEarning = paidCount * (camp?.per_student_teacher_fee || 0);

  if (loading) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-slate-600">Yükleniyor...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div>
        {/* Header */}
        <div className="mb-8">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/admin/camps')}
            className="mb-4"
          >
            <ArrowLeft size={20} className="mr-2" />
            Kamplara Dön
          </Button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-extrabold text-slate-800 mb-2" data-testid="camp-students-title">
                {camp?.name} - Katılımcılar
              </h1>
              <p className="text-slate-600">
                {camp?.class_level}. Sınıf • Öğretmen başı: {camp?.per_student_teacher_fee} ₺
              </p>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()} className="admin-btn" data-testid="add-participant-btn">
                  <Plus size={20} className="mr-2" />
                  Katılımcı Ekle
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[calc(100%-2rem)] sm:max-w-lg mx-auto max-h-[85vh] overflow-y-auto rounded-xl">
                <DialogHeader>
                  <DialogTitle className="text-lg">{editingStudent ? 'Katılımcı Düzenle' : 'Yeni Katılımcı Ekle'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pb-2">
                  <div className="space-y-2">
                    <Label>Öğrenci Adı *</Label>
                    <Input
                      value={formData.student_name}
                      onChange={(e) => setFormData({ ...formData, student_name: e.target.value })}
                      placeholder="Öğrenci adı"
                      data-testid="student-name-input"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Veli Adı *</Label>
                    <Input
                      value={formData.parent_name}
                      onChange={(e) => setFormData({ ...formData, parent_name: e.target.value })}
                      placeholder="Veli adı"
                      data-testid="parent-name-input"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Telefon *</Label>
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="0532 123 4567"
                      data-testid="phone-input"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Kayıt Durumu *</Label>
                    <Select 
                      value={formData.registration_status} 
                      onValueChange={(value) => setFormData({ ...formData, registration_status: value })}
                    >
                      <SelectTrigger data-testid="status-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="on_kayit">Ön Kayıt</SelectItem>
                        <SelectItem value="kesin_kayit">Kesin Kayıt</SelectItem>
                        <SelectItem value="yedek">Yedek</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Ödeme Tutarı (₺) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.payment_amount}
                      onChange={(e) => setFormData({ ...formData, payment_amount: e.target.value })}
                      placeholder="500"
                      data-testid="payment-amount-input"
                    />
                  </div>

                  {/* Statüye göre otomatik ödeme bilgisi */}
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <p className="text-sm text-blue-700">
                      <strong>Not:</strong> "Kesin Kayıt" durumu seçildiğinde ödeme otomatik olarak yapılmış kabul edilir ve öğretmen kazancına eklenir.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Notlar</Label>
                    <Textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                      placeholder="Ek notlar..."
                      data-testid="notes-input"
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button onClick={handleSave} className="flex-1" data-testid="save-participant-btn">
                      {editingStudent ? 'Güncelle' : 'Ekle'}
                    </Button>
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>İptal</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="admin-card p-4">
            <p className="text-sm text-slate-500">Toplam Kayıt</p>
            <p className="text-2xl font-bold text-slate-800">{totalStudents}</p>
          </div>
          <div className="admin-card p-4">
            <p className="text-sm text-slate-500">Kesin Kayıt</p>
            <p className="text-2xl font-bold text-blue-600">{confirmedCount}</p>
          </div>
          <div className="admin-card p-4">
            <p className="text-sm text-slate-500">Ödeme Yapan</p>
            <p className="text-2xl font-bold text-green-600">{paidCount}</p>
          </div>
          <div className="admin-card p-4">
            <p className="text-sm text-slate-500">Toplam Gelir</p>
            <p className="text-2xl font-bold text-emerald-600">{totalRevenue} ₺</p>
          </div>
          <div className="admin-card p-4">
            <p className="text-sm text-slate-500">Öğretmen Kazancı</p>
            <p className="text-2xl font-bold text-purple-600">{teacherEarning} ₺</p>
          </div>
        </div>

        {/* Students Table */}
        {students.length === 0 ? (
          <div className="admin-card p-12 text-center">
            <User size={48} className="mx-auto mb-4 text-slate-400" />
            <p className="text-slate-600 text-lg">Henüz katılımcı eklenmemiş</p>
            <p className="text-slate-500 text-sm mt-2">Yukarıdaki butonu kullanarak katılımcı ekleyin</p>
          </div>
        ) : (
          <div className="admin-card overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left py-4 px-4 font-semibold text-slate-700">Öğrenci Adı</th>
                  <th className="text-left py-4 px-4 font-semibold text-slate-700">Veli Adı</th>
                  <th className="text-left py-4 px-4 font-semibold text-slate-700">Telefon</th>
                  <th className="text-center py-4 px-4 font-semibold text-slate-700">Durum</th>
                  <th className="text-center py-4 px-4 font-semibold text-slate-700">Tutar</th>
                  <th className="text-center py-4 px-4 font-semibold text-slate-700">Ödeme</th>
                  <th className="text-right py-4 px-4 font-semibold text-slate-700">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id} className="border-t hover:bg-slate-50" data-testid={`student-row-${student.id}`}>
                    <td className="py-4 px-4 font-medium text-slate-800">{student.student_name}</td>
                    <td className="py-4 px-4 text-slate-600">{student.parent_name}</td>
                    <td className="py-4 px-4 text-slate-600">{student.phone}</td>
                    <td className="py-4 px-4 text-center">
                      <Select 
                        value={student.registration_status} 
                        onValueChange={(value) => handleStatusChange(student, value)}
                      >
                        <SelectTrigger className="w-32 h-8 text-xs" data-testid={`status-select-${student.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="on_kayit">Ön Kayıt</SelectItem>
                          <SelectItem value="kesin_kayit">Kesin Kayıt</SelectItem>
                          <SelectItem value="yedek">Yedek</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-4 px-4 text-center font-semibold">{student.payment_amount} ₺</td>
                    <td className="py-4 px-4 text-center">
                      {/* Ödeme durumu statüye bağlı - sadece gösterim */}
                      {student.registration_status === 'kesin_kayit' ? (
                        <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700 font-medium">
                          ✓ Ödendi
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs rounded-full bg-slate-100 text-slate-600">
                          Bekliyor
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenDialog(student)}
                          data-testid={`edit-student-${student.id}`}
                        >
                          <Edit size={16} />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(student.id)}
                          className="text-red-600 hover:bg-red-50"
                          data-testid={`delete-student-${student.id}`}
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

export default AdminCampStudents;
