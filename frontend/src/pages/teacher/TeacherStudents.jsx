import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import TeacherLayout from '../../components/layouts/TeacherLayout';
import apiClient from '../../api/axios';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Book, Calendar, Search, User, Users, ChevronRight, Edit, X } from 'lucide-react';
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
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.teacher_id) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const [studentsRes, groupsRes, coursesRes, branchesRes] = await Promise.all([
        apiClient.get('/students'),
        apiClient.get('/student-groups'),
        apiClient.get('/student-courses'),
        apiClient.get('/branches')
      ]);
      
      setStudents(studentsRes.data);
      setBranches(branchesRes.data);
      
      // Öğretmene ait kursları filtrele
      const teacherCourses = coursesRes.data.filter(c => c.teacher_id === user.teacher_id);
      setCourses(teacherCourses);
      
      // Öğretmene ait grupları filtrele
      const teacherGroups = groupsRes.data.filter(g => g.teacher_id === user.teacher_id);
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
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 shadow-lg p-3 sm:p-6 z-20">
            <div className="container mx-auto">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  {selectedItem.type === 'group' ? (
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                      <Users size={16} className="sm:hidden text-purple-600" />
                      <Users size={20} className="hidden sm:block text-purple-600" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <User size={16} className="sm:hidden text-blue-600" />
                      <User size={20} className="hidden sm:block text-blue-600" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm text-stone-500">
                      {selectedItem.type === 'group' ? 'Seçili Grup' : 'Seçili Öğrenci'}
                    </p>
                    <p className="font-bold text-slate-800 text-sm sm:text-lg truncate">
                      {selectedItem.data.name}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    onClick={handleLessonEntry}
                    data-testid="lesson-entry-btn"
                    className="teacher-btn flex-1 sm:flex-none text-sm sm:text-base px-3 sm:px-6 py-2 sm:py-3"
                    size="sm"
                  >
                    {selectedItem.type === 'group' ? (
                      <Book size={16} className="mr-1 sm:mr-2" />
                    ) : (
                      <Edit size={16} className="mr-1 sm:mr-2" />
                    )}
                    <span className="hidden xs:inline">Ders Girişi</span>
                    <span className="xs:hidden">Giriş</span>
                  </Button>
                  <Button
                    onClick={handleLessonPlanning}
                    data-testid="lesson-planning-btn"
                    variant="outline"
                    className="rounded-full flex-1 sm:flex-none text-sm sm:text-base px-3 sm:px-6 py-2 sm:py-3"
                    size="sm"
                  >
                    <Calendar size={16} className="mr-1 sm:mr-2" />
                    <span className="hidden xs:inline">Ders Planlama</span>
                    <span className="xs:hidden">Planla</span>
                  </Button>
                  <Button
                    onClick={() => setSelectedItem(null)}
                    variant="outline"
                    data-testid="cancel-selection-btn"
                    className="rounded-full px-3 sm:px-4"
                    size="sm"
                  >
                    <X size={16} className="sm:mr-1" />
                    <span className="hidden sm:inline">İptal</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </TeacherLayout>
  );
};

export default TeacherStudents;
