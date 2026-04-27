import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layouts/AdminLayout';
import apiClient from '../../api/axios';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { DateInput } from '../../components/ui/date-input';
import { Plus, Trash2, ArrowLeft, User, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTurkish } from '../../lib/dateUtils';

const AdminStudentLessons = () => {
  const { id, courseId } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [branch, setBranch] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState(null);
  const [newLesson, setNewLesson] = useState({ date: '', number_of_lessons: 1 });

  useEffect(() => {
    fetchData();
  }, [id, courseId]);

  const fetchData = async () => {
    try {
      const [studentRes, courseRes, lessonsRes, branchesRes] = await Promise.all([
        apiClient.get(`/students/${id}`),
        apiClient.get(`/student-courses?student_id=${id}`),
        apiClient.get(`/lessons?student_course_id=${courseId}`),
        apiClient.get('/branches')
      ]);
      setStudent(studentRes.data);
      const foundCourse = courseRes.data.find(c => c.id === courseId);
      setCourse(foundCourse);
      setLessons(lessonsRes.data);
      if (foundCourse) {
        const foundBranch = branchesRes.data.find(b => b.id === foundCourse.branch_id);
        setBranch(foundBranch);
      }
    } catch (error) {
      toast.error('Veriler yüklenemedi');
    }
  };

  const handleAddLesson = async (e) => {
    e.preventDefault();
    try {
      if (editingLesson) {
        // Düzenleme: Mevcut dersi sil ve yenisini ekle
        await apiClient.delete(`/lessons/${editingLesson.id}`);
        await apiClient.post('/lessons', {
          student_course_id: courseId,
          ...newLesson
        });
        toast.success('Ders güncellendi');
      } else {
        // Yeni ders ekle
        await apiClient.post('/lessons', {
          student_course_id: courseId,
          ...newLesson
        });
        toast.success('Ders eklendi');
      }
      setDialogOpen(false);
      setEditingLesson(null);
      setNewLesson({ date: '', number_of_lessons: 1 });
      fetchData();
    } catch (error) {
      toast.error(editingLesson ? 'Ders güncellenemedi' : 'Ders eklenemedi');
    }
  };

  const openEditDialog = (lesson) => {
    setEditingLesson(lesson);
    setNewLesson({
      date: lesson.date,
      number_of_lessons: lesson.number_of_lessons
    });
    setDialogOpen(true);
  };

  const openAddDialog = () => {
    setEditingLesson(null);
    setNewLesson({ date: '', number_of_lessons: 1 });
    setDialogOpen(true);
  };

  const handleDeleteLesson = async (lessonId) => {
    if (!window.confirm('Bu dersi silmek istediğinizden emin misiniz?')) return;
    try {
      await apiClient.delete(`/lessons/${lessonId}`);
      toast.success('Ders silindi');
      fetchData();
    } catch (error) {
      toast.error('Ders silinemedi');
    }
  };

  const totalLessons = lessons.reduce((sum, l) => sum + l.number_of_lessons, 0);

  return (
    <AdminLayout>
      <div>
        <Button
          onClick={() => navigate(`/admin/students/${id}`)}
          variant="ghost"
          className="mb-4"
        >
          <ArrowLeft size={20} className="mr-2" />
          Geri Dön
        </Button>

        <div className="mb-8">
          <h1 className="text-4xl font-extrabold text-slate-800 mb-2">
            Ders Takip - {student?.name}
          </h1>
          <p className="text-slate-600">{branch?.name}</p>
        </div>

        <div className="admin-card p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Toplam Ders Sayısı</p>
              <p className="text-3xl font-bold text-slate-800">{totalLessons}</p>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="add-lesson-btn" className="admin-btn" onClick={openAddDialog}>
                  <Plus size={20} className="mr-2" />
                  Ders Ekle
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingLesson ? 'Ders Düzenle' : 'Yeni Ders Ekle'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddLesson} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="date">Tarih</Label>
                    <DateInput
                      value={newLesson.date}
                      onChange={(date) => setNewLesson({ ...newLesson, date })}
                      placeholder="GG.AA.YYYY"
                    />
                    <p className="text-xs text-muted-foreground">Örnek: 12.02.2025</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="number">Ders Adedi</Label>
                    <Input
                      id="number"
                      type="number"
                      min="1"
                      value={newLesson.number_of_lessons}
                      onChange={(e) => setNewLesson({ ...newLesson, number_of_lessons: parseInt(e.target.value) })}
                      required
                    />
                  </div>
                  <div className="flex gap-3">
                    <Button type="submit" className="flex-1">{editingLesson ? 'Güncelle' : 'Kaydet'}</Button>
                    <Button type="button" variant="outline" onClick={() => {
                      setDialogOpen(false);
                      setEditingLesson(null);
                    }}>İptal</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="admin-card p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Ders Geçmişi</h2>
          {lessons.length === 0 ? (
            <p className="text-slate-600 text-center py-8">Henüz ders eklenmemiş</p>
          ) : (
            <div className="space-y-3">
              {lessons.map((lesson) => (
                <div key={lesson.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-semibold text-slate-800">{formatDateTurkish(lesson.date)}</p>
                    <p className="text-sm text-slate-600">{lesson.number_of_lessons} ders</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                      onClick={() => openEditDialog(lesson)}
                    >
                      <Pencil size={16} className="mr-1" />
                      Düzenle
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDeleteLesson(lesson.id)}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6">
          <Button
            onClick={() => navigate(`/admin/students/${id}`)}
            variant="outline"
          >
            <User size={20} className="mr-2" />
            Öğrenci Profiline Dön
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminStudentLessons;