import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layouts/AdminLayout';
import apiClient from '../../api/axios';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { toast } from 'sonner';
import { Pencil, Trash2, Plus, X, Eye, EyeOff, Users } from 'lucide-react';

const AdminUserForm = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    user_type: 'teacher',
    teacher_id: '',
    linked_student_ids: []
  });
  const [submitting, setSubmitting] = useState(false);
  const [veliEnabled, setVeliEnabled] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, teachersRes, studentsRes] = await Promise.all([
        apiClient.get('/users'),
        apiClient.get('/teachers'),
        apiClient.get('/students')
      ]);
      setUsers(usersRes.data);
      setTeachers(teachersRes.data);
      setStudents(studentsRes.data);
    } catch (error) {
      toast.error('Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
    try {
      const r = await apiClient.get('/system-settings/veli-status');
      setVeliEnabled(!!r.data.enabled);
    } catch (e) { /* veli durumu alınamazsa gizli kalır */ }
  };

  const resetForm = () => {
    setFormData({
      username: '',
      password: '',
      user_type: 'teacher',
      teacher_id: '',
      linked_student_ids: []
    });
    setEditingUser(null);
    setShowForm(false);
    setShowPassword(false);
    setStudentSearch('');
  };

  const toggleLinkedStudent = (studentId) => {
    setFormData(prev => ({
      ...prev,
      linked_student_ids: prev.linked_student_ids.includes(studentId)
        ? prev.linked_student_ids.filter(id => id !== studentId)
        : [...prev.linked_student_ids, studentId]
    }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();

    if (formData.user_type === 'parent' && formData.linked_student_ids.length === 0) {
      toast.error('Veli için en az bir öğrenci seçmelisiniz');
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        username: formData.username,
        password: formData.password,
        user_type: formData.user_type,
      };
      if (formData.user_type === 'teacher') payload.teacher_id = formData.teacher_id || null;
      if (formData.user_type === 'parent') payload.linked_student_ids = formData.linked_student_ids;

      await apiClient.post('/auth/register', payload);
      toast.success('Kullanıcı oluşturuldu');
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Kullanıcı oluşturulamadı');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const updateData = {
        username: formData.username,
        user_type: formData.user_type
      };
      
      // Şifre sadece girilmişse gönder
      if (formData.password) {
        updateData.password = formData.password;
      }

      await apiClient.put(`/users/${editingUser.username}`, updateData);
      toast.success('Kullanıcı güncellendi');
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Güncelleme başarısız');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (username) => {
    if (!window.confirm(`"${username}" kullanıcısını silmek istediğinize emin misiniz?`)) {
      return;
    }

    try {
      await apiClient.delete(`/users/${username}`);
      toast.success('Kullanıcı silindi');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Silme başarısız');
    }
  };

  const startEdit = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: '',
      user_type: user.user_type,
      teacher_id: user.teacher_id || '',
      linked_student_ids: user.linked_student_ids || []
    });
    setShowForm(true);
    setShowPassword(false);
  };

  const getTeacherName = (teacherId) => {
    const teacher = teachers.find(t => t.id === teacherId);
    return teacher ? teacher.name : '-';
  };

  const getStudentName = (studentId) => {
    const s = students.find(st => st.id === studentId);
    return s ? s.name : studentId;
  };

  const roleLabel = (ut) => ut === 'admin' ? 'Admin' : ut === 'parent' ? 'Veli' : 'Öğretmen';
  const roleBadgeClass = (ut) => ut === 'admin'
    ? 'bg-purple-100 text-purple-700'
    : ut === 'parent'
    ? 'bg-indigo-100 text-indigo-700'
    : 'bg-blue-100 text-blue-700';

  const filteredStudents = students.filter(s =>
    !studentSearch.trim() ||
    (s.name || '').toLowerCase().includes(studentSearch.toLowerCase()) ||
    (s.parent_name || '').toLowerCase().includes(studentSearch.toLowerCase())
  );

  if (loading) {
    return (
      <AdminLayout>
        <div className="text-center py-12">Yükleniyor...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div>
        {/* Header */}
        <div className="mb-6 lg:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="page-title" data-testid="user-management-title">
              Kullanıcı Yönetimi
            </h1>
            <p className="page-subtitle mt-1">Sistem kullanıcılarını yönetin</p>
          </div>
          
          {!showForm && (
            <Button
              onClick={() => setShowForm(true)}
              className="admin-btn"
              data-testid="add-user-btn"
            >
              <Plus size={18} className="mr-2" />
              Yeni Kullanıcı
            </Button>
          )}
        </div>

        {/* Form */}
        {showForm && (
          <div className="admin-card p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-800">
                {editingUser ? 'Kullanıcı Düzenle' : 'Yeni Kullanıcı Ekle'}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetForm}
                data-testid="close-form-btn"
              >
                <X size={20} />
              </Button>
            </div>

            <form onSubmit={editingUser ? handleUpdate : handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Kullanıcı Adı *</Label>
                  <Input
                    id="username"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    required
                    data-testid="username-input"
                    placeholder="Kullanıcı adı girin"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">
                    {editingUser ? 'Yeni Şifre (boş bırakılırsa değişmez)' : 'Şifre *'}
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required={!editingUser}
                      data-testid="password-input"
                      placeholder={editingUser ? '••••••••' : 'Şifre girin'}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="user_type">Kullanıcı Tipi *</Label>
                  <Select 
                    value={formData.user_type} 
                    onValueChange={(value) => setFormData({ ...formData, user_type: value })}
                  >
                    <SelectTrigger data-testid="user-type-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="teacher">Öğretmen</SelectItem>
                      {veliEnabled && <SelectItem value="parent">Veli</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>

                {formData.user_type === 'teacher' && !editingUser && (
                  <div className="space-y-2">
                    <Label htmlFor="teacher_id">Bağlı Öğretmen</Label>
                    <Select 
                      value={formData.teacher_id || "none"} 
                      onValueChange={(value) => setFormData({ ...formData, teacher_id: value === "none" ? "" : value })}
                    >
                      <SelectTrigger data-testid="teacher-select">
                        <SelectValue placeholder="Öğretmen seçin (opsiyonel)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Seçilmedi</SelectItem>
                        {teachers.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Veli için öğrenci seçimi */}
              {formData.user_type === 'parent' && !editingUser && (
                <div className="space-y-2" data-testid="parent-student-multiselect">
                  <Label>Öğrenci Seç * (birden fazla seçilebilir)</Label>
                  <Input
                    placeholder="Öğrenci veya veli adı ara..."
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className="mb-2"
                    data-testid="parent-student-search"
                  />
                  <div className="border border-slate-200 rounded-lg max-h-60 overflow-y-auto divide-y divide-slate-100">
                    {filteredStudents.length === 0 ? (
                      <p className="p-3 text-sm text-slate-500 text-center">Öğrenci bulunamadı</p>
                    ) : (
                      filteredStudents.map(s => (
                        <label
                          key={s.id}
                          className="flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer"
                          data-testid={`parent-student-item-${s.id}`}
                        >
                          <input
                            type="checkbox"
                            checked={formData.linked_student_ids.includes(s.id)}
                            onChange={() => toggleLinkedStudent(s.id)}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{s.name}</p>
                            {s.parent_name && <p className="text-xs text-slate-500 truncate">Veli: {s.parent_name}</p>}
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                  <p className="text-xs text-slate-500">{formData.linked_student_ids.length} öğrenci seçildi</p>
                </div>
              )}

              {editingUser && formData.user_type === 'parent' && (
                <div className="p-4 bg-indigo-50 rounded-lg">
                  <p className="text-sm text-indigo-700">
                    Bağlı öğrenciler: {(formData.linked_student_ids || []).map(getStudentName).join(', ') || '-'}
                    <br />Bağlı öğrencileri değiştirmek için kullanıcıyı silip yeniden oluşturun.
                  </p>
                </div>
              )}

              {formData.user_type === 'teacher' && !editingUser && (
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-700">
                    Not: Öğretmen kullanıcısı oluşturmadan önce öğretmen kaydının oluşturulmuş olması gerekir.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={submitting}
                  data-testid="save-user-btn"
                  className="admin-btn"
                >
                  {submitting ? 'Kaydediliyor...' : (editingUser ? 'Güncelle' : 'Kullanıcı Oluştur')}
                </Button>
                <Button
                  type="button"
                  onClick={resetForm}
                  variant="outline"
                  data-testid="cancel-btn"
                >
                  İptal
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* User List */}
        <div className="admin-card overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center gap-2">
              <Users size={20} className="text-slate-600" />
              <h2 className="font-semibold text-slate-800">Kullanıcılar ({users.length})</h2>
            </div>
          </div>

          {users.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              Henüz kullanıcı bulunmuyor
            </div>
          ) : (
            <>
              {/* Mobile View */}
              <div className="lg:hidden divide-y divide-slate-100">
                {users.map((user) => (
                  <div key={user.username} className="p-4" data-testid={`user-row-${user.username}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-slate-800">{user.username}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${roleBadgeClass(user.user_type)}`}>
                            {roleLabel(user.user_type)}
                          </span>
                          {user.teacher_id && (
                            <span className="text-xs text-slate-500">
                              {getTeacherName(user.teacher_id)}
                            </span>
                          )}
                          {user.user_type === 'parent' && user.linked_student_ids?.length > 0 && (
                            <span className="text-xs text-slate-500 truncate">
                              {user.linked_student_ids.map(getStudentName).join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEdit(user)}
                          data-testid={`edit-user-${user.username}`}
                        >
                          <Pencil size={16} className="text-blue-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(user.username)}
                          data-testid={`delete-user-${user.username}`}
                        >
                          <Trash2 size={16} className="text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop View */}
              <div className="hidden lg:block">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700">Kullanıcı Adı</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700">Tip</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700">Bağlı Öğretmen / Öğrenci</th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-700">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((user) => (
                      <tr key={user.username} className="hover:bg-slate-50" data-testid={`user-row-${user.username}`}>
                        <td className="py-3 px-4 font-medium text-slate-800">{user.username}</td>
                        <td className="py-3 px-4">
                          <span className={`text-xs px-2 py-1 rounded-full ${roleBadgeClass(user.user_type)}`}>
                            {roleLabel(user.user_type)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {user.user_type === 'parent'
                            ? (user.linked_student_ids?.map(getStudentName).join(', ') || '-')
                            : (user.teacher_id ? getTeacherName(user.teacher_id) : '-')}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEdit(user)}
                              data-testid={`edit-user-${user.username}`}
                            >
                              <Pencil size={16} className="text-blue-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(user.username)}
                              data-testid={`delete-user-${user.username}`}
                            >
                              <Trash2 size={16} className="text-red-600" />
                            </Button>
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
      </div>
    </AdminLayout>
  );
};

export default AdminUserForm;
