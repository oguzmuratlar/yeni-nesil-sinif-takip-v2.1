import React, { useState, useEffect } from 'react';
import apiClient from '../../api/axios';
import { useAuth } from '../../contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Trophy, Target, Flame, Award, Check, X, ChevronRight, Calendar } from 'lucide-react';
import { toast } from 'sonner';

const MONTH_NAMES = {
  '01': 'Ocak', '02': 'Şubat', '03': 'Mart', '04': 'Nisan',
  '05': 'Mayıs', '06': 'Haziran', '07': 'Temmuz', '08': 'Ağustos',
  '09': 'Eylül', '10': 'Ekim', '11': 'Kasım', '12': 'Aralık'
};

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

  const getMonthName = (monthStr) => {
    if (!monthStr) return '';
    const month = monthStr.split('-')[1];
    return MONTH_NAMES[month] || month;
  };

  const formatMonth = (monthStr) => {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    return `${MONTH_NAMES[month] || month} ${year}`;
  };

  if (loading) {
    return (
      <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-4 animate-pulse">
        <div className="h-5 bg-amber-200/50 rounded w-32"></div>
      </div>
    );
  }

  if (!summary) return null;

  const nextMonthName = getMonthName(summary.next_month);

  return (
    <>
      {/* Minimal Card */}
      <div 
        className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 cursor-pointer hover:shadow-md transition-all"
        onClick={fetchDetail}
        data-testid="planning-master-card"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center">
              <Trophy className="text-white" size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800">Planlama Ustası</h3>
              <p className="text-xs text-slate-500">{nextMonthName}: {summary.next_month_score} puan</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Stats inline */}
            <div className="hidden sm:flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <Target size={16} className="text-amber-500" />
                <span className="font-semibold text-slate-700">{summary.mini_badge_count}/8</span>
              </div>
              <div className="flex items-center gap-1">
                <Flame size={16} className="text-orange-500" />
                <span className="font-semibold text-slate-700">{summary.current_streak}</span>
              </div>
              {summary.big_badge && (
                <div className="bg-amber-500 text-white px-2 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1">
                  <Award size={12} />
                  Büyük Rozet
                </div>
              )}
            </div>
            <ChevronRight size={20} className="text-amber-500" />
          </div>
        </div>

        {/* Mobile stats */}
        <div className="flex sm:hidden items-center gap-4 mt-3 pt-3 border-t border-amber-200/50 text-sm">
          <div className="flex items-center gap-1">
            <Target size={14} className="text-amber-500" />
            <span className="text-slate-600">Rozet: {summary.mini_badge_count}/8</span>
          </div>
          <div className="flex items-center gap-1">
            <Flame size={14} className="text-orange-500" />
            <span className="text-slate-600">Streak: {summary.current_streak}</span>
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
