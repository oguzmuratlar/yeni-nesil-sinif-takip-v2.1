import React, { useState, useEffect } from 'react';
import TeacherLayout from '../../components/layouts/TeacherLayout';
import apiClient from '../../api/axios';
import { useAuth } from '../../contexts/AuthContext';
import { Calendar, Filter, BookOpen, Users, TrendingUp, Video, Tent } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import { formatDateTurkish, generateMonthOptions } from '../../lib/dateUtils';
import { formatMoney } from '../../lib/utils';

const TeacherSchedule = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [plannedLessons, setPlannedLessons] = useState([]);
  const [students, setStudents] = useState([]);
  const [branches, setBranches] = useState([]);
  const [courses, setCourses] = useState([]);
  const [groups, setGroups] = useState([]);
  const [teacherPrices, setTeacherPrices] = useState([]);
  const [lessonTypes, setLessonTypes] = useState([]);
  const [youtubeEarnings, setYoutubeEarnings] = useState([]);
  const [campEarnings, setCampEarnings] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));

  // Dinamik ay listesi: 6 ay önce, 3 ay sonra
  const months = generateMonthOptions(6, 3);

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user?.teacher_id) return;
    
    setLoading(true);
    try {
      const [plannedRes, studentsRes, branchesRes, coursesRes, groupsRes, pricesRes, typesRes, youtubeRes, campsRes] = await Promise.all([
        apiClient.get('/planned-lessons'),
        apiClient.get('/students'),
        apiClient.get('/branches'),
        apiClient.get('/student-courses'),
        apiClient.get('/student-groups'),
        apiClient.get(`/teacher-prices?teacher_id=${user.teacher_id}`),
        apiClient.get('/lesson-types'),
        apiClient.get('/youtube-contents'),
        apiClient.get('/camps?include_completed=true')
      ]);
      
      setStudents(studentsRes.data);
      setBranches(branchesRes.data);
      setCourses(coursesRes.data);
      setGroups(groupsRes.data);
      setTeacherPrices(pricesRes.data);
      setLessonTypes(typesRes.data);
      
      // YouTube kazançları (öğretmene ait)
      const teacherYoutube = youtubeRes.data.filter(y => y.teacher_id === user.teacher_id);
      setYoutubeEarnings(teacherYoutube);
      
      // Kamp kazançları (öğretmene ait)
      const teacherCamps = campsRes.data.filter(c => c.teacher_id === user.teacher_id);
      setCampEarnings(teacherCamps);
      
      // Öğretmene ait kursları filtrele
      const teacherCourseIds = coursesRes.data
        .filter(c => c.teacher_id === user.teacher_id)
        .map(c => c.id);
      
      // Öğretmene ait planlı dersleri filtrele
      const teacherPlanned = plannedRes.data.filter(p => 
        teacherCourseIds.includes(p.student_course_id)
      );
      
      setPlannedLessons(teacherPlanned);
    } catch (error) {
      toast.error('Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  // Öğretmen ücretini hesapla (teacher_prices tablosundan)
  const getTeacherRate = (branchId, lessonTypeId, groupSize = null) => {
    // Lesson type ismini bul
    const lessonType = lessonTypes.find(lt => lt.id === lessonTypeId);
    const isGroup = lessonType?.name?.toLowerCase() === 'grup';
    
    if (isGroup && groupSize !== null) {
      // Grup dersi - group_size'a göre fiyat bul
      const effectiveSize = groupSize <= 4 ? groupSize : 4;
      const price = teacherPrices.find(tp => 
        tp.branch_id === branchId && 
        tp.lesson_type_id === lessonTypeId && 
        tp.group_size === effectiveSize
      );
      return price?.price || 0;
    } else {
      // Birebir ders
      const price = teacherPrices.find(tp => 
        tp.branch_id === branchId && 
        tp.lesson_type_id === lessonTypeId && 
        tp.group_size === null
      );
      return price?.price || 0;
    }
  };

  // Seçili aya göre filtrele
  const filteredLessons = plannedLessons.filter(p => p.month === selectedMonth);
  
  // YouTube kazançlarını aya göre filtrele
  const filteredYoutube = youtubeEarnings.filter(y => {
    if (!y.date) return false;
    const youtubeMonth = y.date.substring(0, 7);
    return youtubeMonth === selectedMonth;
  });
  
  // Kamp kazançlarını aya göre filtrele
  const filteredCamps = campEarnings.filter(c => {
    if (!c.start_date) return false;
    const campMonth = c.start_date.substring(0, 7);
    return campMonth === selectedMonth;
  });
  
  // YouTube toplam kazanç - amount alanını kullan (teacher_earning yerine)
  const youtubeTotal = filteredYoutube.reduce((sum, y) => sum + (y.amount || 0), 0);
  
  // Kamp toplam kazanç
  const campTotal = filteredCamps.reduce((sum, c) => sum + (c.teacher_earning || 0), 0);

  // Aylık istatistikleri hesapla
  // KURAL: teacher_prices tablosundan öğretmen ücretini al
  // Birebir: ders sayısı x birebir ücreti
  // Grup: ders sayısı x grup ücreti (grup sayısına göre)
  const calculateStats = () => {
    let totalLessons = 0;
    let estimatedEarning = 0;
    
    // Önce benzersiz planları bul (grup dersleri için çoklama var)
    const processedGroupPlans = new Set();
    
    filteredLessons.forEach(plan => {
      const course = courses.find(c => c.id === plan.student_course_id);
      if (!course) return;
      
      const group = groups.find(g => 
        g.student_ids?.includes(course.student_id) && g.branch_id === course.branch_id
      );
      
      // Grup dersi mi kontrol et
      if (group) {
        // Bu grup için zaten hesaplama yaptık mı?
        const groupPlanKey = `${group.id}-${plan.month}-${plan.dates}`;
        if (!processedGroupPlans.has(groupPlanKey)) {
          processedGroupPlans.add(groupPlanKey);
          // Grup dersi: sadece bir kez sayılır (öğretmen için)
          const groupSize = group.student_ids?.length || 1;
          const teacherRate = getTeacherRate(course.branch_id, course.lesson_type_id, groupSize);
          totalLessons += plan.number_of_lessons;
          estimatedEarning += plan.number_of_lessons * teacherRate;
        }
      } else {
        // Birebir ders
        const teacherRate = getTeacherRate(course.branch_id, course.lesson_type_id, null);
        totalLessons += plan.number_of_lessons;
        estimatedEarning += plan.number_of_lessons * teacherRate;
      }
    });
    
    return { totalLessons, estimatedEarning };
  };

  const stats = calculateStats();
  
  // Aylık toplam kazanç (Ders + YouTube + Kamp)
  const monthlyTotal = stats.estimatedEarning + youtubeTotal + campTotal;

  // Planları öğrencilere göre grupla
  const getEnrichedPlans = () => {
    return filteredLessons.map(plan => {
      const course = courses.find(c => c.id === plan.student_course_id);
      const student = course ? students.find(s => s.id === course.student_id) : null;
      const branch = course ? branches.find(b => b.id === course.branch_id) : null;
      const group = course ? groups.find(g => 
        g.student_ids?.includes(course.student_id) && g.branch_id === course.branch_id
      ) : null;
      
      // Öğretmen ücretini hesapla
      const groupSize = group ? (group.student_ids?.length || 1) : null;
      const teacherRate = course ? getTeacherRate(course.branch_id, course.lesson_type_id, groupSize) : 0;
      
      return {
        ...plan,
        course,
        student,
        branch,
        group,
        totalLessons: plan.number_of_lessons,
        earning: plan.number_of_lessons * teacherRate
      };
    }).sort((a, b) => (a.student?.name || '').localeCompare(b.student?.name || ''));
  };

  const enrichedPlans = getEnrichedPlans();

  // Grup ve birebir ayrımı
  const groupPlans = enrichedPlans.filter(p => p.group);
  const individualPlans = enrichedPlans.filter(p => !p.group);

  // Unique gruplar (aynı grup için sadece bir kez göster)
  const uniqueGroups = [];
  const seenGroups = new Set();
  groupPlans.forEach(p => {
    if (p.group) {
      const groupPlanKey = `${p.group.id}-${p.month}-${p.dates}`;
      if (!seenGroups.has(groupPlanKey)) {
        seenGroups.add(groupPlanKey);
        const groupSize = p.group.student_ids?.length || 1;
        const teacherRate = p.course ? getTeacherRate(p.course.branch_id, p.course.lesson_type_id, groupSize) : 0;
        uniqueGroups.push({
          ...p,
          totalGroupLessons: p.number_of_lessons,
          groupEarning: p.number_of_lessons * teacherRate
        });
      }
    }
  });

  if (loading) {
    return (
      <TeacherLayout>
        <div className="text-center py-12">
          <p className="text-stone-600">Yükleniyor...</p>
        </div>
      </TeacherLayout>
    );
  }

  return (
    <TeacherLayout>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
            <Calendar size={32} className="text-blue-600" />
          </div>
          <h1 className="text-3xl lg:text-4xl font-extrabold text-slate-800 mb-2" data-testid="teacher-schedule-title">
            Ders Programım
          </h1>
          <p className="text-stone-600">Planlanan derslerinizi görüntüleyin</p>
        </div>

        {/* Ay Filtresi */}
        <div className="teacher-card p-4 mb-6">
          <div className="flex items-center gap-4">
            <Filter size={18} className="text-stone-500" />
            <span className="text-sm font-medium text-stone-700">Ay:</span>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Ay seçin" />
              </SelectTrigger>
              <SelectContent>
                {months.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Özet Kartları */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div className="teacher-card p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <BookOpen size={18} className="text-blue-600" />
              <p className="text-xs text-stone-500">Planlı Ders</p>
            </div>
            <p className="text-2xl font-bold text-blue-600">{stats.totalLessons}</p>
          </div>
          <div className="teacher-card p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <BookOpen size={18} className="text-indigo-600" />
              <p className="text-xs text-stone-500">Ders Kazancı</p>
            </div>
            <p className="text-2xl font-bold text-indigo-600">{formatMoney(stats.estimatedEarning, false)} ₺</p>
          </div>
          <div className="teacher-card p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Video size={18} className="text-red-600" />
              <p className="text-xs text-stone-500">YouTube</p>
            </div>
            <p className="text-2xl font-bold text-red-600">{formatMoney(youtubeTotal, false)} ₺</p>
          </div>
          <div className="teacher-card p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Tent size={18} className="text-orange-600" />
              <p className="text-xs text-stone-500">Kamp</p>
            </div>
            <p className="text-2xl font-bold text-orange-600">{formatMoney(campTotal, false)} ₺</p>
          </div>
          <div className="teacher-card p-4 text-center col-span-2 lg:col-span-1 bg-green-50">
            <div className="flex items-center justify-center gap-2 mb-2">
              <TrendingUp size={18} className="text-green-600" />
              <p className="text-xs text-stone-500">Aylık Toplam</p>
            </div>
            <p className="text-2xl font-bold text-green-600">{formatMoney(monthlyTotal, false)} ₺</p>
          </div>
        </div>

        {/* Grup Dersleri */}
        {uniqueGroups.length > 0 && (
          <div className="teacher-card p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Users size={20} className="text-purple-600" />
              <h2 className="text-xl font-bold text-slate-800">Grup Dersleri</h2>
            </div>
            <div className="space-y-3">
              {uniqueGroups.map((plan, idx) => (
                <div key={idx} className="p-4 bg-purple-50 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-800">{plan.group?.name}</h3>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="secondary">{plan.branch?.name}</Badge>
                        <Badge variant="outline">{plan.group?.student_ids?.length || 0} öğrenci</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {plan.dates.split(',').map((d, i) => (
                          <span key={i} className="text-xs bg-white text-purple-700 px-2 py-0.5 rounded border">
                            {d.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-stone-500">{plan.totalGroupLessons} ders</p>
                      <p className="text-lg font-bold text-green-600">{plan.groupEarning.toFixed(0)} ₺</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Birebir Dersler */}
        {individualPlans.length > 0 && (
          <div className="teacher-card p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen size={20} className="text-blue-600" />
              <h2 className="text-xl font-bold text-slate-800">Birebir Dersler</h2>
            </div>
            <div className="space-y-3">
              {individualPlans.map((plan, idx) => (
                <div key={idx} className="p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-800">{plan.student?.name || 'Bilinmiyor'}</h3>
                      <Badge variant="secondary" className="mt-1">{plan.branch?.name}</Badge>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {plan.dates.split(',').map((d, i) => (
                          <span key={i} className="text-xs bg-white text-blue-700 px-2 py-0.5 rounded border">
                            {d.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-stone-500">{plan.totalLessons} ders</p>
                      <p className="text-lg font-bold text-green-600">{plan.earning.toFixed(0)} ₺</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Boş durum */}
        {filteredLessons.length === 0 && (
          <div className="teacher-card p-12 text-center">
            <Calendar size={48} className="mx-auto mb-4 text-stone-300" />
            <p className="text-stone-600">Bu ay için planlı ders bulunmuyor</p>
            <p className="text-sm text-stone-500 mt-2">
              Öğrencilerinizin profillerinden ders planlayabilirsiniz
            </p>
          </div>
        )}
      </div>
    </TeacherLayout>
  );
};

export default TeacherSchedule;
