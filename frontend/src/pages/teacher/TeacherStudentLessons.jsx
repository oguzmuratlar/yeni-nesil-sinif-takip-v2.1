import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TeacherLayout from '../../components/layouts/TeacherLayout';
import apiClient from '../../api/axios';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { DateInput } from '../../components/ui/date-input';
import { Plus, Trash2, ArrowLeft, User } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTurkish } from '../../lib/dateUtils';

const TeacherStudentLessons = () => {
  const { id, courseId } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [branch, setBranch] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newLesson, setNewLesson] = useState({ date: '', number_of_lessons: 2 });

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
      // En son tarihli ders en üstte olacak şekilde sırala
      const sortedLessons = lessonsRes.data.sort((a, b) => new Date(b.date) - new Date(a.date));
      setLessons(sortedLessons);
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
      await apiClient.post('/lessons', {
        student_course_id: courseId,
        ...newLesson
      });
      toast.success('Ders eklendi');
      setDialogOpen(false);
      setNewLesson({ date: '', number_of_lessons: 2 });
      fetchData();
    } catch (error) {
      toast.error('Ders eklenemedi');
    }
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
    <TeacherLayout>
      <div className="max-w-5xl mx-auto">
        <Button
          onClick={() => navigate(`/teacher/students/${id}/profile`)}
          variant="ghost"
          className="mb-6 rounded-full"
        >
          <ArrowLeft size={20} className="mr-2" />
          Geri Dön
        </Button>

        <div className="mb-10">
          <h1 className="text-4xl font-extrabold text-slate-800 mb-2">
            Ders Takip - {student?.name}
          </h1>
          <p className="text-lg text-stone-600">{branch?.name}</p>
        </div>

        <div className="teacher-card p-8 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-stone-500 mb-1">Toplam Ders Sayısı</p>
              <p className="text-4xl font-bold text-slate-800">{totalLessons}</p>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="add-lesson-btn" className="teacher-btn">
                  <Plus size={20} className="mr-2" />
                  Ders Ekle
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Yeni Ders Ekle</DialogTitle>
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
                    <Button type="submit" className="flex-1 teacher-btn">Kaydet</Button>
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="rounded-full">İptal</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="teacher-card p-8">
          <h2 className="text-2xl font-bold text-slate-800 mb-6">Ders Geçmişi</h2>
          {lessons.length === 0 ? (
            <p className="text-stone-600 text-center py-12">Henüz ders eklenmemiş</p>
          ) : (
            <div className="space-y-4">
              {lessons.map((lesson) => (
                <div key={lesson.id} className="flex items-center justify-between p-6 bg-stone-50 rounded-xl">
                  <div>
                    <p className="font-semibold text-slate-800 text-lg">{formatDateTurkish(lesson.date)}</p>
                    <p className="text-sm text-stone-600">{lesson.number_of_lessons} ders</p>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDeleteLesson(lesson.id)}
                    className="rounded-full"
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8">
          <Button
            onClick={() => navigate(`/teacher/students/${id}/profile`)}
            variant="outline"
            className="rounded-full"
          >
            <User size={20} className="mr-2" />
            Öğrenci Profiline Dön
          </Button>
        </div>
      </div>
    </TeacherLayout>
  );
};

export default TeacherStudentLessons;