import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layouts/AdminLayout';
import apiClient from '../../api/axios';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { DateInput } from '../../components/ui/date-input';
import { Checkbox } from '../../components/ui/checkbox';
import { toast } from 'sonner';
import { Users, ArrowLeft, Plus, Pencil, Gift, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { formatDateTurkish } from '../../lib/dateUtils';

const AdminGroupLesson = () => {
  const { id: groupId } = useParams();
  const navigate = useNavigate();
  
  const [group, setGroup] = useState(null);
  const [students, setStudents] = useState([]);
  const [branches, setBranches] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDate, setEditingDate] = useState(null);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    number_of_lessons: 2,
    is_free_lesson: false
  });

  useEffect(() => {
    fetchData();
  }, [groupId]);

  const fetchData = async () => {
    try {
      const [groupsRes, studentsRes, branchesRes, lessonsRes, coursesRes] = await Promise.all([
        apiClient.get('/student-groups'),
        apiClient.get('/students'),
        apiClient.get('/branches'),
        apiClient.get('/lessons'),
        apiClient.get('/student-courses')
      ]);
      
      const foundGroup = groupsRes.data.find(g => g.id === groupId);
      
      if (!foundGroup) {
        toast.error('Grup bulunamadı');
        setLoading(false);
        return;
      }
      
      setGroup(foundGroup);
      setStudents(studentsRes.data);
      setBranches(branchesRes.data);
      
      // Filter lessons for this group - ÖNCELİKLE group_id ile filtrele
      let groupLessons = lessonsRes.data.filter(l => l.group_id === groupId);
      
      // Eğer group_id ile ders bulunamadıysa, eski yöntemle dene (geriye dönük uyumluluk)
      if (groupLessons.length === 0) {
        const groupStudentIds = foundGroup.student_ids || [];
        const groupCourseIds = coursesRes.data
          .filter(c => groupStudentIds.includes(c.student_id) && c.branch_id === foundGroup.branch_id)
          .map(c => c.id);
        groupLessons = lessonsRes.data.filter(l => groupCourseIds.includes(l.student_course_id));
      }
      
      // En son tarihli ders en üstte olacak şekilde sırala
      const sortedLessons = groupLessons.sort((a, b) => new Date(b.date) - new Date(a.date));
      setLessons(sortedLessons);
    } catch (error) {
      toast.error('Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleAddLesson = async () => {
    if (!formData.date || !formData.number_of_lessons) {
      toast.error('Tüm alanları doldurun');
      return;
    }

    try {
      const params = new URLSearchParams({
        group_id: groupId,
        branch_id: group.branch_id,
        date: formData.date,
        number_of_lessons: formData.number_of_lessons,
        is_free_lesson: formData.is_free_lesson
      });
      
      await apiClient.post(`/group-lessons?${params.toString()}`);
      
      const message = formData.is_free_lesson 
        ? `Ücretsiz grup dersi eklendi - ${group.student_ids?.length || 0} öğrenciye kaydedildi`
        : `Grup dersi eklendi - ${group.student_ids?.length || 0} öğrenciye kaydedildi`;
      toast.success(message);
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error('Ders eklenemedi');
    }
  };

  const handleUpdateLesson = async () => {
    if (!formData.date || !formData.number_of_lessons) {
      toast.error('Tüm alanları doldurun');
      return;
    }

    try {
      // Eski tarihteki dersleri sil
      const lessonsToDelete = lessons.filter(l => l.date === editingDate);
      for (const lesson of lessonsToDelete) {
        await apiClient.delete(`/lessons/${lesson.id}`);
      }
      
      // Yeni dersleri ekle
      const params = new URLSearchParams({
        group_id: groupId,
        branch_id: group.branch_id,
        date: formData.date,
        number_of_lessons: formData.number_of_lessons,
        is_free_lesson: formData.is_free_lesson
      });
      
      await apiClient.post(`/group-lessons?${params.toString()}`);
      
      toast.success('Ders güncellendi');
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error('Ders güncellenemedi');
    }
  };

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      number_of_lessons: 2,
      is_free_lesson: false
    });
    setEditingDate(null);
  };

  const openAddDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (date, dateLessons) => {
    const firstLesson = dateLessons[0];
    setEditingDate(date);
    setFormData({
      date: date,
      number_of_lessons: firstLesson?.number_of_lessons || 2,
      is_free_lesson: firstLesson?.is_free_lesson || false
    });
    setDialogOpen(true);
  };

  // Belirli tarihteki tüm dersleri sil
  const handleDeleteLessonsByDate = async (date, dateLessons) => {
    if (!window.confirm(`${formatDateTurkish(date)} tarihindeki tüm dersleri silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`)) return;
    
    try {
      for (const lesson of dateLessons) {
        await apiClient.delete(`/lessons/${lesson.id}`);
      }
      toast.success(`${dateLessons.length} öğrencinin dersi silindi`);
      fetchData();
    } catch (error) {
      toast.error('Dersler silinemedi');
    }
  };

  const branch = group ? branches.find(b => b.id === group.branch_id) : null;
  const groupStudentsList = group ? students.filter(s => group.student_ids?.includes(s.id)) : [];

  // Group lessons by date
  const lessonsByDate = lessons.reduce((acc, lesson) => {
    if (!acc[lesson.date]) {
      acc[lesson.date] = [];
    }
    acc[lesson.date].push(lesson);
    return acc;
  }, {});

  // Toplam ders sayısı (benzersiz tarih başına bir kez sayılır)
  const totalLessons = Object.keys(lessonsByDate).reduce((sum, date) => {
    const firstLesson = lessonsByDate[date]?.[0];
    return sum + (firstLesson?.number_of_lessons || 0);
  }, 0);

  // Ücretsiz ders sayısı
  const freeLessonsCount = Object.keys(lessonsByDate).reduce((sum, date) => {
    const firstLesson = lessonsByDate[date]?.[0];
    if (firstLesson?.is_free_lesson) {
      return sum + (firstLesson?.number_of_lessons || 0);
    }
    return sum;
  }, 0);

  if (loading) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-slate-600">Yükleniyor...</p>
        </div>
      </AdminLayout>
    );
  }

  if (!group) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-slate-600">Grup bulunamadı</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/admin/groups')}
            className="mb-4"
          >
            <ArrowLeft size={20} className="mr-2" />
            Geri
          </Button>
          
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center">
              <Users size={32} className="text-purple-600" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-slate-800">{group.name}</h1>
              <p className="text-slate-600">
                {branch?.name} • {group.level}. Sınıf • {groupStudentsList.length} öğrenci
              </p>
            </div>
          </div>
        </div>

        {/* Group Students */}
        <div className="admin-card p-6 mb-6">
          <h2 className="text-lg font-bold text-slate-800 mb-3">Gruptaki Öğrenciler</h2>
          <div className="flex flex-wrap gap-2">
            {groupStudentsList.map(s => (
              <span key={s.id} className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm">
                {s.name}
              </span>
            ))}
          </div>
          <p className="text-sm text-slate-500 mt-3">
            Gruba ders girdiğinizde, yukarıdaki tüm öğrencilere otomatik kaydedilir.
          </p>
        </div>

        {/* Toplam Ders Sayısı */}
        <div className="admin-card p-6 mb-6 bg-blue-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Toplam Ders Sayısı</p>
              <p className="text-3xl font-bold text-blue-600">{totalLessons}</p>
              {freeLessonsCount > 0 && (
                <p className="text-sm text-green-600 flex items-center gap-1 mt-1">
                  <Gift size={14} />
                  {freeLessonsCount} ücretsiz ders
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-600">Ders Günü</p>
              <p className="text-3xl font-bold text-slate-700">{Object.keys(lessonsByDate).length}</p>
            </div>
          </div>
        </div>

        {/* Add Lesson Button */}
        <div className="flex justify-end mb-6">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="admin-btn" onClick={openAddDialog}>
                <Plus size={20} className="mr-2" />
                Grup Dersi Ekle
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingDate ? 'Grup Dersi Düzenle' : 'Grup Dersi Ekle'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Tarih</Label>
                  <DateInput
                    value={formData.date}
                    onChange={(date) => setFormData({ ...formData, date })}
                    placeholder="GG.AA.YYYY"
                  />
                  <p className="text-xs text-muted-foreground">Örnek: 12.02.2025</p>
                </div>
                <div className="space-y-2">
                  <Label>Ders Sayısı</Label>
                  <Input
                    type="number"
                    min="1"
                    value={formData.number_of_lessons}
                    onChange={(e) => setFormData({ ...formData, number_of_lessons: parseInt(e.target.value) || 2 })}
                  />
                </div>
                
                {/* Ücretsiz Ders Checkbox - Sadece Admin */}
                <div className="space-y-2">
                  <label 
                    htmlFor="is_free_lesson"
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      formData.is_free_lesson ? 'bg-green-50 border-green-300' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Checkbox
                      id="is_free_lesson"
                      checked={formData.is_free_lesson}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_free_lesson: !!checked }))}
                      data-testid="is-free-lesson-checkbox"
                    />
                    <div>
                      <span className="font-medium text-slate-800 flex items-center gap-2">
                        <Gift size={16} className="text-green-600" />
                        Ücretsiz Ders
                      </span>
                      <p className="text-xs text-slate-500">
                        Öğrenci bakiyesinden düşülmez, öğretmen kazancı devam eder
                      </p>
                    </div>
                  </label>
                </div>

                <div className="bg-purple-50 p-3 rounded-lg">
                  <p className="text-sm text-purple-700">
                    Bu ders <strong>{groupStudentsList.length} öğrenciye</strong> kaydedilecek.
                    {formData.is_free_lesson && (
                      <span className="block mt-1 text-green-700">
                        <Gift size={12} className="inline mr-1" />
                        Hediye ders olarak işaretlenecek.
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button onClick={editingDate ? handleUpdateLesson : handleAddLesson} className="flex-1">
                    {editingDate ? 'Güncelle' : 'Kaydet'}
                  </Button>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>İptal</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Lessons List */}
        <div className="admin-card p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Yapılan Dersler</h2>
          
          {Object.keys(lessonsByDate).length === 0 ? (
            <p className="text-center text-slate-500 py-8">Henüz ders girişi yapılmamış</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(lessonsByDate).sort((a, b) => b[0].localeCompare(a[0])).map(([date, dateLessons]) => {
                const firstLesson = dateLessons[0];
                const isFree = firstLesson?.is_free_lesson;
                const lessonCount = firstLesson?.number_of_lessons || 0;
                return (
                  <div 
                    key={date} 
                    className={`border-b pb-4 ${isFree ? 'bg-green-50 -mx-6 px-6 py-3 rounded-lg border-green-200' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-800 flex items-center gap-2">
                          {formatDateTurkish(date)}
                          {isFree && (
                            <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Gift size={12} />
                              Ücretsiz
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-slate-600">
                          {dateLessons.length} öğrenci • {lessonCount} ders
                        </p>
                      </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(date, dateLessons)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <Pencil size={16} className="mr-1" />
                        Düzenle
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteLessonsByDate(date, dateLessons)}
                        className="text-red-600 hover:text-red-800 hover:bg-red-50"
                      >
                        <Trash2 size={16} className="mr-1" />
                        Sil
                      </Button>
                    </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminGroupLesson;
