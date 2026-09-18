import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layouts/AdminLayout';
import apiClient from '../../api/axios';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Plus, Search, ChevronRight, Users, BookOpen, Calendar, X, Book, Star } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { toast } from 'sonner';

const AdminStudents = () => {
  const [students, setStudents] = useState([]);
  const [studentStats, setStudentStats] = useState(null);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  const [ynsEnabled, setYnsEnabled] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchStudents();
    fetchStudentStats();
    fetchBranches();
    apiClient.get('/system-settings/yns-league-status').then(r => setYnsEnabled(r.data.enabled)).catch(() => {});
  }, [showInactive]);

  const fetchStudents = async () => {
    try {
      const response = await apiClient.get('/students');
      const filtered = showInactive 
        ? response.data 
        : response.data.filter(s => s.status === 'active');
      setStudents(filtered);
    } catch (error) {
      toast.error('Öğrenciler yüklenemedi');
      console.error('Error fetching students:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentStats = async () => {
    try {
      const response = await apiClient.get('/students/stats/summary');
      setStudentStats(response.data);
    } catch (error) {
      console.error('Error fetching student stats:', error);
    }
  };

  const fetchBranches = async () => {
    try {
      const response = await apiClient.get('/branches');
      setBranches(response.data);
    } catch (error) {
      console.error('Error fetching branches:', error);
    }
  };

  const toggleStudentStatus = async (studentId, currentStatus) => {
    try {
      const student = students.find(s => s.id === studentId);
      await apiClient.put(`/students/${studentId}`, {
        ...student,
        status: currentStatus === 'active' ? 'inactive' : 'active'
      });
      toast.success(currentStatus === 'active' ? 'Öğrenci pasifleştirildi' : 'Öğrenci aktifleştirildi');
      fetchStudents();
    } catch (error) {
      toast.error('İşlem başarısız');
    }
  };

  const filteredStudents = students.filter(student =>
    student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.parent_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AdminLayout>
      <div className="pb-24 lg:pb-0">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 lg:mb-8">
          <div>
            <h1 className="page-title" data-testid="admin-students-title">
              Öğrenciler
            </h1>
            <p className="page-subtitle mt-1">Tüm öğrencilerinizi görüntüleyin ve yönetin</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            {ynsEnabled && (
              <Button
                onClick={() => navigate('/admin/yns-league?tab=leaderboard')}
                data-testid="students-yns-league-btn"
                variant="outline"
                className="w-full sm:w-auto border-amber-400 text-amber-600 hover:bg-amber-50"
              >
                <Star size={18} className="mr-2" />
                YNS League
              </Button>
            )}
            <Button
              onClick={() => navigate('/admin/students/new')}
              data-testid="add-student-btn"
              className="admin-btn w-full sm:w-auto"
            >
              <Plus size={20} className="mr-2" />
              Öğrenci Ekle
            </Button>
          </div>
        </div>

        {/* Branş Bazlı Öğrenci Listelerine Hızlı Erişim - EN ÜSTTE */}
        {branches.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {branches.map((branch) => (
              <div
                key={branch.id}
                onClick={() => navigate(`/admin/students/branch/${branch.id}`)}
                className="admin-card p-5 cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02] group"
                data-testid={`branch-students-${branch.id}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-xl ${
                      branch.name.includes('Matematik') ? 'bg-blue-100' :
                      branch.name.includes('Fen') ? 'bg-green-100' : 'bg-purple-100'
                    }`}>
                      <BookOpen size={24} className={`${
                        branch.name.includes('Matematik') ? 'text-blue-600' :
                        branch.name.includes('Fen') ? 'text-green-600' : 'text-purple-600'
                      }`} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                        {branch.name}
                      </h3>
                      <p className="text-sm text-slate-500">Öğrenci Listesi</p>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-slate-400 group-hover:text-blue-600 transition-colors" />
                </div>
                <p className="text-xs text-slate-400 mt-3">
                  Detaylı finans bilgisi ve borç/alacak durumu
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Öğretmen Bazında Öğrenci Sayıları */}
        {studentStats && Object.keys(studentStats.by_teacher || {}).length > 0 && (
          <div className="admin-card p-4 mb-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Öğretmen Bazında Öğrenci Sayıları</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(studentStats.by_teacher || {}).map(([teacherName, count]) => (
                <Badge key={teacherName} variant="secondary" className="text-sm">
                  {teacherName}: {count}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Search & Filter */}
        <div className="admin-card p-4 lg:p-6 mb-4 lg:mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <Input
                type="text"
                placeholder="Öğrenci veya veli adı ile ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="student-search-input"
                className="pl-10 h-12"
              />
            </div>
            <Button
              onClick={() => setShowInactive(!showInactive)}
              variant={showInactive ? "default" : "outline"}
              data-testid="toggle-inactive-btn"
              className="h-12 whitespace-nowrap"
            >
              {showInactive ? 'Sadece Aktifler' : 'Pasifleri Göster'}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-slate-600">Yükleniyor...</p>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="admin-card p-8 lg:p-12 text-center">
            <p className="text-slate-600">Henüz öğrenci eklenmemiş</p>
          </div>
        ) : (
          <div className="space-y-3 lg:space-y-4">
            {filteredStudents.map((student) => (
              <div
                key={student.id}
                data-testid={`student-card-${student.id}`}
                className="admin-card p-4 lg:p-6 active:bg-slate-50 transition-all cursor-pointer"
                onClick={() => navigate(`/admin/students/${student.id}`)}
              >
                {/* Mobile Layout */}
                <div className="lg:hidden">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold text-slate-800 truncate">{student.name}</h3>
                        <Badge variant={student.status === 'active' ? 'default' : 'secondary'} className="text-xs shrink-0">
                          {student.status === 'active' ? 'Aktif' : 'Pasif'}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600 truncate">Veli: {student.parent_name}</p>
                      <p className="text-sm text-slate-500">Sınıf: {student.level}</p>
                    </div>
                    <ChevronRight size={20} className="text-slate-400 shrink-0 mt-1" />
                  </div>
                  
                  {/* Mobile Action Buttons */}
                  <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/admin/students/${student.id}/edit`);
                      }}
                      variant="outline"
                      size="sm"
                      className="flex-1 h-10"
                    >
                      Düzenle
                    </Button>
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStudentStatus(student.id, student.status);
                      }}
                      variant={student.status === 'active' ? 'destructive' : 'default'}
                      size="sm"
                      className="flex-1 h-10"
                    >
                      {student.status === 'active' ? 'Pasifleştir' : 'Aktifleştir'}
                    </Button>
                  </div>
                </div>

                {/* Desktop Layout */}
                <div className="hidden lg:flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-xl font-bold text-slate-800">{student.name}</h3>
                      <Badge variant={student.status === 'active' ? 'default' : 'secondary'}>
                        {student.status === 'active' ? 'Aktif' : 'Pasif'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-600">
                      <span>Veli: {student.parent_name}</span>
                      <span>•</span>
                      <span>Sınıf: {student.level}</span>
                      <span>•</span>
                      <span>Tel: {student.phone}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/admin/students/${student.id}`);
                      }}
                      data-testid={`view-student-${student.id}`}
                      variant="outline"
                      size="sm"
                    >
                      Profil
                    </Button>
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/admin/students/${student.id}/edit`);
                      }}
                      variant="outline"
                      size="sm"
                    >
                      Düzenle
                    </Button>
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStudentStatus(student.id, student.status);
                      }}
                      variant={student.status === 'active' ? 'destructive' : 'default'}
                      size="sm"
                    >
                      {student.status === 'active' ? 'Pasifleştir' : 'Aktifleştir'}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Selected Student Actions - Mobile optimized */}
        {selectedStudent && (
          <div className="fixed bottom-0 left-0 lg:left-64 right-0 bg-white border-t border-slate-200 shadow-lg p-4 lg:p-6 z-20 safe-area-bottom">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center justify-between sm:block">
                <div>
                  <p className="text-xs lg:text-sm text-slate-600 mb-0.5">Seçili Öğrenci</p>
                  <p className="font-bold text-slate-800">{selectedStudent.name}</p>
                </div>
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="sm:hidden p-2 -mr-2 rounded-lg hover:bg-slate-100"
                >
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:flex gap-2 lg:gap-3">
                <Button
                  onClick={() => navigate(`/admin/students/${selectedStudent.id}`)}
                  data-testid="lesson-entry-btn"
                  className="bg-green-600 hover:bg-green-700 h-11 lg:h-10"
                >
                  <Book size={18} className="mr-2" />
                  <span className="hidden sm:inline">Ders</span> Giriş
                </Button>
                <Button
                  onClick={() => navigate(`/admin/students/${selectedStudent.id}`)}
                  data-testid="lesson-planning-btn"
                  className="bg-purple-600 hover:bg-purple-700 h-11 lg:h-10"
                >
                  <Calendar size={18} className="mr-2" />
                  <span className="hidden sm:inline">Ders</span> Planlama
                </Button>
                <Button
                  onClick={() => setSelectedStudent(null)}
                  variant="outline"
                  data-testid="cancel-selection-btn"
                  className="hidden sm:flex h-10"
                >
                  İptal
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminStudents;
