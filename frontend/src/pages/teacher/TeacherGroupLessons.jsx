import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TeacherLayout from '../../components/layouts/TeacherLayout';
import apiClient from '../../api/axios';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { DateInput } from '../../components/ui/date-input';
import { toast } from 'sonner';
import { Users, ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { formatDateTurkish } from '../../lib/dateUtils';

const TeacherGroupLessons = () => {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [group, setGroup] = useState(null);
  const [students, setStudents] = useState([]);
  const [branches, setBranches] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newLesson, setNewLesson] = useState({
    date: new Date().toISOString().split('T')[0],
    number_of_lessons: 2
  });

  useEffect(() => {
    if (user?.teacher_id) {
      fetchData();
    }
  }, [groupId, user]);

  const fetchData = async () => {
    try {
      const [groupsRes, studentsRes, branchesRes, lessonsRes] = await Promise.all([
        apiClient.get('/student-groups'),
        apiClient.get('/students'),
        apiClient.get('/branches'),
        apiClient.get('/lessons')
      ]);
      
      // Öğretmene ait grubu bul
      const teacherGroups = groupsRes.data.filter(g => g.teacher_id === user.teacher_id);
      const foundGroup = teacherGroups.find(g => g.id === groupId);
      
      if (!foundGroup) {
        toast.error('Bu gruba erişim yetkiniz yok');
        setLoading(false);
        return;
      }
      
      setGroup(foundGroup);
      setStudents(studentsRes.data);
      setBranches(branchesRes.data);
      
      // Filter lessons for students in this group
      const groupStudentIds = foundGroup.student_ids || [];
      // Get courses for group students
      const coursesRes = await apiClient.get('/student-courses');
      const groupCourseIds = coursesRes.data
        .filter(c => groupStudentIds.includes(c.student_id) && c.branch_id === foundGroup.branch_id)
        .map(c => c.id);
      
      const groupLessons = lessonsRes.data.filter(l => groupCourseIds.includes(l.student_course_id));
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
    if (!newLesson.date || !newLesson.number_of_lessons) {
      toast.error('Tüm alanları doldurun');
      return;
    }

    try {
      await apiClient.post('/group-lessons', null, {
        params: {
          group_id: groupId,
          branch_id: group.branch_id,
          date: newLesson.date,
          number_of_lessons: newLesson.number_of_lessons
        }
      });
      
      toast.success(`Grup dersi eklendi - ${group.student_ids?.length || 0} öğrenciye kaydedildi`);
      setDialogOpen(false);
      setNewLesson({ date: new Date().toISOString().split('T')[0], number_of_lessons: 2 });
      fetchData();
    } catch (error) {
      toast.error('Ders eklenemedi');
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
    // Her tarihte en az bir ders kaydı varsa, ilkinin ders sayısını al
    const firstLesson = lessonsByDate[date]?.[0];
    return sum + (firstLesson?.number_of_lessons || 0);
  }, 0);

  if (loading) {
    return (
      <TeacherLayout>
        <div className="text-center py-12">
          <p className="text-stone-600">Yükleniyor...</p>
        </div>
      </TeacherLayout>
    );
  }

  if (!group) {
    return (
      <TeacherLayout>
        <div className="text-center py-12">
          <p className="text-stone-600">Grup bulunamadı</p>
        </div>
      </TeacherLayout>
    );
  }

  return (
    <TeacherLayout>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/teacher/students')}
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
        <div className="teacher-card p-6 mb-6">
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
        <div className="teacher-card p-6 mb-6 bg-blue-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Toplam Ders Sayısı</p>
              <p className="text-3xl font-bold text-blue-600">{totalLessons}</p>
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
              <Button className="teacher-btn">
                <Plus size={20} className="mr-2" />
                Grup Dersi Ekle
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Grup Dersi Ekle</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Tarih</Label>
                  <DateInput
                    value={newLesson.date}
                    onChange={(date) => setNewLesson({ ...newLesson, date })}
                    placeholder="GG.AA.YYYY"
                  />
                  <p className="text-xs text-muted-foreground">Örnek: 12.02.2025</p>
                </div>
                <div className="space-y-2">
                  <Label>Ders Sayısı</Label>
                  <Input
                    type="number"
                    min="1"
                    value={newLesson.number_of_lessons}
                    onChange={(e) => setNewLesson({ ...newLesson, number_of_lessons: parseInt(e.target.value) })}
                  />
                </div>
                <div className="bg-purple-50 p-3 rounded-lg">
                  <p className="text-sm text-purple-700">
                    Bu ders <strong>{groupStudentsList.length} öğrenciye</strong> kaydedilecek.
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button onClick={handleAddLesson} className="flex-1">Kaydet</Button>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>İptal</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Lessons List */}
        <div className="teacher-card p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Yapılan Dersler</h2>
          
          {Object.keys(lessonsByDate).length === 0 ? (
            <p className="text-center text-slate-500 py-8">Henüz ders girişi yapılmamış</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(lessonsByDate).sort((a, b) => b[0].localeCompare(a[0])).map(([date, dateLessons]) => {
                // İlk öğrencinin ders sayısını al (tüm öğrencilerde aynı)
                const lessonCount = dateLessons[0]?.number_of_lessons || 0;
                return (
                  <div key={date} className="border-b pb-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-800">{formatDateTurkish(date)}</p>
                        <p className="text-sm text-slate-600">
                          {dateLessons.length} öğrenci • {lessonCount} ders
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </TeacherLayout>
  );
};

export default TeacherGroupLessons;
