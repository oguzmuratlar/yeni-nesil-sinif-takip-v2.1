import React, { useState, useEffect } from 'react';
import apiClient from '../../api/axios';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Trophy, Target, Flame, Award, Check, X, ChevronRight, Calendar } from 'lucide-react';
import { toast } from 'sonner';

const PlanningMasterCard = () => {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.teacher_id) {
      fetchSummary();
    }
  }, [user]);

  const fetchSummary = async () => {
    try {
      const res = await apiClient.get(`/planning-master/summary/${user.teacher_id}`);
      setSummary(res.data);
    } catch (error) {
      console.error('Planlama Ustası özeti yüklenemedi:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDetail = async () => {
    try {
      const res = await apiClient.get(`/planning-master/detail/${user.teacher_id}`);
      setDetail(res.data);
      setDetailOpen(true);
    } catch (error) {
      toast.error('Detay yüklenemedi');
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
      <div className="teacher-card p-6 animate-pulse">
        <div className="h-6 bg-slate-200 rounded w-1/2 mb-4"></div>
        <div className="h-20 bg-slate-200 rounded"></div>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <>
      <div 
        className="teacher-card p-6 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200 cursor-pointer hover:shadow-lg transition-shadow"
        onClick={fetchDetail}
        data-testid="planning-master-card"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-amber-500 rounded-xl flex items-center justify-center">
              <Trophy className="text-white" size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Planlama Ustası</h3>
              <p className="text-sm text-slate-500">{summary.season} Sezonu</p>
            </div>
          </div>
          {summary.big_badge && (
            <div className="bg-amber-500 text-white px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-1">
              <Award size={16} />
              Büyük Rozet!
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <div className="bg-white/60 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500 mb-1">Bu Ay</p>
            <p className="text-2xl font-bold text-amber-600">{summary.current_month_score}</p>
          </div>
          <div className="bg-white/60 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500 mb-1">Toplam Puan</p>
            <p className="text-2xl font-bold text-slate-800">{summary.total_score}</p>
          </div>
          <div className="bg-white/60 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500 mb-1">Mini Rozet</p>
            <div className="flex items-center justify-center gap-1">
              <Target size={18} className="text-amber-500" />
              <span className="text-2xl font-bold text-slate-800">{summary.mini_badge_count}</span>
              <span className="text-slate-400">/8</span>
            </div>
          </div>
          <div className="bg-white/60 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500 mb-1">Streak</p>
            <div className="flex items-center justify-center gap-1">
              <Flame size={18} className="text-orange-500" />
              <span className="text-2xl font-bold text-slate-800">{summary.current_streak}</span>
              {summary.longest_streak > summary.current_streak && (
                <span className="text-xs text-slate-400">(En: {summary.longest_streak})</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">
            8 mini rozet = 1 büyük rozet
          </span>
          <div className="flex items-center gap-1 text-amber-600 font-medium">
            Detay <ChevronRight size={16} />
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="text-amber-500" size={24} />
              Planlama Ustası Detay
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
                  <p>Henüz atanmış öğrenci veya grup yok.</p>
                </div>
              )}

              <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-600">
                <p className="font-medium mb-2">Puanlama Kuralları:</p>
                <ul className="space-y-1">
                  <li>• Ayın 25'ine kadar tamamlarsan: <span className="font-bold text-green-600">+10 puan + Mini Rozet</span></li>
                  <li>• Ayın 25'i - son günü arası: <span className="font-bold text-amber-600">+5 puan</span></li>
                  <li>• Eksik planlama: <span className="font-bold text-red-600">0 puan</span></li>
                  <li>• 8 mini rozet = <span className="font-bold text-amber-500">1 Büyük Rozet</span></li>
                </ul>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PlanningMasterCard;
