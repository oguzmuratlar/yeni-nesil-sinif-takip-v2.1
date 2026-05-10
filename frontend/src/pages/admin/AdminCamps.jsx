import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layouts/AdminLayout';
import apiClient from '../../api/axios';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Users, CheckCircle, Filter, Edit, Trash2, Eye, ChevronRight } from 'lucide-react';

const AdminCamps = () => {
  const navigate = useNavigate();
  const [camps, setCamps] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCamp, setEditingCamp] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    class_level: '',
    teacher_id: '',
    per_student_teacher_fee: ''
  });

  useEffect(() => {
    fetchData();
  }, [showCompleted]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [campsRes, teachersRes] = await Promise.all([
        apiClient.get(`/camps?include_completed=${showCompleted}`),
        apiClient.get('/teachers')
      ]);
      setCamps(campsRes.data);
      setTeachers(teachersRes.data.filter(t => t.status === 'active'));
    } catch (error) {
      toast.error('Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (camp = null) => {
    if (camp) {
      setEditingCamp(camp);
      setFormData({
        name: camp.name,
        class_level: camp.class_level,
        teacher_id: camp.teacher_id,
        per_student_teacher_fee: camp.per_student_teacher_fee.toString()
      });
    } else {
      setEditingCamp(null);
      setFormData({
        name: '',
        class_level: '',
        teacher_id: '',
        per_student_teacher_fee: ''
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.class_level || !formData.teacher_id || !formData.per_student_teacher_fee) {
      toast.error('Tüm alanları doldurun');
      return;
    }

    try {
      const payload = {
        name: formData.name,
        class_level: formData.class_level,
        teacher_id: formData.teacher_id,
        per_student_teacher_fee: parseFloat(formData.per_student_teacher_fee)
      };

      if (editingCamp) {
        await apiClient.put(`/camps/${editingCamp.id}`, payload);
        toast.success('Kamp güncellendi');
      } else {
        await apiClient.post('/camps', payload);
        toast.success('Kamp oluşturuldu');
      }
      
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('İşlem başarısız');
    }
  };

  const handleComplete = async (campId) => {
    if (!window.confirm('Bu kampı tamamlandı olarak işaretlemek istediğinize emin misiniz?')) {
      return;
    }

    try {
      await apiClient.put(`/camps/${campId}/complete`);
      toast.success('Kamp tamamlandı olarak işaretlendi');
      fetchData();
    } catch (error) {
      toast.error('İşlem başarısız');
    }
  };

  const handleDelete = async (campId) => {
    if (!window.confirm('Bu kampı silmek istediğinize emin misiniz?')) {
      return;
    }

    try {
      await apiClient.delete(`/camps/${campId}`);
      toast.success('Kamp silindi');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Silme işlemi başarısız');
    }
  };

  const getStatusBadge = (status) => {
    if (status === 'completed') {
      return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700">Tamamlandı</span>;
    }
    return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700">Aktif</span>;
  };

  return (
    <AdminLayout>
      <div>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 lg:mb-8">
          <div>
            <h1 className="page-title" data-testid="admin-camps-title">
              Kamplar
            </h1>
            <p className="page-subtitle mt-1">Kamp organizasyonlarını yönetin</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()} className="admin-btn w-full sm:w-auto" data-testid="new-camp-btn">
                <Plus size={20} className="mr-2" />
                Yeni Kamp
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[calc(100%-2rem)] sm:max-w-lg mx-auto max-h-[85vh] overflow-y-auto rounded-xl">
              <DialogHeader>
                <DialogTitle className="text-lg">{editingCamp ? 'Kamp Düzenle' : 'Yeni Kamp Oluştur'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pb-2">
                <div className="space-y-2">
                  <Label>Kamp Adı *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Örn: Yaz Matematik Kampı"
                    className="h-12"
                    data-testid="camp-name-input"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Kamp Sınıfı *</Label>
                  <Select value={formData.class_level} onValueChange={(value) => setFormData({ ...formData, class_level: value })}>
                    <SelectTrigger className="h-12" data-testid="camp-level-select">
                      <SelectValue placeholder="Sınıf seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5. Sınıf</SelectItem>
                      <SelectItem value="6">6. Sınıf</SelectItem>
                      <SelectItem value="7">7. Sınıf</SelectItem>
                      <SelectItem value="8">8. Sınıf</SelectItem>
                      <SelectItem value="Karma">Karma</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Öğretmen *</Label>
                  <Select value={formData.teacher_id} onValueChange={(value) => setFormData({ ...formData, teacher_id: value })}>
                    <SelectTrigger className="h-12" data-testid="camp-teacher-select">
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
                  <Label>Öğretmene Öğrenci Başı Ücret (₺) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.per_student_teacher_fee}
                    onChange={(e) => setFormData({ ...formData, per_student_teacher_fee: e.target.value })}
                    placeholder="150"
                    className="h-12"
                    data-testid="camp-fee-input"
                  />
                  <p className="text-xs text-slate-500">Kesin kayıtlı her öğrenci için öğretmene verilecek tutar</p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-4">
                  <Button variant="outline" onClick={() => setDialogOpen(false)} className="h-12">İptal</Button>
                  <Button onClick={handleSave} className="h-12" data-testid="save-camp-btn">
                    {editingCamp ? 'Güncelle' : 'Oluştur'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filter */}
        <div className="admin-card p-4 mb-4 lg:mb-6">
          <div className="flex items-center gap-3 lg:gap-4">
            <Filter size={18} className="text-slate-500" />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)}
                className="rounded w-5 h-5"
              />
              <span className="text-sm text-slate-600">Tamamlanan kampları göster</span>
            </label>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-slate-600">Yükleniyor...</p>
          </div>
        ) : camps.length === 0 ? (
          <div className="admin-card p-8 lg:p-12 text-center">
            <Users size={48} className="mx-auto mb-4 text-slate-400" />
            <p className="text-slate-600 text-lg">Henüz kamp oluşturulmamış</p>
          </div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="lg:hidden space-y-3">
              {camps.map((camp) => (
                <div 
                  key={camp.id} 
                  className="admin-card p-4"
                  data-testid={`camp-row-${camp.id}`}
                >
                  <div 
                    className="flex items-start justify-between mb-3 cursor-pointer"
                    onClick={() => navigate(`/admin/camps/${camp.id}/students`)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-slate-800 truncate">{camp.name}</h3>
                        {getStatusBadge(camp.status)}
                      </div>
                      <p className="text-sm text-slate-600">{camp.class_level}. Sınıf • {camp.teacher_name}</p>
                      <p className="text-sm text-slate-500 mt-1">{camp.per_student_teacher_fee} ₺/öğrenci</p>
                    </div>
                    <ChevronRight size={20} className="text-slate-400 shrink-0 mt-1" />
                  </div>
                  
                  {/* Stats Row */}
                  <div className="flex items-center gap-4 text-sm mb-3 py-2 border-t border-b border-slate-100">
                    <div>
                      <span className="text-slate-500">Toplam: </span>
                      <span className="font-semibold">{camp.total_participants}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Kesin: </span>
                      <span className="font-semibold text-blue-600">{camp.confirmed_count}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Ödemeli: </span>
                      <span className="font-semibold text-green-600">{camp.paid_count}</span>
                    </div>
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/admin/camps/${camp.id}/students`)}
                      className="flex-1 h-10"
                    >
                      <Eye size={16} className="mr-1" />
                      Katılımcılar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenDialog(camp)}
                      className="h-10 px-3"
                    >
                      <Edit size={16} />
                    </Button>
                    {camp.status === 'active' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleComplete(camp.id)}
                        className="h-10 px-3 text-green-600"
                      >
                        <CheckCircle size={16} />
                      </Button>
                    )}
                    {camp.total_participants === 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(camp.id)}
                        className="h-10 px-3 text-red-600"
                      >
                        <Trash2 size={16} />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block admin-card overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left py-4 px-4 font-semibold text-slate-700">Kamp Adı</th>
                    <th className="text-left py-4 px-4 font-semibold text-slate-700">Sınıf</th>
                    <th className="text-left py-4 px-4 font-semibold text-slate-700">Öğretmen</th>
                    <th className="text-center py-4 px-4 font-semibold text-slate-700">Öğr. Başı</th>
                    <th className="text-center py-4 px-4 font-semibold text-slate-700">Toplam</th>
                    <th className="text-center py-4 px-4 font-semibold text-slate-700">Kesin</th>
                    <th className="text-center py-4 px-4 font-semibold text-slate-700">Ödemeli</th>
                    <th className="text-center py-4 px-4 font-semibold text-slate-700">Durum</th>
                    <th className="text-right py-4 px-4 font-semibold text-slate-700">İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {camps.map((camp) => (
                    <tr key={camp.id} className="border-t hover:bg-slate-50">
                      <td className="py-4 px-4 font-medium text-slate-800">{camp.name}</td>
                      <td className="py-4 px-4 text-slate-600">{camp.class_level}. Sınıf</td>
                      <td className="py-4 px-4 text-slate-600">{camp.teacher_name}</td>
                      <td className="py-4 px-4 text-center text-slate-600">{camp.per_student_teacher_fee} ₺</td>
                      <td className="py-4 px-4 text-center font-semibold text-slate-800">{camp.total_participants}</td>
                      <td className="py-4 px-4 text-center font-semibold text-blue-600">{camp.confirmed_count}</td>
                      <td className="py-4 px-4 text-center font-semibold text-green-600">{camp.paid_count}</td>
                      <td className="py-4 px-4 text-center">{getStatusBadge(camp.status)}</td>
                      <td className="py-4 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/admin/camps/${camp.id}/students`)}
                          >
                            <Eye size={16} className="mr-1" />
                            Katılımcılar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenDialog(camp)}
                          >
                            <Edit size={16} />
                          </Button>
                          {camp.status === 'active' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleComplete(camp.id)}
                              className="text-green-600 hover:bg-green-50"
                            >
                              <CheckCircle size={16} className="mr-1" />
                              Tamamla
                            </Button>
                          )}
                          {camp.total_participants === 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(camp.id)}
                              className="text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={16} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminCamps;
