import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AdminLayout from '../../components/layouts/AdminLayout';
import apiClient from '../../api/axios';
import { Calendar, Filter, X, ChevronDown, ChevronUp, ArrowUpDown, ArrowUp, ArrowDown, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Checkbox } from '../../components/ui/checkbox';
import { debounce } from 'lodash';
import { formatMoney } from '../../lib/utils';

// Ödeme durumu seçenekleri
const PAYMENT_STATUS_OPTIONS = [
  { value: 'none', label: 'Seçiniz' },
  { value: 'odedi', label: 'Ödedi' },
  { value: 'mesaj_atildi', label: 'Mesaj atıldı' },
  { value: 'hatirlatma_2', label: '2. hatırlatma yapıldı' },
  { value: 'hatirlatma_3', label: '3. hatırlatma yapıldı' },
  { value: 'parcali', label: 'Parçalı ödeyecek' },
];

// Durum kodundan adı getir
const getStatusLabel = (statusCode) => {
  const option = PAYMENT_STATUS_OPTIONS.find(o => o.value === statusCode);
  return option ? option.label : statusCode;
};

// Satır renk sınıfları
const getRowColorClass = (paymentStatus, isRisky) => {
  if (paymentStatus === 'odedi') return 'bg-green-100';
  if (isRisky) return 'bg-red-100';
  if (paymentStatus === 'mesaj_atildi') return 'bg-yellow-100';
  if (paymentStatus === 'hatirlatma_2') return 'bg-yellow-200';
  if (paymentStatus === 'hatirlatma_3') return 'bg-amber-200';
  return '';
};

const AdminMonthlyProgram = () => {
  const [programData, setProgramData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));
  const [expandedStudent, setExpandedStudent] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  
  // Filtreler - localStorage'dan yükle
  const [filterStudent, setFilterStudent] = useState(() => localStorage.getItem('mp_filterStudent') || '');
  const [filterTeachers, setFilterTeachers] = useState(() => {
    const saved = localStorage.getItem('mp_filterTeachers');
    return saved ? JSON.parse(saved) : [];
  });
  const [filterBranches, setFilterBranches] = useState(() => {
    const saved = localStorage.getItem('mp_filterBranches');
    return saved ? JSON.parse(saved) : [];
  });
  const [filterPaymentStatuses, setFilterPaymentStatuses] = useState(() => {
    const saved = localStorage.getItem('mp_filterPaymentStatuses');
    return saved ? JSON.parse(saved) : [];
  });
  const [filterPaymentDays, setFilterPaymentDays] = useState(() => {
    const saved = localStorage.getItem('mp_filterPaymentDays');
    return saved ? JSON.parse(saved) : [];
  });

  // Filtreleri localStorage'a kaydet
  useEffect(() => {
    localStorage.setItem('mp_filterStudent', filterStudent);
  }, [filterStudent]);
  
  useEffect(() => {
    localStorage.setItem('mp_filterTeachers', JSON.stringify(filterTeachers));
  }, [filterTeachers]);
  
  useEffect(() => {
    localStorage.setItem('mp_filterBranches', JSON.stringify(filterBranches));
  }, [filterBranches]);
  
  useEffect(() => {
    localStorage.setItem('mp_filterPaymentStatuses', JSON.stringify(filterPaymentStatuses));
  }, [filterPaymentStatuses]);
  
  useEffect(() => {
    localStorage.setItem('mp_filterPaymentDays', JSON.stringify(filterPaymentDays));
  }, [filterPaymentDays]);

  const months = [
    { value: '2024-12', label: 'Aralık 2024' },
    { value: '2025-01', label: 'Ocak 2025' },
    { value: '2025-02', label: 'Şubat 2025' },
    { value: '2025-03', label: 'Mart 2025' },
    { value: '2025-04', label: 'Nisan 2025' },
    { value: '2025-05', label: 'Mayıs 2025' },
    { value: '2025-06', label: 'Haziran 2025' },
    { value: '2026-01', label: 'Ocak 2026' },
    { value: '2026-02', label: 'Şubat 2026' },
    { value: '2026-03', label: 'Mart 2026' },
    { value: '2026-04', label: 'Nisan 2026' },
  ];

  useEffect(() => {
    fetchData();
  }, [selectedMonth]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/monthly-program-detailed?month=${selectedMonth}`);
      setProgramData(response.data);
    } catch (error) {
      toast.error('Veriler yüklenemedi');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Debounced not kaydetme
  const saveNote = useCallback(
    debounce(async (studentId, field, value) => {
      try {
        const params = new URLSearchParams();
        params.append('month', selectedMonth);
        params.append(field, value);
        
        await apiClient.put(`/monthly-program-notes/${studentId}?${params.toString()}`);
        toast.success('Kaydedildi', { duration: 1000 });
      } catch (error) {
        toast.error('Kaydetme başarısız');
      }
    }, 500),
    [selectedMonth]
  );

  // Fiyat override kaydetme
  const savePriceOverride = useCallback(
    debounce(async (studentId, priceOverrides) => {
      try {
        const params = new URLSearchParams();
        params.append('month', selectedMonth);
        params.append('price_overrides', JSON.stringify(priceOverrides));
        
        await apiClient.put(`/monthly-program-notes/${studentId}?${params.toString()}`);
        toast.success('Tutar kaydedildi', { duration: 1000 });
      } catch (error) {
        toast.error('Kaydetme başarısız');
      }
    }, 500),
    [selectedMonth]
  );

  const handleNoteChange = (studentId, field, value) => {
    // 'none' değeri boş string olarak kaydedilmeli
    const saveValue = (field === 'payment_status' && value === 'none') ? '' : value;
    
    setProgramData(prev => ({
      ...prev,
      students: prev.students.map(s => 
        s.student_id === studentId ? { ...s, [field]: saveValue } : s
      )
    }));
    saveNote(studentId, field, saveValue);
  };

  // Fiyat override değişikliği
  const handlePriceOverrideChange = (studentId, branchName, value) => {
    setProgramData(prev => {
      const updatedStudents = prev.students.map(s => {
        if (s.student_id === studentId) {
          const newOverrides = { ...(s.price_overrides || {}) };
          if (value === '' || value === null) {
            delete newOverrides[branchName];
          } else {
            newOverrides[branchName] = parseFloat(value) || 0;
          }
          return { ...s, price_overrides: newOverrides };
        }
        return s;
      });
      return { ...prev, students: updatedStudents };
    });
    
    // Override'ları kaydet
    const student = programData.students.find(s => s.student_id === studentId);
    const newOverrides = { ...(student?.price_overrides || {}) };
    if (value === '' || value === null) {
      delete newOverrides[branchName];
    } else {
      newOverrides[branchName] = parseFloat(value) || 0;
    }
    savePriceOverride(studentId, newOverrides);
  };

  // Öğrencinin toplam ödemesini hesapla (override'ları dikkate alarak)
  const calculateStudentTotal = (student) => {
    let total = 0;
    const branches = programData?.branches || [];
    
    for (const branch of branches) {
      const detail = student.branch_details?.[branch];
      if (detail) {
        // Override varsa onu kullan, yoksa hesaplanan değeri
        const override = student.price_overrides?.[branch];
        total += override !== undefined ? override : (detail.total || 0);
      }
    }
    return total;
  };

  // Benzersiz ödeme günleri listesi
  const uniquePaymentDays = useMemo(() => {
    if (!programData?.students) return [];
    const days = [...new Set(programData.students.map(s => s.payment_day).filter(Boolean))];
    return days.sort((a, b) => parseInt(a) - parseInt(b));
  }, [programData?.students]);

  // Benzersiz ödeme durumları listesi
  const uniquePaymentStatuses = useMemo(() => {
    if (!programData?.students) return [];
    const statuses = [...new Set(programData.students.map(s => s.payment_status).filter(Boolean))];
    return statuses.sort();
  }, [programData?.students]);

  // Sıralama fonksiyonu
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Sıralama ikonu
  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return <ArrowUpDown size={14} className="ml-1 text-slate-400" />;
    return sortConfig.direction === 'asc' 
      ? <ArrowUp size={14} className="ml-1 text-blue-600" />
      : <ArrowDown size={14} className="ml-1 text-blue-600" />;
  };

  // Filtreleme
  const filteredStudents = programData?.students?.filter(student => {
    if (filterStudent && !student.student_name.toLowerCase().includes(filterStudent.toLowerCase())) {
      return false;
    }
    // Çoklu öğretmen filtresi
    if (filterTeachers.length > 0) {
      const teacherNames = filterTeachers.map(tId => programData.teachers.find(t => t.id === tId)?.name).filter(Boolean);
      const hasAnyTeacher = teacherNames.some(tName => Object.keys(student.teacher_earnings || {}).includes(tName));
      if (!hasAnyTeacher) return false;
    }
    // Çoklu branş filtresi
    if (filterBranches.length > 0) {
      const hasAnyBranch = filterBranches.some(b => student.branch_details?.[b]);
      if (!hasAnyBranch) return false;
    }
    // Çoklu ödeme durumu filtresi
    if (filterPaymentStatuses.length > 0) {
      const status = student.payment_status || '';
      const hasEmpty = filterPaymentStatuses.includes('empty');
      const hasStatus = filterPaymentStatuses.includes(status);
      if (hasEmpty && status === '') return true;
      if (!hasStatus && !(hasEmpty && status === '')) return false;
    }
    // Çoklu ödeme günü filtresi
    if (filterPaymentDays.length > 0) {
      const day = student.payment_day || '';
      if (!filterPaymentDays.includes(day)) return false;
    }
    return true;
  }) || [];

  // Sıralama uygula
  const sortedStudents = useMemo(() => {
    if (!sortConfig.key) return filteredStudents;
    
    return [...filteredStudents].sort((a, b) => {
      let aVal, bVal;
      
      switch (sortConfig.key) {
        case 'student_name':
          aVal = a.student_name || '';
          bVal = b.student_name || '';
          break;
        case 'total':
          aVal = calculateStudentTotal(a);
          bVal = calculateStudentTotal(b);
          break;
        case 'payment_status':
          aVal = a.payment_status || '';
          bVal = b.payment_status || '';
          break;
        default:
          return 0;
      }
      
      // Sayısal değerler için
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      // Alfabetik sıralama
      const comparison = aVal.toString().localeCompare(bVal.toString(), 'tr');
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [filteredStudents, sortConfig, calculateStudentTotal]);

  const grandTotal = sortedStudents.reduce((sum, s) => sum + calculateStudentTotal(s), 0);

  // Toplam öğretmen gideri - FİLTRELENMİŞ öğrencilerin tablodaki öğretmen kazançlarından hesapla
  const totalTeacherExpense = useMemo(() => {
    let total = 0;
    for (const student of sortedStudents) {
      if (student.teacher_earnings) {
        total += Object.values(student.teacher_earnings).reduce((sum, val) => sum + (val || 0), 0);
      }
    }
    return total;
  }, [sortedStudents]);

  // Toplam kar = Ciro - Öğretmen Gideri
  const totalProfit = grandTotal - totalTeacherExpense;

  const activeFilterCount = [
    filterStudent,
    filterTeachers.length > 0 ? 'teachers' : '',
    filterBranches.length > 0 ? 'branches' : '',
    filterPaymentStatuses.length > 0 ? 'statuses' : '',
    filterPaymentDays.length > 0 ? 'days' : ''
  ].filter(Boolean).length;

  const clearFilters = () => {
    setFilterStudent('');
    setFilterTeachers([]);
    setFilterBranches([]);
    setFilterPaymentStatuses([]);
    setFilterPaymentDays([]);
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="text-center py-12">Yükleniyor...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div>
        {/* Header */}
        <div className="mb-6 lg:mb-8">
          <h1 className="page-title" data-testid="admin-monthly-program-title">
            Aylık Program
          </h1>
          <p className="page-subtitle mt-1">Öğrenci ders planları ve ödeme takibi</p>
        </div>

        {/* Ay Seçimi + Filter Toggle (Mobile) */}
        <div className="admin-card p-4 lg:p-6 mb-4 lg:mb-6">
          <div className="flex flex-col lg:flex-row lg:flex-wrap lg:items-center gap-3 lg:gap-4">
            {/* First row - always visible */}
            <div className="flex items-center gap-3">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-36 lg:w-40 h-11 lg:h-10" data-testid="month-filter">
                  <SelectValue placeholder="Ay seçin" />
                </SelectTrigger>
                <SelectContent>
                  {months.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                className="lg:hidden h-11 px-3"
              >
                <Filter size={18} className="mr-2" />
                Filtre
                {activeFilterCount > 0 && (
                  <span className="ml-2 bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </div>

            {/* Filters - Hidden on mobile by default */}
            <div className={`${showFilters ? 'flex' : 'hidden'} lg:flex flex-col lg:flex-row lg:flex-wrap lg:items-center gap-3 lg:gap-4`}>
              <div className="hidden lg:flex items-center gap-2">
                <Filter size={18} className="text-slate-500" />
                <span className="text-sm font-medium text-slate-700">Filtreler:</span>
                {activeFilterCount > 0 && (
                  <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full">
                    {activeFilterCount} aktif
                  </span>
                )}
              </div>

              <Input 
                placeholder="Öğrenci ara..." 
                value={filterStudent}
                onChange={(e) => setFilterStudent(e.target.value)}
                className="h-11 lg:h-10 lg:w-40"
                data-testid="student-filter"
              />

              <div className="grid grid-cols-2 gap-2 lg:flex lg:gap-3">
                {/* Öğretmen Filtresi - Çoklu Seçim */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-11 lg:h-10 lg:w-44 justify-between">
                      {filterTeachers.length > 0 
                        ? `${filterTeachers.length} öğretmen` 
                        : 'Tüm Öğretmenler'}
                      <ChevronDown size={16} className="ml-2" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2" align="start">
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {programData?.teachers?.map(t => (
                        <label key={t.id} className="flex items-center gap-2 p-2 hover:bg-slate-100 rounded cursor-pointer">
                          <Checkbox
                            checked={filterTeachers.includes(t.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setFilterTeachers([...filterTeachers, t.id]);
                              } else {
                                setFilterTeachers(filterTeachers.filter(id => id !== t.id));
                              }
                            }}
                          />
                          <span className="text-sm">{t.name}</span>
                        </label>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Branş Filtresi - Çoklu Seçim */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-11 lg:h-10 lg:w-40 justify-between">
                      {filterBranches.length > 0 
                        ? `${filterBranches.length} branş` 
                        : 'Tüm Branşlar'}
                      <ChevronDown size={16} className="ml-2" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2" align="start">
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {programData?.branches?.map(b => (
                        <label key={b} className="flex items-center gap-2 p-2 hover:bg-slate-100 rounded cursor-pointer">
                          <Checkbox
                            checked={filterBranches.includes(b)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setFilterBranches([...filterBranches, b]);
                              } else {
                                setFilterBranches(filterBranches.filter(branch => branch !== b));
                              }
                            }}
                          />
                          <span className="text-sm">{b}</span>
                        </label>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Ödeme Durumu Filtresi - Çoklu Seçim */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-11 lg:h-10 lg:w-44 justify-between">
                      {filterPaymentStatuses.length > 0 
                        ? `${filterPaymentStatuses.length} durum` 
                        : 'Tüm Durumlar'}
                      <ChevronDown size={16} className="ml-2" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-60 p-2" align="start">
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      <label className="flex items-center gap-2 p-2 hover:bg-slate-100 rounded cursor-pointer">
                        <Checkbox
                          checked={filterPaymentStatuses.includes('empty')}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setFilterPaymentStatuses([...filterPaymentStatuses, 'empty']);
                            } else {
                              setFilterPaymentStatuses(filterPaymentStatuses.filter(s => s !== 'empty'));
                            }
                          }}
                        />
                        <span className="text-sm">Boş (Girilmemiş)</span>
                      </label>
                      {PAYMENT_STATUS_OPTIONS.filter(o => o.value !== 'none').map(opt => (
                        <label key={opt.value} className="flex items-center gap-2 p-2 hover:bg-slate-100 rounded cursor-pointer">
                          <Checkbox
                            checked={filterPaymentStatuses.includes(opt.value)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setFilterPaymentStatuses([...filterPaymentStatuses, opt.value]);
                              } else {
                                setFilterPaymentStatuses(filterPaymentStatuses.filter(s => s !== opt.value));
                              }
                            }}
                          />
                          <span className="text-sm">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Ödeme Günü Filtresi - Çoklu Seçim */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-11 lg:h-10 lg:w-40 justify-between">
                      {filterPaymentDays.length > 0 
                        ? `${filterPaymentDays.length} gün` 
                        : 'Tüm Günler'}
                      <ChevronDown size={16} className="ml-2" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2" align="start">
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {uniquePaymentDays.map(day => (
                        <label key={day} className="flex items-center gap-2 p-2 hover:bg-slate-100 rounded cursor-pointer">
                          <Checkbox
                            checked={filterPaymentDays.includes(day)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setFilterPaymentDays([...filterPaymentDays, day]);
                              } else {
                                setFilterPaymentDays(filterPaymentDays.filter(d => d !== day));
                              }
                            }}
                          />
                          <span className="text-sm">Ayın {day}. günü</span>
                        </label>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {activeFilterCount > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={clearFilters}
                  className="h-10 text-slate-600"
                >
                  <X size={16} className="mr-1" />
                  Temizle
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-4 lg:mb-6">
          <div className="admin-card p-3 lg:p-4" data-testid="student-count-card">
            <p className="text-xs lg:text-sm text-slate-500">Öğrenci Sayısı</p>
            <p className="text-xl lg:text-2xl font-bold text-blue-600">{filteredStudents.length}</p>
          </div>
          <div className="admin-card p-3 lg:p-4" data-testid="total-revenue-card">
            <p className="text-xs lg:text-sm text-slate-500">Toplam Ciro</p>
            <p className="text-xl lg:text-2xl font-bold text-green-600">{formatMoney(grandTotal, false)} ₺</p>
          </div>
          <div className="admin-card p-3 lg:p-4" data-testid="total-expense-card">
            <p className="text-xs lg:text-sm text-slate-500">Öğretmen Gideri</p>
            <p className="text-xl lg:text-2xl font-bold text-orange-600">{formatMoney(totalTeacherExpense, false)} ₺</p>
          </div>
          <div className="admin-card p-3 lg:p-4" data-testid="total-profit-card">
            <p className="text-xs lg:text-sm text-slate-500">Toplam Kar</p>
            <p className={`text-xl lg:text-2xl font-bold ${totalProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatMoney(totalProfit, false)} ₺
            </p>
          </div>
        </div>

        {/* Data Display */}
        {sortedStudents.length === 0 ? (
          <div className="admin-card p-8 lg:p-12 text-center">
            <Calendar size={48} className="mx-auto mb-4 text-slate-400" />
            <p className="text-slate-600 text-lg">
              {activeFilterCount > 0 ? 'Filtrelere uygun veri bulunamadı' : 'Bu dönem için veri bulunamadı'}
            </p>
            {activeFilterCount > 0 && (
              <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4">
                Filtreleri Temizle
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="lg:hidden space-y-3">
              {sortedStudents.map((student) => (
                <div 
                  key={student.student_id} 
                  className={`admin-card overflow-hidden ${getRowColorClass(student.payment_status, student.is_risky)}`}
                  data-testid={`student-row-${student.student_id}`}
                >
                  {/* Card Header - Always Visible */}
                  <div 
                    className="p-4 cursor-pointer active:bg-slate-50"
                    onClick={() => setExpandedStudent(expandedStudent === student.student_id ? null : student.student_id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-800 truncate">{student.student_name}</h3>
                          {student.is_risky && student.payment_status !== 'odedi' && (
                            <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Riskli</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500">{student.parent_name}</p>
                        <div className="flex items-center gap-2 mt-2">
                          {student.payment_day && (
                            <span className="bg-amber-50 text-amber-700 text-xs px-2 py-1 rounded">
                              Ayın {student.payment_day}. günü
                            </span>
                          )}
                          <span className="text-xs text-slate-500">{student.courses || '-'}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end ml-3">
                        <p className="font-bold text-green-600">{formatMoney(calculateStudentTotal(student), false)} ₺</p>
                        {expandedStudent === student.student_id ? (
                          <ChevronUp size={20} className="text-slate-400 mt-2" />
                        ) : (
                          <ChevronDown size={20} className="text-slate-400 mt-2" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {expandedStudent === student.student_id && (
                    <div className="border-t border-slate-100 p-4 bg-slate-50 space-y-4">
                      {/* Editable Fields */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">Not</label>
                          <Input
                            value={student.note || ''}
                            onChange={(e) => handleNoteChange(student.student_id, 'note', e.target.value)}
                            className="h-10 text-sm"
                            placeholder="Not..."
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">Ödeme Durumu</label>
                          <Select 
                            value={student.payment_status || 'none'} 
                            onValueChange={(value) => handleNoteChange(student.student_id, 'payment_status', value)}
                          >
                            <SelectTrigger className="h-10 text-sm" data-testid={`mobile-payment-status-${student.student_id}`}>
                              <SelectValue placeholder="Seçiniz" />
                            </SelectTrigger>
                            <SelectContent>
                              {PAYMENT_STATUS_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Branch Details */}
                      {programData?.branches?.map(branch => {
                        const detail = student.branch_details?.[branch];
                        if (!detail || !detail.total) return null;
                        const hasOverride = student.price_overrides?.[branch] !== undefined;
                        const displayTotal = hasOverride ? student.price_overrides[branch] : detail.total;
                        return (
                          <div key={branch} className="bg-white p-3 rounded-lg">
                            <p className="text-sm font-semibold text-blue-700 mb-2">{branch}</p>
                            <div className="grid grid-cols-4 gap-2 text-xs">
                              <div>
                                <span className="text-slate-500">Tarih:</span>
                                <p className="text-slate-700">{detail.dates || '-'}</p>
                              </div>
                              <div>
                                <span className="text-slate-500">Birim:</span>
                                <p className="text-slate-700">{detail.unit_price}₺</p>
                              </div>
                              <div>
                                <span className="text-slate-500">Hesaplanan:</span>
                                <p className={`${hasOverride ? 'line-through text-slate-400' : 'text-slate-700'}`}>{detail.total}₺</p>
                              </div>
                              <div>
                                <span className="text-slate-500">Tutar:</span>
                                <Input
                                  type="number"
                                  value={hasOverride ? student.price_overrides[branch] : ''}
                                  onChange={(e) => handlePriceOverrideChange(student.student_id, branch, e.target.value)}
                                  placeholder="-"
                                  className={`h-7 text-sm w-24 ${hasOverride ? 'border-orange-400 bg-orange-50' : ''}`}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Teacher Earnings */}
                      {Object.keys(student.teacher_earnings || {}).length > 0 && (
                        <div className="bg-emerald-50 p-3 rounded-lg">
                          <p className="text-sm font-semibold text-emerald-700 mb-2">Öğretmen Kazançları</p>
                          <div className="grid grid-cols-2 gap-2">
                            {Object.entries(student.teacher_earnings).map(([teacher, earning]) => (
                              <div key={teacher} className="flex justify-between text-sm">
                                <span className="text-slate-600">{teacher}:</span>
                                <span className="font-semibold text-emerald-600">{formatMoney(earning, false)}₺</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block admin-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="text-left py-3 px-3 font-semibold text-slate-700 whitespace-nowrap sticky left-0 bg-slate-100 z-10">Not</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                        <button 
                          onClick={() => handleSort('payment_status')} 
                          className="flex items-center hover:text-blue-600 transition-colors"
                        >
                          Ödeme Durumu {getSortIcon('payment_status')}
                        </button>
                      </th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">Hesap Adı</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">Dersler</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                        <button 
                          onClick={() => handleSort('student_name')} 
                          className="flex items-center hover:text-blue-600 transition-colors"
                        >
                          Öğrenci {getSortIcon('student_name')}
                        </button>
                      </th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">Veli</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">Ödeme Günü</th>
                      <th className="text-right py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                        <button 
                          onClick={() => handleSort('total')} 
                          className="flex items-center justify-end hover:text-blue-600 transition-colors ml-auto"
                        >
                          Toplam {getSortIcon('total')}
                        </button>
                      </th>
                      
                      {programData?.branches?.map(branch => (
                        <th key={branch} colSpan={4} className="text-center py-3 px-3 font-semibold text-blue-700 bg-blue-50 border-l whitespace-nowrap">
                          {branch}
                        </th>
                      ))}
                      
                      {programData?.teachers?.map(teacher => (
                        <th key={teacher.id} className="text-center py-3 px-3 font-semibold text-emerald-700 bg-emerald-50 border-l whitespace-nowrap">
                          {teacher.name}
                        </th>
                      ))}
                    </tr>
                    
                    <tr className="bg-slate-50">
                      <th colSpan={8}></th>
                      {programData?.branches?.map(branch => (
                        <React.Fragment key={`sub-${branch}`}>
                          <th className="text-center py-2 px-2 text-xs text-slate-500 border-l">Tarih</th>
                          <th className="text-center py-2 px-2 text-xs text-slate-500">Birim</th>
                          <th className="text-center py-2 px-2 text-xs text-slate-500">Hesaplanan</th>
                          <th className="text-center py-2 px-2 text-xs text-orange-600 bg-orange-50">Özel Tutar</th>
                        </React.Fragment>
                      ))}
                      {programData?.teachers?.map(teacher => (
                        <th key={`sub-t-${teacher.id}`} className="text-center py-2 px-2 text-xs text-slate-500 border-l">Kazanç</th>
                      ))}
                    </tr>
                  </thead>
                  
                  <tbody>
                    {sortedStudents.map((student) => {
                      const rowColorClass = getRowColorClass(student.payment_status, student.is_risky);
                      return (
                        <tr 
                          key={student.student_id} 
                          className={`border-b hover:brightness-95 transition-all ${rowColorClass}`}
                          data-testid={`desktop-row-${student.student_id}`}
                        >
                          <td className={`py-2 px-2 sticky left-0 z-10 ${rowColorClass || 'bg-white'}`}>
                            <Input
                              value={student.note || ''}
                              onChange={(e) => handleNoteChange(student.student_id, 'note', e.target.value)}
                              className="w-28 h-8 text-xs"
                              placeholder="Not..."
                            />
                          </td>
                          <td className="py-2 px-2">
                            <Select 
                              value={student.payment_status || 'none'} 
                              onValueChange={(value) => handleNoteChange(student.student_id, 'payment_status', value)}
                            >
                              <SelectTrigger className="w-36 h-8 text-xs" data-testid={`payment-status-select-${student.student_id}`}>
                                <SelectValue placeholder="Seçiniz" />
                              </SelectTrigger>
                              <SelectContent>
                                {PAYMENT_STATUS_OPTIONS.map(opt => (
                                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-2 px-2 text-xs text-slate-600 whitespace-nowrap">{student.account_name || '-'}</td>
                          <td className="py-2 px-2 text-xs"><span className="text-blue-600">{student.courses || '-'}</span></td>
                          <td className="py-2 px-2 font-medium text-slate-800 whitespace-nowrap">
                            {student.student_name}
                            {student.is_risky && student.payment_status !== 'odedi' && (
                              <span className="ml-2 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Riskli</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-xs text-slate-600 whitespace-nowrap">{student.parent_name}</td>
                          <td className="py-2 px-2 text-xs text-slate-700 whitespace-nowrap">
                            {student.payment_day ? (
                              <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded font-medium">
                                Ayın {student.payment_day}. günü
                              </span>
                            ) : '-'}
                          </td>
                          <td className="py-2 px-2 text-right font-bold text-green-600 whitespace-nowrap">
                            {formatMoney(calculateStudentTotal(student), false)} ₺
                          </td>
                          
                          {programData?.branches?.map(branch => {
                            const detail = student.branch_details?.[branch];
                            const hasOverride = student.price_overrides?.[branch] !== undefined;
                            return (
                              <React.Fragment key={`${student.student_id}-${branch}`}>
                                <td className="py-2 px-2 text-xs text-slate-600 border-l whitespace-nowrap">{detail?.dates || '-'}</td>
                                <td className="py-2 px-2 text-xs text-center text-slate-600">{detail?.unit_price ? `${formatMoney(detail.unit_price, false)}₺` : '-'}</td>
                                <td className={`py-2 px-2 text-xs text-center ${hasOverride ? 'line-through text-slate-400' : 'text-slate-600'}`}>
                                  {detail?.total ? `${formatMoney(detail.total, false)}₺` : '-'}
                                </td>
                                <td className="py-2 px-2">
                                  <Input
                                    type="number"
                                    value={hasOverride ? student.price_overrides[branch] : ''}
                                    onChange={(e) => handlePriceOverrideChange(student.student_id, branch, e.target.value)}
                                    placeholder="-"
                                    className={`w-24 h-7 text-sm text-center ${hasOverride ? 'border-orange-400 bg-orange-50' : ''}`}
                                  />
                                </td>
                              </React.Fragment>
                            );
                          })}
                          
                          {programData?.teachers?.map(teacher => {
                            const earning = student.teacher_earnings?.[teacher.name];
                            return (
                              <td key={`${student.student_id}-t-${teacher.id}`} className="py-2 px-2 text-xs text-center font-medium text-emerald-600 border-l">
                                {earning ? `${formatMoney(earning, false)}₺` : '-'}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Teacher Totals */}
        {programData?.teacher_totals && Object.keys(programData.teacher_totals).length > 0 && (
          <div className="admin-card p-4 lg:p-6 mt-4 lg:mt-6">
            <h2 className="text-base lg:text-lg font-bold text-slate-800 mb-3 lg:mb-4">Öğretmen Kazanç Toplamları</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3 lg:gap-4">
              {Object.entries(programData.teacher_totals).map(([teacherName, total]) => (
                <div key={teacherName} className="p-3 lg:p-4 bg-emerald-50 rounded-lg">
                  <p className="text-xs lg:text-sm text-slate-600 truncate">{teacherName}</p>
                  <p className="text-lg lg:text-xl font-bold text-emerald-600">{formatMoney(total, false)} ₺</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminMonthlyProgram;
