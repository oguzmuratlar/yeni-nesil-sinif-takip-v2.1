import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import TeacherLayout from '../../components/layouts/TeacherLayout';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../api/axios';
import { Users, Wallet, ArrowRight, Calendar, Tent, Youtube, AlertTriangle, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import PlanningMasterCard from './PlanningMasterCard';

const TeacherDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [planningWarning, setPlanningWarning] = useState(null);
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    if (user?.teacher_id) {
      checkPlanningStatus();
    }
  }, [user]);

  const checkPlanningStatus = async () => {
    try {
      const res = await apiClient.get(`/planning-master/check/${user.teacher_id}`);
      if (res.data.show_warning) {
        setPlanningWarning(res.data);
        setShowWarning(true);
      }
    } catch (error) {
      console.error('Planlama durumu kontrol edilemedi:', error);
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

  const cards = [
    {
      title: 'Öğrencilerim',
      description: 'Öğrencilerinizi görüntüleyin ve ders takibi yapın',
      icon: Users,
      color: 'bg-teal-500',
      path: '/teacher/students',
      testId: 'teacher-dashboard-students-card'
    },
    {
      title: 'Bakiye Takip',
      description: 'Kazancınızı ve ödeme geçmişinizi görüntüleyin',
      icon: Wallet,
      color: 'bg-amber-500',
      path: '/teacher/balance',
      testId: 'teacher-dashboard-balance-card'
    },
    {
      title: 'Ders Programı',
      description: 'Ders planlamanızı görüntüleyin',
      icon: Calendar,
      color: 'bg-blue-500',
      path: '/teacher/schedule',
      testId: 'teacher-dashboard-schedule-card'
    },
    {
      title: 'Kamplarım',
      description: 'Atanan kamplarınızı görüntüleyin',
      icon: Tent,
      color: 'bg-emerald-500',
      path: '/teacher/camps',
      testId: 'teacher-dashboard-camps-card'
    },
    {
      title: 'YouTube',
      description: 'Video çekim kazançlarınız',
      icon: Youtube,
      color: 'bg-red-500',
      path: '/teacher/youtube',
      testId: 'teacher-dashboard-youtube-card'
    },
  ];

  return (
    <TeacherLayout>
      <div className="max-w-5xl mx-auto">
        {/* Planning Warning Popup */}
        {showWarning && planningWarning && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="planning-warning-popup">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative animate-in fade-in zoom-in duration-300">
              <button
                onClick={() => setShowWarning(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
              
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="text-amber-600" size={24} />
                </div>
                <h3 className="text-xl font-bold text-slate-800">Planlama Hatırlatması</h3>
              </div>
              
              <p className="text-slate-600 mb-4">
                <span className="font-semibold text-amber-600">{formatMonth(planningWarning.next_month)}</span> planını tamamlamak için{' '}
                <span className="font-bold text-red-600">{planningWarning.days_until_25th} gün</span> kaldı!
              </p>
              
              <div className="bg-amber-50 rounded-lg p-3 mb-4">
                <p className="text-sm text-amber-700">
                  Eksik: {planningWarning.missing_students > 0 && `${planningWarning.missing_students} öğrenci`}
                  {planningWarning.missing_students > 0 && planningWarning.missing_groups > 0 && ', '}
                  {planningWarning.missing_groups > 0 && `${planningWarning.missing_groups} grup`}
                </p>
              </div>
              
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowWarning(false)}
                >
                  Tamam
                </Button>
                <Button
                  className="flex-1 bg-amber-500 hover:bg-amber-600"
                  onClick={() => {
                    setShowWarning(false);
                    navigate('/teacher/students');
                  }}
                >
                  Planlamaya Git
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Header - Mobile optimized */}
        <div className="mb-8 lg:mb-12 text-center">
          <h1 className="text-3xl lg:text-5xl font-extrabold text-slate-800 mb-2 lg:mb-3" data-testid="teacher-dashboard-title">
            Öğretmen Portalı
          </h1>
          <p className="text-base lg:text-lg text-stone-600">
            Öğrencilerinizi yönetin ve dersleri takip edin
          </p>
        </div>

        {/* Cards Grid - Mobile optimized */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-6 mb-6 lg:mb-8">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.path}
                onClick={() => navigate(card.path)}
                data-testid={card.testId}
                className="teacher-card p-4 lg:p-8 cursor-pointer group active:scale-95 transition-transform"
              >
                <div className={`${card.color} w-10 h-10 lg:w-14 lg:h-14 rounded-lg lg:rounded-xl flex items-center justify-center mb-3 lg:mb-5 group-hover:scale-110 transition-transform`}>
                  <Icon size={20} className="lg:hidden text-white" />
                  <Icon size={28} className="hidden lg:block text-white" />
                </div>
                <h3 className="text-base lg:text-xl font-bold text-slate-800 mb-1 lg:mb-2">{card.title}</h3>
                <p className="text-stone-600 text-xs lg:text-sm leading-relaxed hidden sm:block">{card.description}</p>
                <div className="flex items-center gap-1 lg:gap-2 text-teal-600 font-semibold mt-2 lg:mt-4 group-hover:gap-2 lg:group-hover:gap-4 transition-all text-sm lg:text-base">
                  <span>Aç</span>
                  <ArrowRight size={16} className="lg:hidden" />
                  <ArrowRight size={18} className="hidden lg:block" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Planning Master Card */}
        <div className="mb-6 lg:mb-8">
          <PlanningMasterCard />
        </div>

        {/* Welcome Card - Mobile optimized */}
        <div className="teacher-card p-6 lg:p-10 bg-gradient-to-br from-teal-50 to-stone-50 text-center">
          <h3 className="text-xl lg:text-2xl font-bold text-slate-800 mb-2 lg:mb-3">
            Hoş Geldiniz!
          </h3>
          <p className="text-sm lg:text-base text-stone-600 max-w-2xl mx-auto leading-relaxed">
            Portalımız üzerinden öğrencilerinizin ders takibini yapabilir ve kazancınızı takip edebilirsiniz.
          </p>
        </div>
      </div>
    </TeacherLayout>
  );
};

export default TeacherDashboard;
