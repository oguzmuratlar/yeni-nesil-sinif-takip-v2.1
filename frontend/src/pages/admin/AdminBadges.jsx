import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/layouts/AdminLayout';
import apiClient from '../../api/axios';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { 
  Trophy, 
  Target, 
  Flame, 
  Award, 
  Check, 
  X, 
  ChevronRight,
  Calendar,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
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

const AdminBadges = () => {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [season, setSeason] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [detail, setDetail] = useState(null);
  const [history, setHistory] = useState(null);
  const [seasonEndDialogOpen, setSeasonEndDialogOpen] = useState(false);

  useEffect(() => {
    fetchTeachers();
  }, []);

  const fetchTeachers = async () => {
    try {
      const res = await apiClient.get('/planning-master/all-teachers');
      setTeachers(res.data.teachers || []);
      setSeason(res.data.season || '');
    } catch (error) {
      toast.error('Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const fetchDetail = async (teacher) => {
    setSelectedTeacher(teacher);
    try {
      const res = await apiClient.get(`/planning-master/detail/${teacher.teacher_id}`);
      setDetail(res.data);
      setDetailOpen(true);
    } catch (error) {
      toast.error('Detay yüklenemedi');
    }
  };

  const fetchHistory = async (teacher) => {
    setSelectedTeacher(teacher);
    try {
      const res = await apiClient.get(`/planning-master/history/${teacher.teacher_id}`);
      setHistory(res.data);
      setHistoryOpen(true);
    } catch (error) {
      toast.error('Geçmiş yüklenemedi');
    }
  };

  const handleSeasonEnd = async () => {
    try {
      const res = await apiClient.post('/planning-master/season-end');
      toast.success(res.data.message);
      setSeasonEndDialogOpen(false);
      fetchTeachers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'İşlem başarısız');
    }
  };

  const formatMonth = (monthStr) => {
    if (!monthStr) return '';
    const monthNames = {
      '01': 'Ocak', '02': 'Şubat', '03': 'Mart', '04': 'Nisan',
      '05': 'Mayıs', '06': 'Haziran', '07': 'Temmuz', '08': 'Ağustos',
      '09': 'Eylül', '10': 'Ekim', '11': 'Kasım', '12': 'Aralık'
    };
    const [year, month] = monthStr.split('-');
    return `${monthNames[month] || month} ${year}`;
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-slate-600 mt-4">Yükleniyor...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div>
        {/* Header */}
        <div className="mb-6 lg:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="page-title" data-testid="admin-badges-title">
              Rozetler
            </h1>
            <p className="page-subtitle mt-1">Planlama Ustası - {season} Sezonu</p>
          </div>
          <Button
            variant="outline"
            className="text-red-600 border-red-200 hover:bg-red-50"
            onClick={() => setSeasonEndDialogOpen(true)}
            data-testid="season-end-btn"
          >
            <RefreshCw size={18} className="mr-2" />
            Sene Sonu İşlemi
          </Button>
        </div>

        {/* Teachers List */}
        <div className="grid gap-4">
          {teachers.length === 0 ? (
            <div className="admin-card p-8 text-center">
              <Trophy size={48} className="mx-auto mb-4 text-slate-300" />
              <p className="text-slate-500">Henüz aktif öğretmen yok.</p>
            </div>
          ) : (
            teachers.map((teacher) => (
              <div 
                key={teacher.teacher_id}
                className="admin-card p-4 lg:p-6 hover:shadow-md transition-shadow"
                data-testid={`teacher-badge-card-${teacher.teacher_id}`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Teacher Info */}
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                      <Trophy className="text-amber-600" size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">{teacher.teacher_name}</h3>
                      <p className="text-sm text-slate-500">{season}</p>
                    </div>
                    {teacher.big_badge && (
                      <div className="bg-amber-500 text-white px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-1">
                        <Award size={16} />
                        Büyük Rozet
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-4 gap-3 lg:gap-6">
                    <div className="text-center">
                      <p className="text-xs text-slate-500 mb-1">Bu Ay</p>
                      <p className="text-xl lg:text-2xl font-bold text-amber-600">{teacher.current_month_score}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-500 mb-1">Toplam</p>
                      <p className="text-xl lg:text-2xl font-bold text-slate-800">{teacher.total_score}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-500 mb-1">Mini Rozet</p>
                      <div className="flex items-center justify-center gap-1">
                        <Target size={16} className="text-amber-500" />
                        <span className="text-xl lg:text-2xl font-bold text-slate-800">{teacher.mini_badge_count}</span>
                        <span className="text-slate-400 text-sm">/8</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-500 mb-1">Streak</p>
                      <div className="flex items-center justify-center gap-1">
                        <Flame size={16} className="text-orange-500" />
                        <span className="text-xl lg:text-2xl font-bold text-slate-800">{teacher.current_streak}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchDetail(teacher)}
                      className="flex-1 lg:flex-none"
                    >
                      <Calendar size={16} className="mr-1" />
                      Bu Ay
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchHistory(teacher)}
                      className="flex-1 lg:flex-none"
                    >
                      Geçmiş
                      <ChevronRight size={16} className="ml-1" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Detail Modal */}
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trophy className="text-amber-500" size={24} />
                {selectedTeacher?.teacher_name} - Planlama Detayı
              </DialogTitle>
            </DialogHeader>
            
            {detail && (
              <div className="space-y-6">
                <div className="bg-amber-50 rounded-lg p-4">
                  <p className="text-sm text-amber-700 font-medium mb-1">
                    {formatMonth(detail.month)} Planlaması
                  </p>
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="text-2xl font-bold text-slate-800">
                        {detail.completed_students}/{detail.total_students}
                      </span>
                      <span className="text-sm text-slate-500 ml-1">Öğrenci</span>
                    </div>
                    <div>
                      <span className="text-2xl font-bold text-slate-800">
                        {detail.completed_groups}/{detail.total_groups}
                      </span>
                      <span className="text-sm text-slate-500 ml-1">Grup</span>
                    </div>
                  </div>
                </div>

                {/* Students */}
                {detail.students && detail.students.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-slate-800 mb-3">Birebir Öğrenciler</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {detail.students.map((student) => (
                        <div 
                          key={student.id}
                          className={`flex items-center justify-between p-3 rounded-lg ${
                            student.has_planning ? 'bg-green-50' : 'bg-red-50'
                          }`}
                        >
                          <span className="text-sm font-medium text-slate-700">{student.name}</span>
                          {student.has_planning ? (
                            <div className="flex items-center gap-1 text-green-600">
                              <Check size={18} />
                              <span className="text-xs">Planlandı</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-red-600">
                              <X size={18} />
                              <span className="text-xs">Eksik</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Groups */}
                {detail.groups && detail.groups.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-slate-800 mb-3">Gruplar</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {detail.groups.map((group) => (
                        <div 
                          key={group.id}
                          className={`flex items-center justify-between p-3 rounded-lg ${
                            group.has_planning ? 'bg-green-50' : 'bg-red-50'
                          }`}
                        >
                          <div>
                            <span className="text-sm font-medium text-slate-700">{group.name}</span>
                            <p className="text-xs text-slate-500">{group.branch_name} • {group.student_count} öğrenci</p>
                          </div>
                          {group.has_planning ? (
                            <div className="flex items-center gap-1 text-green-600">
                              <Check size={18} />
                              <span className="text-xs">Planlandı</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-red-600">
                              <X size={18} />
                              <span className="text-xs">Eksik</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detail.total_students === 0 && detail.total_groups === 0 && (
                  <div className="text-center py-6 text-slate-500">
                    <Calendar size={48} className="mx-auto mb-3 text-slate-300" />
                    <p>Bu öğretmene atanmış öğrenci veya grup yok.</p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* History Modal */}
        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="text-blue-500" size={24} />
                {selectedTeacher?.teacher_name} - Geçmiş
              </DialogTitle>
            </DialogHeader>
            
            {history && (
              <div className="space-y-4">
                <p className="text-sm text-slate-500">{history.season} Sezonu</p>
                
                {history.records && history.records.length > 0 ? (
                  <div className="space-y-2">
                    {history.records.map((record) => (
                      <div 
                        key={record.id || record.month}
                        className={`flex items-center justify-between p-4 rounded-lg ${
                          record.planning_score === 10 ? 'bg-green-50 border border-green-200' :
                          record.planning_score === 5 ? 'bg-amber-50 border border-amber-200' :
                          'bg-slate-50 border border-slate-200'
                        }`}
                      >
                        <div>
                          <p className="font-medium text-slate-800">{record.month_label || record.month}</p>
                          {record.completed_at && (
                            <p className="text-xs text-slate-500">
                              Tamamlandı: {new Date(record.completed_at).toLocaleDateString('tr-TR')}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-xl font-bold ${
                            record.planning_score === 10 ? 'text-green-600' :
                            record.planning_score === 5 ? 'text-amber-600' :
                            'text-slate-400'
                          }`}>
                            +{record.planning_score}
                          </span>
                          {record.mini_badge && (
                            <div className="bg-amber-500 text-white p-1 rounded-full">
                              <Target size={16} />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    <Calendar size={48} className="mx-auto mb-3 text-slate-300" />
                    <p>Bu sezon için henüz kayıt yok.</p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Season End Confirmation */}
        <AlertDialog open={seasonEndDialogOpen} onOpenChange={setSeasonEndDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sene Sonu İşlemi</AlertDialogTitle>
              <AlertDialogDescription>
                Bu işlem mevcut sezonu arşivleyecek ve yeni sezon başlatacaktır.
                <br /><br />
                <strong>Önemli:</strong>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Mini rozetler sıfırlanacak</li>
                  <li>Streakler sıfırlanacak</li>
                  <li>Geçmiş sezon verileri silinmeyecek (arşivde kalacak)</li>
                </ul>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>İptal</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleSeasonEnd}
                className="bg-red-600 hover:bg-red-700"
              >
                Sene Sonunu Başlat
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
};

export default AdminBadges;
