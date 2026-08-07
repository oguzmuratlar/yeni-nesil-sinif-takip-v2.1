import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import TeacherLayout from '../../components/layouts/TeacherLayout';
import apiClient from '../../api/axios';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { Label } from '../../components/ui/label';
import { Book, Calendar, Search, User, Users, ChevronRight, Edit, X, ClipboardList, Video, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const TeacherStudents = () => {
  const { user } = useAuth();
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [courses, setCourses] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState(null); // { type: 'student' | 'group', data: {...} }
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'individual', 'groups'
  const [groupStudentDialog, setGroupStudentDialog] = useState(false);
  const [homeworkEnabled, setHomeworkEnabled] = useState(true);
  const [lessonLinksEnabled, setLessonLinksEnabled] = useState(false);
  const [lessonLinks, setLessonLinks] = useState([]);
  
  // Dersi Başlat states
  const [startLessonDialog, setStartLessonDialog] = useState(false);
  const [lessonMode, setLessonMode] = useState(''); // 'new_lesson' | 'continue_existing'
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [selectedLink, setSelectedLink] = useState(null);
  const [startingLesson, setStartingLesson] = useState(false);
  
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.teacher_id) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const [studentsRes, groupsRes, coursesRes, branchesRes, homeworkStatusRes, lessonLinksStatusRes] = await Promise.all([
        apiClient.get('/students'),
        apiClient.get('/student-groups'),
        apiClient.get('/student-courses'),
        apiClient.get('/branches'),
        apiClient.get('/system-settings/homework-status').catch(() => ({ data: { enabled: true } })),
        apiClient.get('/system-settings/lesson-links-status').catch(() => ({ data: { enabled: false } }))
      ]);
      
      // Feature flag kontrolü
      setHomeworkEnabled(homeworkStatusRes.data.enabled);
      setLessonLinksEnabled(lessonLinksStatusRes.data.enabled);
      
      // Ders linklerini al (sadece enabled ise)
      if (lessonLinksStatusRes.data.enabled) {
        try {
          const linksRes = await apiClient.get('/teacher/lesson-links');
          setLessonLinks(linksRes.data);
        } catch (e) {
          setLessonLinks([]);
        }
      }
      
      // Sadece aktif öğrencileri filtrele
      const activeStudents = studentsRes.data.filter(s => s.status === 'active');
      setStudents(activeStudents);
      setBranches(branchesRes.data);
      
      // Öğretmene ait aktif kursları filtrele
      const teacherCourses = coursesRes.data.filter(c => c.teacher_id === user.teacher_id);
      setCourses(teacherCourses);
      
      // Öğretmene ait AKTİF grupları filtrele
      const teacherGroups = groupsRes.data.filter(g => 
        g.teacher_id === user.teacher_id && g.status !== 'inactive'
      );
      setGroups(teacherGroups);
    } catch (error) {
      toast.error('Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  // Get students who are NOT in any group (individual students)
  const groupStudentIds = new Set(groups.flatMap(g => g.student_ids || []));
  const individualStudents = students.filter(s => !groupStudentIds.has(s.id));
  
  // Get students who are in groups
  const groupedStudents = students.filter(s => groupStudentIds.has(s.id));

  // Filter based on search and tab
  const filteredIndividualStudents = individualStudents.filter(student =>
    student.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredGroups = groups.filter(group =>
    group.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectStudent = (student) => {
    setSelectedItem({ type: 'student', data: student });
  };

  const handleSelectGroup = (group) => {
    setSelectedItem({ type: 'group', data: group });
  };

  const handleLessonEntry = () => {
    if (!selectedItem) return;
    
    if (selectedItem.type === 'student') {
      // Birebir öğrenci için kursunu bul ve ders girişine yönlendir
      const studentCourse = courses.find(c => c.student_id === selectedItem.data.id);
      if (studentCourse) {
        navigate(`/teacher/students/${selectedItem.data.id}/lessons/${studentCourse.id}`);
      } else {
        toast.error('Öğrenciye ait kurs bulunamadı');
      }
    } else {
      // Navigate to group lesson entry
      navigate(`/teacher/groups/${selectedItem.data.id}/lessons`);
    }
  };

  const handleLessonPlanning = () => {
    if (!selectedItem) return;
    
    if (selectedItem.type === 'student') {
      // Birebir öğrenci için kursunu bul ve ders planlamaya yönlendir
      const studentCourse = courses.find(c => c.student_id === selectedItem.data.id);
      if (studentCourse) {
        navigate(`/teacher/students/${selectedItem.data.id}/planned-lessons/${studentCourse.id}`);
      } else {
        toast.error('Öğrenciye ait kurs bulunamadı');
      }
    } else {
      // Navigate to group lesson planning
      navigate(`/teacher/groups/${selectedItem.data.id}/planned-lessons`);
    }
  };

  const handleHomeworkEntry = () => {
    if (!selectedItem) return;
    
    if (selectedItem.type === 'student') {
      // Birebir öğrenci için direkt ödev takip sayfasına git
      const studentCourse = courses.find(c => c.student_id === selectedItem.data.id);
      if (studentCourse) {
        navigate(`/teacher/students/${selectedItem.data.id}/homework/${studentCourse.branch_id}`);
      } else {
        toast.error('Öğrenciye ait kurs bulunamadı');
      }
    } else {
      // Grup için önce öğrenci seç
      setGroupStudentDialog(true);
    }
  };

  const handleSelectGroupStudent = (student) => {
    // Grup içindeki öğrenciyi seç ve ödev takip sayfasına yönlendir
    setGroupStudentDialog(false);
    const branch = branches.find(b => b.id === selectedItem.data.branch_id);
    if (branch) {
      navigate(`/teacher/students/${student.id}/homework/${branch.id}`);
    }
  };

  // Dersi Başlat fonksiyonları
  const handleOpenStartLesson = () => {
    if (!selectedItem) return;
    setLessonMode('');
    setSelectedLink(null);
    setStartLessonDialog(true);
  };

  const handleLinkClick = (link) => {
    if (!lessonMode) {
      toast.error('Ders durumunu seçiniz.');
      return;
    }
    setSelectedLink(link);
    setConfirmDialog(true);
  };

  const handleConfirmStartLesson = async () => {
    if (!selectedLink || !lessonMode || !selectedItem) return;
    
    setStartingLesson(true);
    try {
      const payload = {
        selected_type: selectedItem.type,
        lesson_link_id: selectedLink.id,
        mode: lessonMode
      };
      
      if (selectedItem.type === 'student') {
        const studentCourse = courses.find(c => c.student_id === selectedItem.data.id);
        if (!studentCourse) {
          toast.error('Öğrenciye ait kurs bulunamadı');
          return;
        }
        payload.student_course_id = studentCourse.id;
      } else {
        payload.group_id = selectedItem.data.id;
      }
      
      const response = await apiClient.post('/lesson-links/start-lesson', payload);
      
      if (response.data.success) {
        // Linki yeni sekmede aç
        window.open(response.data.link_url, '_blank');
        
        if (response.data.lesson_created_or_updated) {
          toast.success(response.data.message);
        }
        
        setConfirmDialog(false);
        setStartLessonDialog(false);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'İşlem başarısız');
    } finally {
      setStartingLesson(false);
    }
  };

  const getTodayFormatted = () => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    return `${day}.${month}.${year}`;
  };

  return (
    <TeacherLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-12 text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-800 mb-3" data-testid="teacher-students-title">
            Öğrencilerim
          </h1>
          <p className="text-lg text-stone-600">
            Birebir öğrencileriniz ve gruplarınız
          </p>
        </div>

        {/* Search */}
        <div className="teacher-card p-8 mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={20} />
            <Input
              type="text"
              placeholder="Öğrenci veya grup adı ile ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="student-search-input"
              className="pl-12 h-14 text-base"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <Button 
            variant={activeTab === 'all' ? 'default' : 'outline'}
            onClick={() => setActiveTab('all')}
            className="rounded-full"
          >
            Tümü
          </Button>
          <Button 
            variant={activeTab === 'individual' ? 'default' : 'outline'}
            onClick={() => setActiveTab('individual')}
            className="rounded-full"
          >
            <User size={16} className="mr-2" />
            Birebir ({filteredIndividualStudents.length})
          </Button>
          <Button 
            variant={activeTab === 'groups' ? 'default' : 'outline'}
            onClick={() => setActiveTab('groups')}
            className="rounded-full"
          >
            <Users size={16} className="mr-2" />
            Gruplar ({filteredGroups.length})
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-stone-600">Yükleniyor...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Groups Section */}
            {(activeTab === 'all' || activeTab === 'groups') && filteredGroups.length > 0 && (
              <div>
                {activeTab === 'all' && (
                  <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Users size={20} className="text-purple-600" />
                    Gruplarım
                  </h2>
                )}
                <div className="space-y-4">
                  {filteredGroups.map((group) => {
                    const branch = branches.find(b => b.id === group.branch_id);
                    const groupStudentsList = students.filter(s => group.student_ids?.includes(s.id));
                    const isSelected = selectedItem?.type === 'group' && selectedItem?.data?.id === group.id;
                    
                    return (
                      <div
                        key={group.id}
                        data-testid={`group-card-${group.id}`}
                        className={`teacher-card p-6 cursor-pointer transition-all ${
                          isSelected ? 'ring-2 ring-purple-500 bg-purple-50' : ''
                        }`}
                        onClick={() => handleSelectGroup(group)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                                <Users size={24} className="text-purple-600" />
                              </div>
                              <div>
                                <h3 className="text-xl font-bold text-slate-800">{group.name}</h3>
                                <p className="text-sm text-purple-600 font-medium">
                                  {branch?.name} • {group.level}. Sınıf • {group.student_ids?.length || 0} öğrenci
                                </p>
                              </div>
                            </div>
                            
                            {/* Student list preview */}
                            <div className="ml-15 mt-3 flex flex-wrap gap-2">
                              {groupStudentsList.slice(0, 4).map(s => (
                                <span key={s.id} className="text-xs bg-slate-100 px-2 py-1 rounded">
                                  {s.name}
                                </span>
                              ))}
                              {groupStudentsList.length > 4 && (
                                <span className="text-xs text-slate-500">
                                  +{groupStudentsList.length - 4} daha
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight size={24} className="text-slate-400" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Individual Students Section */}
            {(activeTab === 'all' || activeTab === 'individual') && filteredIndividualStudents.length > 0 && (
              <div>
                {activeTab === 'all' && (
                  <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <User size={20} className="text-blue-600" />
                    Birebir Öğrenciler
                  </h2>
                )}
                <div className="space-y-4">
                  {filteredIndividualStudents.map((student) => {
                    const isSelected = selectedItem?.type === 'student' && selectedItem?.data?.id === student.id;
                    
                    return (
                      <div
                        key={student.id}
                        data-testid={`student-card-${student.id}`}
                        className={`teacher-card p-6 cursor-pointer transition-all ${
                          isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                        }`}
                        onClick={() => handleSelectStudent(student)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                              <User size={24} className="text-blue-600" />
                            </div>
                            <div>
                              <h3 className="text-xl font-bold text-slate-800">{student.name}</h3>
                              <p className="text-sm text-slate-600">
                                {student.level} • Veli: {student.parent_name}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/teacher/students/${student.id}/profile`);
                              }}
                              variant="outline"
                              size="sm"
                              className="rounded-full"
                            >
                              Profil
                            </Button>
                            <ChevronRight size={24} className="text-slate-400" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Empty State */}
            {filteredIndividualStudents.length === 0 && filteredGroups.length === 0 && (
              <div className="teacher-card p-12 text-center">
                <p className="text-stone-600">Henüz öğrenciniz veya grubunuz yok</p>
              </div>
            )}
          </div>
        )}

        {/* Selected Item Actions - Responsive */}
        {selectedItem && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 shadow-lg p-4 z-20">
            <div className="container mx-auto">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  {selectedItem.type === 'group' ? (
                    <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                      <Users size={20} className="text-purple-600" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <User size={20} className="text-blue-600" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-stone-500">
                      {selectedItem.type === 'group' ? 'Seçili Grup' : 'Seçili Öğrenci'}
                    </p>
                    <p className="font-bold text-slate-800 text-base truncate">
                      {selectedItem.data.name}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                  {lessonLinksEnabled && (
                    <Button
                      onClick={handleOpenStartLesson}
                      data-testid="start-lesson-btn"
                      className="flex-shrink-0 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-full"
                    >
                      <Video size={16} className="mr-2" />
                      Dersi Başlat
                    </Button>
                  )}
                  <Button
                    onClick={handleLessonEntry}
                    data-testid="lesson-entry-btn"
                    className="teacher-btn flex-shrink-0 px-4 py-2"
                  >
                    <Edit size={16} className="mr-2" />
                    Ders Girişi
                  </Button>
                  <Button
                    onClick={handleLessonPlanning}
                    data-testid="lesson-planning-btn"
                    variant="outline"
                    className="rounded-full flex-shrink-0 px-4 py-2"
                  >
                    <Calendar size={16} className="mr-2" />
                    Planlama
                  </Button>
                  {homeworkEnabled && (
                    <Button
                      onClick={handleHomeworkEntry}
                      data-testid="homework-entry-btn"
                      variant="outline"
                      className="rounded-full flex-shrink-0 px-4 py-2 border-purple-300 text-purple-700 hover:bg-purple-50"
                    >
                      <ClipboardList size={16} className="mr-2" />
                      Ödev
                    </Button>
                  )}
                  <Button
                    onClick={() => setSelectedItem(null)}
                    variant="outline"
                    data-testid="cancel-selection-btn"
                    className="rounded-full flex-shrink-0 px-3 py-2"
                  >
                    <X size={16} />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Group Student Selection Dialog */}
        <Dialog open={groupStudentDialog} onOpenChange={setGroupStudentDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Öğrenci Seçin</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <p className="text-sm text-slate-500 mb-4">
                {selectedItem?.data?.name} grubundan ödev takibi yapılacak öğrenciyi seçin
              </p>
              {selectedItem?.type === 'group' && students
                .filter(s => selectedItem.data.student_ids?.includes(s.id))
                .map(student => (
                  <div
                    key={student.id}
                    onClick={() => handleSelectGroupStudent(student)}
                    className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:border-purple-300 hover:bg-purple-50 transition-all"
                  >
                    <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                      <User size={20} className="text-purple-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">{student.name}</p>
                      <p className="text-sm text-slate-500">{student.school}</p>
                    </div>
                    <ChevronRight className="ml-auto text-slate-400" size={20} />
                  </div>
                ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Dersi Başlat Dialog */}
        <Dialog open={startLessonDialog} onOpenChange={setStartLessonDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Video className="w-5 h-5 text-teal-600" />
                Dersi Başlat
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              {/* Radio buttons for lesson mode */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Ders Durumu</Label>
                <RadioGroup value={lessonMode} onValueChange={setLessonMode}>
                  <div className="flex items-center space-x-2 p-3 rounded-lg border border-slate-200 hover:border-teal-300 hover:bg-teal-50/50 cursor-pointer transition-all">
                    <RadioGroupItem value="new_lesson" id="new_lesson" />
                    <Label htmlFor="new_lesson" className="cursor-pointer flex-1">
                      <span className="font-medium">Yeni ders başlat</span>
                      <p className="text-xs text-slate-500 mt-0.5">Bugün için 1 adet ders kaydı oluşturulur</p>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 p-3 rounded-lg border border-slate-200 hover:border-teal-300 hover:bg-teal-50/50 cursor-pointer transition-all">
                    <RadioGroupItem value="continue_existing" id="continue_existing" />
                    <Label htmlFor="continue_existing" className="cursor-pointer flex-1">
                      <span className="font-medium">Mevcut derse devam et</span>
                      <p className="text-xs text-slate-500 mt-0.5">Sadece linke yönlendirilir, ders kaydı oluşturulmaz</p>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Lesson Links */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Ders Linki Seçin</Label>
                {lessonLinks.length === 0 ? (
                  <div className="p-4 bg-slate-50 rounded-lg text-center text-slate-500">
                    <Video className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="text-sm">Size tanımlı ders linki bulunmuyor.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {lessonLinks.map((link) => (
                      <Button
                        key={link.id}
                        variant="outline"
                        className="w-full justify-start gap-2 h-auto py-3 px-4"
                        onClick={() => handleLinkClick(link)}
                        data-testid={`lesson-link-btn-${link.id}`}
                      >
                        <Video className="w-4 h-4 text-teal-600 flex-shrink-0" />
                        <div className="text-left">
                          <p className="font-medium">{link.link_name}</p>
                          <p className="text-xs text-slate-500">{link.branch_name}</p>
                        </div>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Confirmation Dialog */}
        <AlertDialog open={confirmDialog} onOpenChange={setConfirmDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {lessonMode === 'new_lesson' ? 'Yeni Ders Başlat' : 'Mevcut Derse Devam Et'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {lessonMode === 'new_lesson' ? (
                  <>
                    <strong>{getTodayFormatted()}</strong> tarihli 1 adet ders başlatmayı onaylıyor musunuz?
                    <br /><br />
                    Onayladığınızda ders linkine yönlendirileceksiniz.
                  </>
                ) : (
                  <>
                    Ders giriş ekranına yeni bir ders olarak yansımayacaktır.
                    <br /><br />
                    Onayladığınızda ders linkine yönlendirileceksiniz.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={startingLesson}>Vazgeç</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmStartLesson}
                disabled={startingLesson}
                className="bg-teal-600 hover:bg-teal-700"
                data-testid="confirm-start-lesson-btn"
              >
                {startingLesson ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Onayla
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TeacherLayout>
  );
};

export default TeacherStudents;
