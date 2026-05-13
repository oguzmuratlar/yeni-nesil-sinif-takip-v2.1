import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TeacherLayout from '../../components/layouts/TeacherLayout';
import apiClient from '../../api/axios';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { toast } from 'sonner';
import { Users, ArrowLeft, Plus, Calendar, Edit, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
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
import { generateMonthOptions, getNextMonth } from '../../lib/dateUtils';

const TeacherGroupPlannedLessons = () => {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [group, setGroup] = useState(null);
  const [students, setStudents] = useState([]);
  const [branches, setBranches] = useState([]);
  const [plannedLessons, setPlannedLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [filterMonth, setFilterMonth] = useState('all');
  
  // Varsayılan ay: bir sonraki ay
  const defaultMonth = getNextMonth();
  
  const [newPlan, setNewPlan] = useState({
    dates: '',
    number_of_lessons: '2', // Varsayılan ders adedi: 2
    month: defaultMonth
  });
  const [editPlan, setEditPlan] = useState({
    dates: '',
    number_of_lessons: '',
    month: ''
  });
  
  // Kutlama animasyonu state'leri
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState(null);

  // Dinamik ay listesi: 6 ay önce, 3 ay sonra, bir sonraki ay en üstte
  const months = generateMonthOptions(6, 3, true);

  useEffect(() => {
    if (user?.teacher_id) {
      fetchData();
    }
  }, [groupId, user]);

  const fetchData = async () => {
    try {
      const [groupsRes, studentsRes, branchesRes, plannedRes, coursesRes] = await Promise.all([
        apiClient.get('/student-groups'),
        apiClient.get('/students'),
        apiClient.get('/branches'),
        apiClient.get('/planned-lessons'),
        apiClient.get('/student-courses')
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
      
      // Filter planned lessons for students in this group
      const groupStudentIds = foundGroup.student_ids || [];
      const groupCourseIds = coursesRes.data
        .filter(c => groupStudentIds.includes(c.student_id) && c.branch_id === foundGroup.branch_id)
        .map(c => c.id);
      
      const groupPlanned = plannedRes.data.filter(p => groupCourseIds.includes(p.student_course_id));
      setPlannedLessons(groupPlanned);
    } catch (error) {
      toast.error('Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleAddPlan = async () => {
    if (!newPlan.dates || !newPlan.number_of_lessons || !newPlan.month) {
      toast.error('Tüm alanları doldurun');
      return;
    }

    try {
      const response = await apiClient.post('/group-planned-lessons', {
        group_id: groupId,
        dates: newPlan.dates,
        number_of_lessons: parseInt(newPlan.number_of_lessons),
        month: newPlan.month
      });
      
      toast.success(`Grup planlaması eklendi - ${group.student_ids?.length || 0} öğrenciye kaydedildi`);
      setDialogOpen(false);
      setNewPlan({ dates: '', number_of_lessons: '2', month: defaultMonth });
      fetchData();
      
      // Kutlama kontrolü
      if (response.data?.planning_master_badge?.awarded) {
        setCelebrationData(response.data.planning_master_badge);
        setShowCelebration(true);
      }
    } catch (error) {
      console.error('Plan error:', error);
      toast.error(error.response?.data?.detail || 'Planlama eklenemedi');
    }
  };

  // Düzenleme dialog'unu aç
  const openEditDialog = (plan) => {
    setSelectedPlan(plan);
    setEditPlan({
      dates: plan.dates,
      number_of_lessons: String(plan.number_of_lessons),
      month: plan.month
    });
    setEditDialogOpen(true);
  };

  // Planı güncelle - gruptaki tüm öğrenciler için
  const handleUpdatePlan = async () => {
    if (!editPlan.dates || !editPlan.number_of_lessons || !editPlan.month) {
      toast.error('Tüm alanları doldurun');
      return;
    }

    try {
      // Grup planlama güncelleme - tek API çağrısı
      await apiClient.put('/group-planned-lessons', {
        group_id: groupId,
        old_month: selectedPlan.month,
        old_dates: selectedPlan.dates,
        old_number_of_lessons: selectedPlan.number_of_lessons,
        new_dates: editPlan.dates,
        new_number_of_lessons: parseInt(editPlan.number_of_lessons),
        new_month: editPlan.month
      });

      toast.success('Grup planı güncellendi');
      setEditDialogOpen(false);
      setSelectedPlan(null);
      fetchData();
    } catch (error) {
      console.error('Update error:', error);
      toast.error('Güncelleme başarısız');
    }
  };

  // Silme dialog'unu aç
  const openDeleteDialog = (plan) => {
    setSelectedPlan(plan);
    setDeleteDialogOpen(true);
  };

  // Planı sil - gruptaki tüm öğrenciler için tek API çağrısı
  const handleDeletePlan = async () => {
    try {
      // Grup planlama silme - tek API çağrısı
      await apiClient.delete('/group-planned-lessons', {
        data: {
          group_id: groupId,
          month: selectedPlan.month,
          dates: selectedPlan.dates,
          number_of_lessons: selectedPlan.number_of_lessons
        }
      });

      toast.success('Grup planı silindi');
      setDeleteDialogOpen(false);
      setSelectedPlan(null);
      fetchData();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Silme başarısız');
    }
  };

  const branch = group ? branches.find(b => b.id === group.branch_id) : null;
  const groupStudentsList = group ? students.filter(s => group.student_ids?.includes(s.id)) : [];

  // Format month to Turkish (e.g., "2026-03" -> "Mart 2026")
  const formatMonthTurkish = (monthStr) => {
    const monthNames = {
      '01': 'Ocak', '02': 'Şubat', '03': 'Mart', '04': 'Nisan',
      '05': 'Mayıs', '06': 'Haziran', '07': 'Temmuz', '08': 'Ağustos',
      '09': 'Eylül', '10': 'Ekim', '11': 'Kasım', '12': 'Aralık'
    };
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    return `${monthNames[month] || month} ${year}`;
  };

  // Group planned lessons by month - sadece benzersiz planları al (group_id bazlı)
  const getUniquePlansByMonth = () => {
    const seenPlans = new Set();
    const uniquePlans = [];
    
    plannedLessons.forEach(plan => {
      // Her ay için benzersiz bir plan olması için key oluştur
      const planKey = `${plan.month}-${plan.dates}-${plan.number_of_lessons}`;
      if (!seenPlans.has(planKey)) {
        seenPlans.add(planKey);
        uniquePlans.push(plan);
      }
    });
    
    // Ay filtresini uygula
    const filteredPlans = filterMonth === 'all' 
      ? uniquePlans 
      : uniquePlans.filter(p => p.month === filterMonth);
    
    // Aya göre grupla
    return filteredPlans.reduce((acc, plan) => {
      const monthLabel = formatMonthTurkish(plan.month);
      if (!acc[monthLabel]) {
        acc[monthLabel] = [];
      }
      acc[monthLabel].push(plan);
      return acc;
    }, {});
  };

  const plansByMonth = getUniquePlansByMonth();

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
              <Calendar size={32} className="text-purple-600" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-slate-800">{group.name} - Ders Planı</h1>
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
            Grup için ders planladığınızda, yukarıdaki tüm öğrencilere otomatik kaydedilir.
          </p>
        </div>

        {/* Add Plan Button */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Ay Filtresi" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Aylar</SelectItem>
              {months.map(m => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="teacher-btn">
                <Plus size={20} className="mr-2" />
                Grup Planı Ekle
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Grup Ders Planı Ekle</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Ay *</Label>
                  <Select value={newPlan.month} onValueChange={(val) => setNewPlan({ ...newPlan, month: val })}>
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
                    placeholder="Örn: 3-10-17-24"
                    value={newPlan.dates}
                    onChange={(e) => setNewPlan({ ...newPlan, dates: e.target.value })}
                  />
                  <p className="text-xs text-slate-500">Tarihleri istediğiniz formatta yazın (örn: 3-10-17-24 veya 3, 10, 17, 24)</p>
                </div>
                <div className="space-y-2">
                  <Label>Toplam Ders Sayısı *</Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="Örn: 8"
                    value={newPlan.number_of_lessons}
                    onChange={(e) => setNewPlan({ ...newPlan, number_of_lessons: e.target.value })}
                  />
                </div>
                <div className="bg-purple-50 p-3 rounded-lg">
                  <p className="text-sm text-purple-700">
                    Bu plan <strong>{groupStudentsList.length} öğrenciye</strong> kaydedilecek ve admin aylık programında görünecek.
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button onClick={handleAddPlan} className="flex-1">Kaydet</Button>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>İptal</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Planned Lessons List */}
        <div className="teacher-card p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Planlı Dersler</h2>
          
          {Object.keys(plansByMonth).length === 0 ? (
            <div className="text-center py-8">
              <Calendar size={48} className="mx-auto mb-4 text-slate-300" />
              <p className="text-slate-500">Henüz planlama yapılmamış</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(plansByMonth).sort((a, b) => b[0].localeCompare(a[0])).map(([month, plans]) => (
                <div key={month} className="bg-slate-50 rounded-lg p-4">
                  <h3 className="font-bold text-purple-700 text-lg mb-2">{month}</h3>
                  {plans.map((plan, idx) => (
                    <div key={plan.id || idx} className="flex items-center justify-between py-2 border-b border-slate-200 last:border-b-0">
                      <span className="text-slate-700 font-medium">
                        {plan.dates} - {plan.number_of_lessons} Ders
                      </span>
                      <div className="flex items-center gap-2">
                        {plan.messaged && (
                          <span className="text-xs text-green-600">✓ Mesaj gönderildi</span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(plan)}
                          className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600"
                        >
                          <Edit size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDeleteDialog(plan)}
                          className="h-8 w-8 p-0 text-slate-500 hover:text-red-600"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Grup Ders Planı Düzenle</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Ay *</Label>
                <Select value={editPlan.month} onValueChange={(val) => setEditPlan({ ...editPlan, month: val })}>
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
                  placeholder="Örn: 3-10-17-24"
                  value={editPlan.dates}
                  onChange={(e) => setEditPlan({ ...editPlan, dates: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Toplam Ders Sayısı *</Label>
                <Input
                  type="number"
                  min="1"
                  value={editPlan.number_of_lessons}
                  onChange={(e) => setEditPlan({ ...editPlan, number_of_lessons: e.target.value })}
                />
              </div>
              <div className="bg-yellow-50 p-3 rounded-lg">
                <p className="text-sm text-yellow-700">
                  Bu değişiklik <strong>{groupStudentsList.length} öğrenci</strong> için geçerli olacaktır.
                </p>
              </div>
              <div className="flex gap-3">
                <Button onClick={handleUpdatePlan} className="flex-1">Güncelle</Button>
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>İptal</Button>
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
                Bu ders planını silmek istediğinizden emin misiniz? Bu işlem <strong>{groupStudentsList.length} öğrenci</strong> için geçerli olacaktır ve geri alınamaz.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>İptal</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeletePlan} className="bg-red-600 hover:bg-red-700">
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

export default TeacherGroupPlannedLessons;
