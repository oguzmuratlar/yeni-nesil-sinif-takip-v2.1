import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TeacherLayout from '../../components/layouts/TeacherLayout';
import apiClient from '../../api/axios';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Plus, Trash2, ArrowLeft, Edit, Calendar, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '../../components/ui/checkbox';
import { generateMonthOptions, getNextMonth } from '../../lib/dateUtils';
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
import PlanningMasterCelebration from '../../components/PlanningMasterCelebration';

// Ay adını Türkçe formata çevir
const formatMonthTurkish = (monthStr) => {
  if (!monthStr) return '';
  const [year, month] = monthStr.split('-');
  const monthNames = {
    '01': 'Ocak', '02': 'Şubat', '03': 'Mart', '04': 'Nisan',
    '05': 'Mayıs', '06': 'Haziran', '07': 'Temmuz', '08': 'Ağustos',
    '09': 'Eylül', '10': 'Ekim', '11': 'Kasım', '12': 'Aralık'
  };
  return `${monthNames[month] || month} ${year}`;
};

const TeacherStudentPlannedLessons = () => {
  const { id, courseId } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [plannedLessons, setPlannedLessons] = useState([]);
  const [branch, setBranch] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [filterMonth, setFilterMonth] = useState('all');
  
  // Varsayılan ay: bir sonraki ay
  const defaultMonth = getNextMonth();
  
  const [newPlanned, setNewPlanned] = useState({
    dates: '',
    number_of_lessons: '2', // Varsayılan ders adedi: 2
    month: defaultMonth,
    messaged: false,
    no_lesson_this_month: false // Bu ay dersi yok seçeneği
  });
  const [editPlanned, setEditPlanned] = useState({
    dates: '',
    number_of_lessons: '',
    month: '',
    no_lesson_this_month: false
  });
  
  // Kutlama animasyonu state'leri
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState(null);

  // Dinamik ay listesi: 6 ay önce, 3 ay sonra, bir sonraki ay en üstte
  const months = generateMonthOptions(6, 3, true);

  useEffect(() => {
    fetchData();
  }, [id, courseId]);

  const fetchData = async () => {
    try {
      const [studentRes, courseRes, plannedRes, branchesRes] = await Promise.all([
        apiClient.get(`/students/${id}`),
        apiClient.get(`/student-courses?student_id=${id}`),
        apiClient.get(`/planned-lessons?student_course_id=${courseId}`),
        apiClient.get('/branches')
      ]);
      setStudent(studentRes.data);
      const foundCourse = courseRes.data.find(c => c.id === courseId);
      if (foundCourse) {
        const foundBranch = branchesRes.data.find(b => b.id === foundCourse.branch_id);
        setBranch(foundBranch);
      }
      setPlannedLessons(plannedRes.data);
    } catch (error) {
      toast.error('Veriler yüklenemedi');
    }
  };

  const handleAddPlanned = async (e) => {
    e.preventDefault();
    
    // "Bu ay dersi yok" seçiliyse sadece ay bilgisi yeterli
    if (newPlanned.no_lesson_this_month) {
      // Aynı ay için zaten kayıt var mı kontrol et
      const existingPlan = plannedLessons.find(p => p.month === newPlanned.month);
      if (existingPlan) {
        toast.error(`${formatMonthTurkish(newPlanned.month)} için zaten planlama var. Aynı ay için birden fazla planlama yapılamaz.`);
        return;
      }
      
      try {
        const response = await apiClient.post('/planned-lessons', {
          student_course_id: courseId,
          dates: 'Bu ay dersi yok',
          number_of_lessons: 0,
          month: newPlanned.month,
          messaged: false,
          no_lesson_this_month: true
        });
        toast.success('Bu ay dersi yok olarak kaydedildi');
        setDialogOpen(false);
        setNewPlanned({ dates: '', number_of_lessons: '2', month: defaultMonth, messaged: false, no_lesson_this_month: false });
        fetchData();
        
        // Kutlama kontrolü
        if (response.data?.planning_master_badge?.awarded) {
          setCelebrationData(response.data.planning_master_badge);
          setShowCelebration(true);
        }
      } catch (error) {
        toast.error(error.response?.data?.detail || 'Kayıt başarısız');
      }
      return;
    }
    
    if (!newPlanned.dates || !newPlanned.number_of_lessons || !newPlanned.month) {
      toast.error('Tüm alanları doldurun');
      return;
    }
    
    // Aynı ay için zaten kayıt var mı kontrol et
    const existingPlan = plannedLessons.find(p => p.month === newPlanned.month);
    if (existingPlan) {
      toast.error(`${formatMonthTurkish(newPlanned.month)} için zaten planlama var. Aynı ay için birden fazla planlama yapılamaz.`);
      return;
    }
    
    try {
      const response = await apiClient.post('/planned-lessons', {
        student_course_id: courseId,
        dates: newPlanned.dates,
        number_of_lessons: parseInt(newPlanned.number_of_lessons),
        month: newPlanned.month,
        messaged: false,
        no_lesson_this_month: false
      });
      toast.success('Planlanmış ders eklendi');
      setDialogOpen(false);
      setNewPlanned({ dates: '', number_of_lessons: '2', month: defaultMonth, messaged: false, no_lesson_this_month: false });
      fetchData();
      
      // Kutlama kontrolü
      if (response.data?.planning_master_badge?.awarded) {
        setCelebrationData(response.data.planning_master_badge);
        setShowCelebration(true);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Ders planlanamadı');
    }
  };

  // Düzenleme dialog'unu aç
  const openEditDialog = (plan) => {
    setSelectedPlan(plan);
    setEditPlanned({
      dates: plan.dates,
      number_of_lessons: String(plan.number_of_lessons),
      month: plan.month
    });
    setEditDialogOpen(true);
  };

  // Planı güncelle
  const handleUpdatePlanned = async () => {
    if (!editPlanned.dates || !editPlanned.number_of_lessons || !editPlanned.month) {
      toast.error('Tüm alanları doldurun');
      return;
    }
    try {
      await apiClient.put(`/planned-lessons/${selectedPlan.id}`, {
        student_course_id: courseId,
        dates: editPlanned.dates,
        number_of_lessons: parseInt(editPlanned.number_of_lessons),
        month: editPlanned.month,
        messaged: selectedPlan.messaged || false
      });
      toast.success('Plan güncellendi');
      setEditDialogOpen(false);
      setSelectedPlan(null);
      fetchData();
    } catch (error) {
      toast.error('Güncelleme başarısız');
    }
  };

  // Silme dialog'unu aç
  const openDeleteDialog = (plan) => {
    setSelectedPlan(plan);
    setDeleteDialogOpen(true);
  };

  // Planı sil
  const handleDeletePlanned = async () => {
    try {
      await apiClient.delete(`/planned-lessons/${selectedPlan.id}`);
      toast.success('Plan silindi');
      setDeleteDialogOpen(false);
      setSelectedPlan(null);
      fetchData();
    } catch (error) {
      toast.error('Silinemedi');
    }
  };

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
            Ders Planlama - {student?.name}
          </h1>
          <p className="text-lg text-stone-600">{branch?.name}</p>
        </div>

        <div className="teacher-card p-8 mb-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-bold text-slate-800">Planlanmış Dersler</h2>
              <Select value={filterMonth} onValueChange={setFilterMonth}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Ay Filtresi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Aylar</SelectItem>
                  {months.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="add-planned-lesson-btn" className="teacher-btn">
                  <Plus size={20} className="mr-2" />
                  Ders Planla
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Yeni Ders Planla</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddPlanned} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Ay *</Label>
                    <Select value={newPlanned.month} onValueChange={(val) => setNewPlanned({ ...newPlanned, month: val })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Ay seçin" />
                      </SelectTrigger>
                      <SelectContent>
                        {months.map(m => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* Bu ay dersi yok seçeneği */}
                  <div className="flex items-center space-x-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <Checkbox
                      id="no_lesson"
                      checked={newPlanned.no_lesson_this_month}
                      onCheckedChange={(checked) => setNewPlanned({ ...newPlanned, no_lesson_this_month: checked })}
                    />
                    <div className="flex items-center gap-2">
                      <Ban size={16} className="text-amber-600" />
                      <Label htmlFor="no_lesson" className="text-amber-700 cursor-pointer">Bu ay dersi yok</Label>
                    </div>
                  </div>
                  
                  {!newPlanned.no_lesson_this_month && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="dates">Tarihler *</Label>
                        <Input
                          id="dates"
                          type="text"
                          value={newPlanned.dates}
                          onChange={(e) => setNewPlanned({ ...newPlanned, dates: e.target.value })}
                          placeholder="Örn: 3-10-17-24"
                        />
                        <p className="text-xs text-slate-500">Tarihleri istediğiniz formatta yazın</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="number">Toplam Ders Sayısı *</Label>
                        <Input
                          id="number"
                          type="number"
                          min="1"
                          placeholder="Örn: 8"
                          value={newPlanned.number_of_lessons}
                          onChange={(e) => setNewPlanned({ ...newPlanned, number_of_lessons: e.target.value })}
                        />
                      </div>
                    </>
                  )}
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <p className="text-sm text-blue-700">
                      {newPlanned.no_lesson_this_month 
                        ? 'Bu öğrenci seçilen ayda aylık programda görünmeyecektir.' 
                        : 'Bu plan admin aylık programında görünecektir.'}
                    </p>
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

        <div className="teacher-card p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Planlı Dersler</h2>
          
          {plannedLessons.length === 0 ? (
            <div className="text-center py-8">
              <Calendar size={48} className="mx-auto mb-4 text-slate-300" />
              <p className="text-slate-500">Henüz ders planlanmamış</p>
            </div>
          ) : (
            <div className="space-y-4">
              {(() => {
                // Aya göre grupla
                const filteredPlans = plannedLessons.filter(p => filterMonth === 'all' || p.month === filterMonth);
                const plansByMonth = filteredPlans.reduce((acc, plan) => {
                  const monthLabel = formatMonthTurkish(plan.month);
                  if (!acc[monthLabel]) {
                    acc[monthLabel] = [];
                  }
                  acc[monthLabel].push(plan);
                  return acc;
                }, {});

                if (Object.keys(plansByMonth).length === 0) {
                  return <p className="text-stone-600 text-center py-6">Bu ay için plan bulunamadı</p>;
                }

                return Object.entries(plansByMonth).sort((a, b) => b[0].localeCompare(a[0])).map(([month, plans]) => (
                  <div key={month} className="bg-slate-50 rounded-lg p-4">
                    <h3 className="font-bold text-blue-700 text-lg mb-2">{month}</h3>
                    {plans.map((planned) => (
                      <div key={planned.id} className="flex items-center justify-between py-2 border-b border-slate-200 last:border-b-0">
                        <span className="text-slate-700 font-medium">
                          {planned.dates} - {planned.number_of_lessons} Ders
                        </span>
                        <div className="flex items-center gap-2">
                          {planned.messaged && (
                            <span className="text-xs text-green-600">✓ Mesaj gönderildi</span>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(planned)}
                            className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600"
                          >
                            <Edit size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog(planned)}
                            className="h-8 w-8 p-0 text-slate-500 hover:text-red-600"
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ));
              })()}
            </div>
          )}
        </div>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ders Planı Düzenle</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Ay *</Label>
                <Select value={editPlanned.month} onValueChange={(val) => setEditPlanned({ ...editPlanned, month: val })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Ay seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tarihler *</Label>
                <Input
                  value={editPlanned.dates}
                  onChange={(e) => setEditPlanned({ ...editPlanned, dates: e.target.value })}
                  placeholder="Örn: 3-10-17-24"
                />
              </div>
              <div className="space-y-2">
                <Label>Toplam Ders Sayısı *</Label>
                <Input
                  type="number"
                  min="1"
                  value={editPlanned.number_of_lessons}
                  onChange={(e) => setEditPlanned({ ...editPlanned, number_of_lessons: e.target.value })}
                />
              </div>
              <div className="flex gap-3">
                <Button onClick={handleUpdatePlanned} className="flex-1 teacher-btn">Güncelle</Button>
                <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="rounded-full">İptal</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Planı Sil</AlertDialogTitle>
              <AlertDialogDescription>
                Bu ders planını silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>İptal</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeletePlanned} className="bg-red-600 hover:bg-red-700">
                Sil
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      
      {/* Planlama Ustası Kutlama Animasyonu */}
      <PlanningMasterCelebration
        isOpen={showCelebration}
        onClose={() => setShowCelebration(false)}
        data={celebrationData}
      />
    </TeacherLayout>
  );
};

export default TeacherStudentPlannedLessons;