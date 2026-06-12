import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AdminLayout from '../../components/layouts/AdminLayout';
import apiClient from '../../api/axios';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { toast } from 'sonner';
import { Plus, X, Users, AlertTriangle, Edit, Calendar, TrendingUp } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '../../components/ui/dialog';
import { Checkbox } from '../../components/ui/checkbox';

const AdminStudentForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [formData, setFormData] = useState({
    name: '',
    parent_name: '',
    phone: '',
    level: '',
    payment_freq: '1',
    notes: '',
    bank_account_id: '',
    is_risky: false
  });

  const [bankAccounts, setBankAccounts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [branchTeachers, setBranchTeachers] = useState([]); // Branşa göre filtrelenmiş öğretmenler
  const [lessonTypes, setLessonTypes] = useState([]);
  const [groups, setGroups] = useState([]);
  const [studentGroups, setStudentGroups] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [courseDialogOpen, setCourseDialogOpen] = useState(false);
  const [priceUpdateDialogOpen, setPriceUpdateDialogOpen] = useState(false);
  const [selectedCourseForPriceUpdate, setSelectedCourseForPriceUpdate] = useState(null);
  const [priceUpdateData, setPriceUpdateData] = useState({
    price: '',
    valid_from: new Date().toISOString().split('T')[0]
  });
  const [priceHistory, setPriceHistory] = useState([]);
  const [newCourse, setNewCourse] = useState({
    teacher_id: '',
    branch_id: '',
    lesson_type_id: '',
    price: '',
    group_id: ''
  });

  useEffect(() => {
    fetchReferenceData();
    if (isEdit) {
      fetchStudent();
      fetchCourses();
      fetchStudentGroups();
    }
  }, [id]);

  // Sınıf değerini normalize et ("5. Sınıf" -> "5", "6. snıf" -> "6", vb.)
  const normalizeLevel = (level) => {
    if (!level) return '';
    const match = level.toString().match(/^(\d+)/);
    return match ? match[1] : level;
  };

  const fetchStudent = async () => {
    try {
      const response = await apiClient.get(`/students/${id}`);
      setFormData({
        name: response.data.name,
        parent_name: response.data.parent_name,
        phone: response.data.phone,
        level: normalizeLevel(response.data.level),
        payment_freq: response.data.payment_freq,
        notes: response.data.notes || '',
        bank_account_id: response.data.bank_account_id || '',
        is_risky: response.data.is_risky || false
      });
    } catch (error) {
      toast.error('Öğrenci bilgileri yüklenemedi');
    }
  };

  const fetchReferenceData = async () => {
    try {
      const [banksRes, branchesRes, teachersRes, typesRes, groupsRes] = await Promise.all([
        apiClient.get('/bank-accounts'),
        apiClient.get('/branches'),
        apiClient.get('/teachers'),
        apiClient.get('/lesson-types'),
        apiClient.get('/student-groups')
      ]);
      setBankAccounts(banksRes.data);
      setBranches(branchesRes.data);
      setTeachers(teachersRes.data.filter(t => t.status === 'active'));
      setLessonTypes(typesRes.data);
      setGroups(groupsRes.data);
    } catch (error) {
      toast.error('Referans veriler yüklenemedi');
    }
  };

  const fetchCourses = async () => {
    try {
      const response = await apiClient.get(`/student-courses?student_id=${id}`);
      setCourses(response.data);
    } catch (error) {
      console.error('Error fetching courses:', error);
    }
  };

  const fetchStudentGroups = async () => {
    try {
      const response = await apiClient.get(`/student-groups/by-student/${id}`);
      setStudentGroups(response.data);
    } catch (error) {
      console.error('Error fetching student groups:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isEdit) {
        await apiClient.put(`/students/${id}`, formData);
        toast.success('Öğrenci güncellendi');
      } else {
        const response = await apiClient.post('/students', formData);
        const studentId = response.data.id;
        
        // Add courses if any
        for (const course of courses) {
          await apiClient.post('/student-courses', {
            student_id: studentId,
            teacher_id: course.teacher_id,
            branch_id: course.branch_id,
            lesson_type_id: course.lesson_type_id,
            price: course.price
          });
          
          // If group lesson, add student to group
          if (course.group_id) {
            await apiClient.post(`/student-groups/${course.group_id}/add-student?student_id=${studentId}`);
          }
        }
        
        toast.success('Öğrenci eklendi');
      }
      navigate('/admin/students');
    } catch (error) {
      toast.error(isEdit ? 'Güncelleme başarısız' : 'Ekleme başarısız');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCourse = async () => {
    const selectedLessonType = lessonTypes.find(lt => lt.id === newCourse.lesson_type_id);
    const isGroupLesson = selectedLessonType?.name === 'Grup';
    
    if (!newCourse.teacher_id || !newCourse.branch_id || !newCourse.lesson_type_id || !newCourse.price) {
      toast.error('Tüm alanları doldurun');
      return;
    }
    
    if (isGroupLesson && !newCourse.group_id) {
      toast.error('Grup dersi için grup seçin');
      return;
    }

    if (isEdit) {
      // Mevcut öğrenci için direkt API'ye kaydet
      try {
        await apiClient.post('/student-courses', {
          student_id: id,
          teacher_id: newCourse.teacher_id,
          branch_id: newCourse.branch_id,
          lesson_type_id: newCourse.lesson_type_id,
          price: parseFloat(newCourse.price)
        });
        
        // If group lesson, add student to group
        if (newCourse.group_id) {
          await apiClient.post(`/student-groups/${newCourse.group_id}/add-student?student_id=${id}`);
        }
        
        toast.success('Ders eklendi');
        fetchCourses();
        fetchStudentGroups();
      } catch (error) {
        toast.error('Ders eklenemedi');
      }
    } else {
      // Yeni öğrenci için listeye ekle
      setCourses([...courses, { 
        ...newCourse, 
        price: parseFloat(newCourse.price),
        _tempId: Date.now() 
      }]);
      toast.success('Ders eklendi');
    }
    
    setNewCourse({ teacher_id: '', branch_id: '', lesson_type_id: '', price: '', group_id: '' });
    setCourseDialogOpen(false);
  };

  const handleRemoveCourse = async (course, index) => {
    if (isEdit && course.id) {
      try {
        await apiClient.delete(`/student-courses/${course.id}`);
        toast.success('Dersten ayrıldı');
        fetchCourses();
      } catch (error) {
        toast.error('İşlem başarısız');
      }
    } else {
      setCourses(courses.filter((_, i) => i !== index));
    }
  };

  const handleLeaveGroup = async (groupId) => {
    try {
      await apiClient.post(`/student-groups/${groupId}/remove-student?student_id=${id}`);
      toast.success('Gruptan ayrıldı');
      fetchStudentGroups();
    } catch (error) {
      toast.error('İşlem başarısız');
    }
  };

  // Fiyat güncelleme dialog'unu aç
  const openPriceUpdateDialog = async (course) => {
    setSelectedCourseForPriceUpdate(course);
    setPriceUpdateData({
      price: course.student_price || course.price || '',
      valid_from: new Date().toISOString().split('T')[0]
    });
    
    // Fiyat geçmişini getir
    try {
      const response = await apiClient.get(`/student-price-history/${id}?branch_id=${course.branch_id}`);
      setPriceHistory(response.data);
    } catch (error) {
      setPriceHistory([]);
    }
    
    setPriceUpdateDialogOpen(true);
  };

  // Fiyat güncelle
  const handlePriceUpdate = async () => {
    if (!priceUpdateData.price || !priceUpdateData.valid_from) {
      toast.error('Fiyat ve geçerlilik tarihi zorunludur');
      return;
    }

    try {
      // Grup mu birebir mi belirle
      const lessonType = selectedCourseForPriceUpdate.group_id ? 'group' : 'birebir';
      
      // Fiyat geçmişine ekle
      await apiClient.post('/student-price-history', {
        student_id: id,
        branch_id: selectedCourseForPriceUpdate.branch_id,
        lesson_type: lessonType,
        price: parseFloat(priceUpdateData.price),
        valid_from: priceUpdateData.valid_from
      });

      toast.success('Fiyat güncellendi. Bu tarihten itibaren yeni fiyat uygulanacak.');
      setPriceUpdateDialogOpen(false);
      fetchCourses();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Fiyat güncellenemedi');
    }
  };

  // Branş seçildiğinde o branşa atanmış öğretmenleri getir
  const fetchBranchTeachers = async (branchId) => {
    if (!branchId) {
      setBranchTeachers([]);
      return;
    }
    try {
      const response = await apiClient.get(`/branches/${branchId}/teachers`);
      setBranchTeachers(response.data);
    } catch (error) {
      console.error('Error fetching branch teachers:', error);
      setBranchTeachers([]);
    }
  };

  // Branş değiştiğinde öğretmenleri güncelle
  const handleBranchChange = (branchId) => {
    setNewCourse({ ...newCourse, branch_id: branchId, teacher_id: '', group_id: '' });
    fetchBranchTeachers(branchId);
  };

  // Filter groups based on selected teacher and branch
  const filteredGroups = groups.filter(g => 
    g.teacher_id === newCourse.teacher_id && 
    g.branch_id === newCourse.branch_id
  );

  const selectedLessonType = lessonTypes.find(lt => lt.id === newCourse.lesson_type_id);
  const isGroupLesson = selectedLessonType?.name === 'Grup';

  return (
    <AdminLayout>
      <div className="max-w-4xl">
        <div className="mb-8">
          <h1 className="text-4xl font-extrabold text-slate-800 mb-2" data-testid="student-form-title">
            {isEdit ? 'Öğrenci Düzenle' : 'Yeni Öğrenci Ekle'}
          </h1>
          <p className="text-slate-600">Öğrenci bilgilerini girin</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="admin-card p-8 space-y-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Temel Bilgiler</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="name">Öğrenci Adı *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  data-testid="student-name-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="parent_name">Veli Adı *</Label>
                <Input
                  id="parent_name"
                  value={formData.parent_name}
                  onChange={(e) => setFormData({ ...formData, parent_name: e.target.value })}
                  required
                  data-testid="parent-name-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Telefon *</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                  data-testid="phone-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="level">Sınıf *</Label>
                <Select value={formData.level} onValueChange={(value) => setFormData({ ...formData, level: value })}>
                  <SelectTrigger data-testid="level-select">
                    <SelectValue placeholder="Sınıf seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5. Sınıf</SelectItem>
                    <SelectItem value="6">6. Sınıf</SelectItem>
                    <SelectItem value="7">7. Sınıf</SelectItem>
                    <SelectItem value="8">8. Sınıf</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment_freq">Ödeme Günü *</Label>
                <Input
                  id="payment_freq"
                  type="number"
                  value={formData.payment_freq}
                  onChange={(e) => setFormData({ ...formData, payment_freq: e.target.value })}
                  placeholder="Örn: 1, 15"
                  required
                  data-testid="payment-freq-input"
                />
                <p className="text-xs text-slate-500">Ayın kaçında ödeme yapacak (1-31 arası)</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bank_account_id">Banka Hesabı</Label>
                <Select
                  value={formData.bank_account_id}
                  onValueChange={(value) => setFormData({ ...formData, bank_account_id: value })}
                >
                  <SelectTrigger data-testid="bank-account-select">
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
                <Label className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-red-500" />
                  Risk Durumu
                </Label>
                <label 
                  htmlFor="is_risky"
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    formData.is_risky ? 'bg-red-50 border-red-300' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Checkbox
                    id="is_risky"
                    checked={formData.is_risky}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_risky: !!checked }))}
                    data-testid="is-risky-checkbox"
                  />
                  <div>
                    <span className="font-medium text-slate-800">
                      Riskli Öğrenci
                    </span>
                    <p className="text-xs text-slate-500">
                      Aylık programda kırmızı ile işaretlenir
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notlar</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={4}
                data-testid="notes-input"
              />
            </div>
          </div>

          {/* Dahil Olduğu Gruplar - Sadece düzenleme modunda */}
          {isEdit && studentGroups.length > 0 && (
            <div className="admin-card p-8">
              <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Users size={20} />
                Dahil Olduğu Gruplar
              </h2>
              <div className="space-y-3">
                {studentGroups.map((group) => {
                  const branch = branches.find(b => b.id === group.branch_id);
                  const teacher = teachers.find(t => t.id === group.teacher_id);
                  return (
                    <div key={group.id} className="flex items-center justify-between p-4 bg-purple-50 rounded-lg border border-purple-200">
                      <div>
                        <p className="font-semibold text-slate-800">{group.name}</p>
                        <p className="text-sm text-slate-600">
                          {branch?.name} • {teacher?.name} • {group.level}. Sınıf
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleLeaveGroup(group.id)}
                        className="text-red-600 hover:bg-red-50"
                      >
                        Gruptan Ayrıl
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Aldığı Dersler */}
          <div className="admin-card p-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-800">
                {isEdit ? 'Aldığı Dersler' : 'Alacağı Dersler'}
              </h2>
              <Dialog open={courseDialogOpen} onOpenChange={setCourseDialogOpen}>
                <DialogTrigger asChild>
                  <Button type="button" variant="outline" data-testid="add-course-btn">
                    <Plus size={16} className="mr-2" />
                    Ders Ekle
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Yeni Ders Ekle</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Branş *</Label>
                      <Select 
                        value={newCourse.branch_id} 
                        onValueChange={handleBranchChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Önce branş seçin" />
                        </SelectTrigger>
                        <SelectContent>
                          {branches.map((branch) => (
                            <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Öğretmen *</Label>
                      <Select 
                        value={newCourse.teacher_id} 
                        onValueChange={(value) => setNewCourse({ ...newCourse, teacher_id: value, group_id: '' })}
                        disabled={!newCourse.branch_id}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={newCourse.branch_id ? "Öğretmen seçin" : "Önce branş seçin"} />
                        </SelectTrigger>
                        <SelectContent>
                          {branchTeachers.length > 0 ? (
                            branchTeachers.map((teacher) => (
                              <SelectItem key={teacher.id} value={teacher.id}>{teacher.name}</SelectItem>
                            ))
                          ) : (
                            <div className="p-2 text-sm text-slate-500 text-center">
                              Bu branşa atanmış öğretmen yok
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                      {newCourse.branch_id && branchTeachers.length === 0 && (
                        <p className="text-xs text-orange-600">
                          Bu branşa atanmış aktif öğretmen bulunamadı. Önce Öğretmenler sayfasından bu branş için öğretmen tanımlayın.
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Ders Tipi *</Label>
                      <Select 
                        value={newCourse.lesson_type_id} 
                        onValueChange={(value) => setNewCourse({ ...newCourse, lesson_type_id: value, group_id: '' })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Ders tipi seçin" />
                        </SelectTrigger>
                        <SelectContent>
                          {lessonTypes.map((type) => (
                            <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Grup seçimi - sadece "Grup" tipi seçildiğinde */}
                    {isGroupLesson && newCourse.teacher_id && newCourse.branch_id && (
                      <div className="space-y-2">
                        <Label>Grup Seçin *</Label>
                        <Select 
                          value={newCourse.group_id} 
                          onValueChange={(value) => setNewCourse({ ...newCourse, group_id: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Grup seçin" />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredGroups.length > 0 ? (
                              filteredGroups.map((group) => (
                                <SelectItem key={group.id} value={group.id}>
                                  {group.name} ({group.level}. Sınıf - {group.student_ids?.length || 0} öğrenci)
                                </SelectItem>
                              ))
                            ) : (
                              <div className="p-2 text-sm text-slate-500">
                                Bu öğretmen ve branş için grup bulunamadı
                              </div>
                            )}
                          </SelectContent>
                        </Select>
                        {filteredGroups.length === 0 && (
                          <p className="text-xs text-orange-600">
                            Önce Gruplar sayfasından bu öğretmen ve branş için grup oluşturun
                          </p>
                        )}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Ders Ücreti (₺) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={newCourse.price}
                        onChange={(e) => setNewCourse({ ...newCourse, price: e.target.value })}
                        placeholder="250"
                      />
                    </div>

                    <div className="flex gap-3">
                      <Button type="button" onClick={handleAddCourse} className="flex-1">Ekle</Button>
                      <Button type="button" variant="outline" onClick={() => setCourseDialogOpen(false)}>İptal</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            
            {courses.length > 0 ? (
              <div className="space-y-3">
                {courses.map((course, index) => {
                  const branch = branches.find(b => b.id === course.branch_id);
                  const teacher = teachers.find(t => t.id === course.teacher_id);
                  const lessonType = lessonTypes.find(lt => lt.id === course.lesson_type_id);
                  const group = course.group_id ? groups.find(g => g.id === course.group_id) : null;
                  
                  return (
                    <div key={course.id || course._tempId || index} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                      <div>
                        <p className="font-semibold text-slate-800">{branch?.name}</p>
                        <p className="text-sm text-slate-600">
                          {teacher?.name} • {lessonType?.name} • <span className="font-medium text-green-700">{course.student_price || course.price} ₺</span>
                          {group && <span className="text-purple-600"> • Grup: {group.name}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isEdit && course.id && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openPriceUpdateDialog(course)}
                            className="text-blue-600 hover:bg-blue-50"
                            data-testid={`update-price-${index}`}
                          >
                            <Edit size={14} className="mr-1" />
                            Fiyat Güncelle
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRemoveCourse(course, index)}
                          data-testid={`remove-course-${index}`}
                        >
                          <X size={16} className="mr-1" />
                          {isEdit ? 'Dersten Ayrıl' : 'Kaldır'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-slate-600 text-center py-8">
                {isEdit ? 'Henüz ders kaydı yok.' : 'Henüz ders eklenmemiş.'} Yukarıdaki butonu kullanarak ders ekleyin.
              </p>
            )}
          </div>

          {/* Fiyat Güncelleme Dialog */}
          <Dialog open={priceUpdateDialogOpen} onOpenChange={setPriceUpdateDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <TrendingUp size={20} className="text-green-600" />
                  Öğrenci Ders Fiyatı Güncelle
                </DialogTitle>
                <DialogDescription>
                  {selectedCourseForPriceUpdate && (
                    <span>
                      {branches.find(b => b.id === selectedCourseForPriceUpdate.branch_id)?.name} - 
                      Mevcut fiyat: <strong>{selectedCourseForPriceUpdate.student_price || selectedCourseForPriceUpdate.price} ₺</strong>
                    </span>
                  )}
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="new-price">Yeni Fiyat (₺) *</Label>
                  <Input
                    id="new-price"
                    type="number"
                    step="0.01"
                    value={priceUpdateData.price}
                    onChange={(e) => setPriceUpdateData({...priceUpdateData, price: e.target.value})}
                    placeholder="Yeni ders ücreti"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="valid-from" className="flex items-center gap-2">
                    <Calendar size={16} />
                    Geçerlilik Başlangıç Tarihi *
                  </Label>
                  <Input
                    id="valid-from"
                    type="date"
                    value={priceUpdateData.valid_from}
                    onChange={(e) => setPriceUpdateData({...priceUpdateData, valid_from: e.target.value})}
                  />
                  <p className="text-xs text-gray-500">
                    Bu tarihten önce alınan dersler eski fiyattan, sonra alınan dersler yeni fiyattan hesaplanacak.
                  </p>
                </div>

                {/* Fiyat Geçmişi */}
                {priceHistory.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm font-medium text-gray-700 mb-2">Fiyat Geçmişi</p>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {priceHistory.map((ph, idx) => (
                        <div key={idx} className="text-xs flex justify-between bg-gray-50 p-2 rounded">
                          <span>{new Date(ph.valid_from).toLocaleDateString('tr-TR')} - {ph.valid_to ? new Date(ph.valid_to).toLocaleDateString('tr-TR') : 'Devam ediyor'}</span>
                          <span className="font-medium">{ph.price} ₺</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPriceUpdateDialogOpen(false)}>
                  İptal
                </Button>
                <Button type="button" onClick={handlePriceUpdate} className="bg-green-600 hover:bg-green-700">
                  Fiyatı Güncelle
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="flex items-center gap-4">
            <Button
              type="submit"
              disabled={loading}
              data-testid="save-student-btn"
              className="admin-btn"
            >
              {loading ? 'Kaydediliyor...' : (isEdit ? 'Güncelle' : 'Kaydet')}
            </Button>
            <Button
              type="button"
              onClick={() => navigate('/admin/students')}
              variant="outline"
              data-testid="cancel-btn"
            >
              İptal
            </Button>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
};

export default AdminStudentForm;
