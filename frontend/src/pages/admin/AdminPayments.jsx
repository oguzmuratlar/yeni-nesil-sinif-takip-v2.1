import React, { useState, useEffect, useMemo } from 'react';
import AdminLayout from '../../components/layouts/AdminLayout';
import apiClient from '../../api/axios';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../../components/ui/command';
import { ExpandableText } from '../../components/ui/expandable-text';
import { Plus, ArrowUpCircle, ArrowDownCircle, Filter, X, Edit, Trash2, Check, ChevronsUpDown, User } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatMoney } from '../../lib/utils';
import { formatDateTurkish } from '../../lib/dateUtils';
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

const AdminPayments = () => {
  const [payments, setPayments] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [cashboxes, setCashboxes] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState('income');
  const [editingPayment, setEditingPayment] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedCashbox, setSelectedCashbox] = useState('all');
  const [selectedExpenseCategory, setSelectedExpenseCategory] = useState('all');
  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState(null);
  const [selectedStudentFilter, setSelectedStudentFilter] = useState('');
  const [studentFilterOpen, setStudentFilterOpen] = useState(false);
  const [studentFilterSearch, setStudentFilterSearch] = useState('');
  const [formStudentOpen, setFormStudentOpen] = useState(false);
  const [formStudentSearch, setFormStudentSearch] = useState('');
  const [studentCourses, setStudentCourses] = useState([]);
  const [monthsRaw, setMonthsRaw] = useState([]);
  const [selectedBankFilter, setSelectedBankFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc' = baştan sona, 'desc' = sondan başa
  const [emptyFieldConfirm, setEmptyFieldConfirm] = useState({ open: false, fields: [] });
  const [activeTab, setActiveTab] = useState('all');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState({ total_income: 0, total_expense: 0 });
  const [newPayment, setNewPayment] = useState({
    amount: '',
    date: new Date().toISOString().split('T')[0],
    student_id: '',
    teacher_id: '',
    branch_id: '',
    cashbox_id: '',
    bank_account_id: '',
    description: '',
    expense_category: '',
    payment_method: '',
    tax_amount: '',
    publisher_id: ''
  });
  const [publishers, setPublishers] = useState([]);
  const [sponsorEnabled, setSponsorEnabled] = useState(false);

  useEffect(() => {
    fetchReferenceData();
    fetchMonths();
  }, []);

  useEffect(() => {
    fetchPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, selectedCashbox, selectedStudentFilter, selectedExpenseCategory, selectedTeacherFilter, selectedBankFilter, sortOrder, activeTab, pageSize, currentPage]);

  // Custom filter function for combo search (student name + parent name)
  const filterStudents = (searchTerm, studentList) => {
    if (!searchTerm.trim()) return studentList;
    
    const searchWords = searchTerm.toLowerCase().trim().split(/\s+/);
    
    return studentList.filter(student => {
      const studentName = (student.name || '').toLowerCase();
      const parentName = (student.parent_name || '').toLowerCase();
      const combinedText = `${studentName} ${parentName}`;
      
      // All search words must match somewhere in student name or parent name
      return searchWords.every(word => combinedText.includes(word));
    });
  };

  // Filtered students for filter dropdown
  const filteredStudentsForFilter = useMemo(() => {
    return filterStudents(studentFilterSearch, students.filter(s => s.status === 'active'));
  }, [students, studentFilterSearch]);

  // Filtered students for form dropdown
  const filteredStudentsForForm = useMemo(() => {
    return filterStudents(formStudentSearch, students.filter(s => s.status === 'active'));
  }, [students, formStudentSearch]);

  // Get display label for student (name - parent_name)
  const getStudentDisplayLabel = (student) => {
    if (!student) return '';
    return student.parent_name 
      ? `${student.name} - ${student.parent_name}`
      : student.name;
  };

  // Get student's branches
  const getStudentBranches = (studentId) => {
    const courses = studentCourses.filter(c => c.student_id === studentId);
    const branchNames = courses.map(c => {
      const branch = branches.find(b => b.id === c.branch_id);
      return branch?.name;
    }).filter(Boolean);
    return [...new Set(branchNames)]; // Remove duplicates
  };

  const fetchReferenceData = async () => {
    try {
      const [studentsRes, teachersRes, branchesRes, cashboxesRes, banksRes] = await Promise.all([
        apiClient.get('/students'),
        apiClient.get('/teachers'),
        apiClient.get('/branches'),
        apiClient.get('/cashboxes'),
        apiClient.get('/bank-accounts')
      ]);
      setStudents(studentsRes.data);
      setTeachers(teachersRes.data);
      setBranches(branchesRes.data);
      setCashboxes(cashboxesRes.data?.cashboxes || []);
      setBankAccounts(banksRes.data);
    } catch (error) {
      toast.error('Referans veriler yüklenemedi');
    }
    try {
      const r = await apiClient.get('/system-settings/sponsor-status');
      setSponsorEnabled(!!r.data.enabled);
      if (r.data.enabled) {
        const pubs = await apiClient.get('/publishers');
        setPublishers(pubs.data);
      }
    } catch (error) {
      // sponsor kapalıysa sorun değil
    }
    // Öğrenci kursları (branş etiketleri için) - liste/formu bloklamadan ayrı yükle
    try {
      const coursesRes = await apiClient.get('/student-courses');
      setStudentCourses(coursesRes.data);
    } catch (error) {
      // branş etiketleri yüklenemezse sorun değil
    }
  };

  const fetchMonths = async () => {
    try {
      const res = await apiClient.get('/payments/months');
      setMonthsRaw(res.data || []);
    } catch (error) {
      // sessizce geç
    }
  };

  const fetchPayments = async () => {
    try {
      const params = new URLSearchParams();
      params.append('tab', activeTab);
      params.append('page', currentPage);
      params.append('page_size', pageSize);
      params.append('sort_order', sortOrder);
      if (selectedMonth) params.append('month', selectedMonth);
      if (selectedCashbox && selectedCashbox !== 'all') params.append('cashbox_id', selectedCashbox);
      if (selectedStudentFilter) params.append('student_id', selectedStudentFilter);
      if (selectedExpenseCategory && selectedExpenseCategory !== 'all') params.append('expense_category', selectedExpenseCategory);
      if (selectedTeacherFilter && selectedTeacherFilter !== 'all') params.append('teacher_id', selectedTeacherFilter);
      if (selectedBankFilter && selectedBankFilter !== 'all') params.append('bank_account_id', selectedBankFilter);

      const res = await apiClient.get(`/payments/paginated?${params.toString()}`);
      setPayments(res.data.items || []);
      setTotal(res.data.total || 0);
      setTotalPages(res.data.total_pages || 1);
      setSummary(res.data.summary || { total_income: 0, total_expense: 0 });
    } catch (error) {
      toast.error('Ödemeler yüklenemedi');
    }
  };

  // Ödemelerdeki benzersiz aylar (sunucudan)
  const availableMonths = useMemo(() => {
    const monthNames = {
      '01': 'Ocak', '02': 'Şubat', '03': 'Mart', '04': 'Nisan',
      '05': 'Mayıs', '06': 'Haziran', '07': 'Temmuz', '08': 'Ağustos',
      '09': 'Eylül', '10': 'Ekim', '11': 'Kasım', '12': 'Aralık'
    };
    return monthsRaw.map(m => {
      const [year, month] = m.split('-');
      return {
        value: m,
        label: `${monthNames[month]} ${year}`
      };
    });
  }, [monthsRaw]);

  // Gider kategorileri
  const expenseCategories = ['Maaş', 'Kira', 'Reklam', 'Ofis', 'Vergi', 'Sermaye', 'Diğer'];

  const doSavePayment = async () => {
    try {
      const paymentData = {
        ...newPayment,
        amount: parseFloat(newPayment.amount),
        payment_type: dialogType === 'income' ? 'student_payment' : 
                      newPayment.expense_category === 'Maaş' ? 'teacher_payment' : 'expense',
        tax_amount: newPayment.tax_amount ? parseFloat(newPayment.tax_amount) : null
      };
      
      if (editingPayment) {
        await apiClient.put(`/payments/${editingPayment.id}`, paymentData);
        toast.success('Ödeme güncellendi');
      } else {
        await apiClient.post('/payments', paymentData);
        toast.success('Ödeme eklendi');
      }
      
      setEmptyFieldConfirm({ open: false, fields: [] });
      closeDialog();
      fetchPayments();
      fetchMonths();
    } catch (error) {
      toast.error(error.response?.data?.detail || (editingPayment ? 'Güncelleme başarısız' : 'Ödeme eklenemedi'));
    }
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    
    // Gelir için branşa göre kasayı otomatik eşleştir (varsa)
    if (dialogType === 'income' && !newPayment.cashbox_id && newPayment.branch_id) {
      const selectedBranch = branches.find(b => b.id === newPayment.branch_id);
      const matchingCashbox = cashboxes.find(c => 
        c.branch_id === newPayment.branch_id || c.name?.toLowerCase() === selectedBranch?.name?.toLowerCase()
      );
      if (matchingCashbox) {
        newPayment.cashbox_id = matchingCashbox.id;
      }
    }
    
    // Maaş ödemelerinde ödeme şekli zorunlu (bu zorunluluklar korunur)
    if (dialogType === 'expense' && newPayment.expense_category === 'Maaş') {
      if (!newPayment.payment_method) {
        toast.error('Maaş ödemelerinde ödeme şekli zorunludur');
        return;
      }
      if (newPayment.payment_method === 'resmi' && !newPayment.tax_amount) {
        toast.error('Resmi ödemede vergi tutarı zorunludur');
        return;
      }
    }
    
    // Branş/Kasa ve Banka hesabı artık opsiyonel - boşsa onay iste
    const emptyFields = [];
    if (!newPayment.cashbox_id) emptyFields.push('Branş / Kasa');
    if (!newPayment.bank_account_id) emptyFields.push('Banka hesabı');
    
    if (emptyFields.length > 0) {
      setEmptyFieldConfirm({ open: true, fields: emptyFields });
      return;
    }
    
    await doSavePayment();
  };

  const handleDeletePayment = async () => {
    if (!paymentToDelete) return;
    
    try {
      await apiClient.delete(`/payments/${paymentToDelete.id}`);
      toast.success('Ödeme silindi');
      setDeleteDialogOpen(false);
      setPaymentToDelete(null);
      fetchPayments();
      fetchMonths();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Silme işlemi başarısız');
    }
  };

  const openDialog = (type, payment = null) => {
    setDialogType(type);
    setEditingPayment(payment);
    
    if (payment) {
      setNewPayment({
        amount: payment.amount.toString(),
        date: payment.date,
        student_id: payment.student_id || '',
        teacher_id: payment.teacher_id || '',
        branch_id: payment.branch_id || '',
        cashbox_id: payment.cashbox_id || '',
        bank_account_id: payment.bank_account_id || '',
        description: payment.description || '',
        expense_category: payment.expense_category || '',
        payment_method: payment.payment_method || '',
        tax_amount: payment.tax_amount ? payment.tax_amount.toString() : ''
      });
    } else {
      setNewPayment({
        amount: '',
        date: new Date().toISOString().split('T')[0],
        student_id: '',
        teacher_id: '',
        branch_id: '',
        cashbox_id: '',
        bank_account_id: '',
        description: '',
        expense_category: '',
        payment_method: '',
        tax_amount: ''
      });
    }
    
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingPayment(null);
    setNewPayment({
      amount: '',
      date: new Date().toISOString().split('T')[0],
      student_id: '',
      teacher_id: '',
      branch_id: '',
      cashbox_id: '',
      bank_account_id: '',
      description: '',
      expense_category: ''
    });
  };

  const totalIncome = summary.total_income;
  const totalExpense = summary.total_expense;

  // Sayfalama - filtre, sekme veya sayfa boyutu değişince ilk sayfaya dön
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedMonth, selectedCashbox, selectedStudentFilter, selectedExpenseCategory, selectedTeacherFilter, selectedBankFilter, sortOrder, activeTab, pageSize]);

  const safePage = Math.min(currentPage, totalPages);
  const pageStart = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageEnd = Math.min(safePage * pageSize, total);

  const PaginationFooter = () => (
    total > 0 && (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-100" data-testid="payments-pagination">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">Sayfa başına:</span>
          <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(parseInt(v))}>
            <SelectTrigger className="h-9 w-20 text-sm" data-testid="page-size-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50, 100].map(size => (
                <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-slate-500 ml-2">
            {pageStart}-{pageEnd} / {total}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            disabled={safePage <= 1}
            onClick={() => setCurrentPage(safePage - 1)}
            data-testid="page-prev-btn"
          >
            Önceki
          </Button>
          <span className="text-sm text-slate-600 px-2" data-testid="page-indicator">
            {safePage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            disabled={safePage >= totalPages}
            onClick={() => setCurrentPage(safePage + 1)}
            data-testid="page-next-btn"
          >
            Sonraki
          </Button>
        </div>
      </div>
    )
  );

  const renderPaymentItem = (payment, bgClass) => {
    const isIncome = payment.payment_type === 'student_payment' || payment.payment_type === 'transfer_in';
    
    return (
      <div key={payment.id} className={`flex items-center justify-between p-3 lg:p-4 ${bgClass} rounded-lg`}>
        <div className="min-w-0 flex-1 mr-3">
          <p className="font-semibold text-slate-800 text-sm lg:text-base">{formatDateTurkish(payment.date)}</p>
          <p className="text-xs lg:text-sm text-slate-600 truncate">
            {payment.payment_type === 'student_payment' ? `Öğrenci: ${payment.student_name || 'Bilinmiyor'}` : 
             payment.payment_type === 'teacher_payment' ? `Öğretmen: ${payment.teacher_name || 'Bilinmiyor'}` : 
             payment.payment_type === 'transfer_in' ? 'Transfer Girişi' :
             payment.payment_type === 'transfer_out' ? 'Transfer Çıkışı' :
             payment.expense_category || 'Gider'}
          </p>
          <div className="flex gap-2 mt-1">
            {payment.cashbox_name && (
              <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">{payment.cashbox_name}</span>
            )}
            {payment.branch_name && (
              <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">{payment.branch_name}</span>
            )}
          </div>
          {payment.description && (
            <div className="text-xs text-slate-500 mt-1">
              <ExpandableText text={payment.description} maxLength={40} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <p className={`font-bold text-sm lg:text-base whitespace-nowrap ${isIncome ? 'text-green-600' : 'text-red-600'}`}>
            {isIncome ? '+' : '-'}{formatMoney(payment.amount)} ₺
          </p>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openDialog(isIncome ? 'income' : 'expense', payment)}
              className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600"
            >
              <Edit size={16} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPaymentToDelete(payment);
                setDeleteDialogOpen(true);
              }}
              className="h-8 w-8 p-0 text-slate-500 hover:text-red-600"
            >
              <Trash2 size={16} />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <AdminLayout>
      <div>
        {/* Header */}
        <div className="mb-6 lg:mb-8">
          <h1 className="page-title" data-testid="admin-payments-title">
            Ödemeler
          </h1>
          <p className="page-subtitle mt-1">Gelen ve giden ödemeleri yönetin</p>
        </div>

        {/* Summary Cards - Mobile optimized */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-6 mb-6 lg:mb-8">
          <div className="admin-card p-4 lg:p-6">
            <p className="text-xs lg:text-sm text-slate-500 mb-1">Toplam Gelir</p>
            <p className="text-2xl lg:text-3xl font-bold text-green-600">{formatMoney(totalIncome)} ₺</p>
          </div>
          <div className="admin-card p-4 lg:p-6">
            <p className="text-xs lg:text-sm text-slate-500 mb-1">Toplam Gider</p>
            <p className="text-2xl lg:text-3xl font-bold text-red-600">{formatMoney(totalExpense)} ₺</p>
          </div>
          <div className="admin-card p-4 lg:p-6">
            <p className="text-xs lg:text-sm text-slate-500 mb-1">Net</p>
            <p className={`text-2xl lg:text-3xl font-bold ${(totalIncome - totalExpense) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              {formatMoney(totalIncome - totalExpense)} ₺
            </p>
          </div>
        </div>

        <div className="admin-card p-4 lg:p-6">
          {/* Header with actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 lg:mb-6">
            <h2 className="text-lg lg:text-xl font-bold text-slate-800">Ödeme Geçmişi</h2>
            <div className="grid grid-cols-2 sm:flex gap-2">
              <Button
                onClick={() => openDialog('income')}
                data-testid="add-income-btn"
                className="bg-green-600 hover:bg-green-700 h-11 lg:h-10 text-sm"
              >
                <ArrowDownCircle size={18} className="mr-1.5" />
                <span className="hidden sm:inline">Ödeme </span>Girişi
              </Button>
              <Button
                onClick={() => openDialog('expense')}
                data-testid="add-expense-btn"
                className="bg-red-600 hover:bg-red-700 h-11 lg:h-10 text-sm"
              >
                <ArrowUpCircle size={18} className="mr-1.5" />
                <span className="hidden sm:inline">Para </span>Çıkışı
              </Button>
            </div>
          </div>

          {/* Filters - Mobile stacked */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 mb-4 lg:mb-6 p-3 lg:p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Filter size={18} className="text-slate-500 hidden sm:block" />
              <span className="text-sm font-medium text-slate-700">Filtreler:</span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 flex-1">
              {/* Student Filter Combobox */}
              <Popover open={studentFilterOpen} onOpenChange={setStudentFilterOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={studentFilterOpen}
                    className="h-11 lg:h-10 justify-between text-sm font-normal"
                    data-testid="student-filter"
                  >
                    {selectedStudentFilter ? (
                      <span className="truncate">
                        {getStudentDisplayLabel(students.find(s => s.id === selectedStudentFilter))}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Öğrenci Ara...</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput 
                      placeholder="Öğrenci veya veli adı yazın..." 
                      value={studentFilterSearch}
                      onValueChange={setStudentFilterSearch}
                    />
                    <CommandList>
                      <CommandEmpty>Öğrenci bulunamadı.</CommandEmpty>
                      <CommandGroup>
                        {filteredStudentsForFilter.slice(0, 50).map((student) => (
                          <CommandItem
                            key={student.id}
                            value={student.id}
                            onSelect={() => {
                              setSelectedStudentFilter(student.id === selectedStudentFilter ? '' : student.id);
                              setStudentFilterOpen(false);
                              setStudentFilterSearch('');
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedStudentFilter === student.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col">
                              <span className="font-medium">{student.name}</span>
                              {student.parent_name && (
                                <span className="text-xs text-muted-foreground">Veli: {student.parent_name}</span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              <Select value={selectedMonth || 'all'} onValueChange={(val) => setSelectedMonth(val === 'all' ? '' : val)}>
                <SelectTrigger className="h-11 lg:h-10 text-sm" data-testid="month-filter">
                  <SelectValue placeholder="Ay seçin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Aylar</SelectItem>
                  {availableMonths.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedCashbox} onValueChange={setSelectedCashbox}>
                <SelectTrigger className="h-11 lg:h-10 text-sm" data-testid="cashbox-filter">
                  <SelectValue placeholder="Kasa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Kasalar</SelectItem>
                  {cashboxes.map(cashbox => (
                    <SelectItem key={cashbox.id} value={cashbox.id}>
                      {cashbox.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedExpenseCategory} onValueChange={setSelectedExpenseCategory}>
                <SelectTrigger className="h-11 lg:h-10 text-sm" data-testid="expense-category-filter">
                  <SelectValue placeholder="Gider Kategorisi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Kategoriler</SelectItem>
                  {expenseCategories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedTeacherFilter} onValueChange={setSelectedTeacherFilter}>
                <SelectTrigger className="h-11 lg:h-10 text-sm" data-testid="teacher-filter">
                  <SelectValue placeholder="Öğretmen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Öğretmenler</SelectItem>
                  {teachers.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedBankFilter} onValueChange={setSelectedBankFilter}>
                <SelectTrigger className="h-11 lg:h-10 text-sm" data-testid="bank-filter">
                  <SelectValue placeholder="Banka Hesabı" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Hesaplar</SelectItem>
                  {bankAccounts.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.bank_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sortOrder} onValueChange={setSortOrder}>
                <SelectTrigger className="h-11 lg:h-10 text-sm" data-testid="sort-order">
                  <SelectValue placeholder="Sıralama" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Güncelden Eskiye</SelectItem>
                  <SelectItem value="asc">Eskiden Güncele</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(selectedMonth || selectedCashbox !== 'all' || selectedStudentFilter || selectedExpenseCategory !== 'all' || selectedTeacherFilter !== 'all' || selectedBankFilter !== 'all') && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  setSelectedMonth('');
                  setSelectedCashbox('all');
                  setSelectedStudentFilter('');
                  setStudentFilterSearch('');
                  setSelectedExpenseCategory('all');
                  setSelectedTeacherFilter('all');
                  setSelectedBankFilter('all');
                  setSortOrder('desc');
                }}
                className="h-10 text-slate-600"
              >
                <X size={16} className="mr-1" />
                Temizle
              </Button>
            )}
          </div>

          {/* Tabs - Mobile optimized */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:flex h-11 sm:h-10">
              <TabsTrigger value="all" className="text-xs sm:text-sm">Tümü</TabsTrigger>
              <TabsTrigger value="income" className="text-xs sm:text-sm">Gelir</TabsTrigger>
              <TabsTrigger value="expense" className="text-xs sm:text-sm">Gider</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-2 lg:space-y-3 mt-4">
              {payments.length === 0 ? (
                <p className="text-slate-600 text-center py-8">Henüz ödeme yok</p>
              ) : (
                <>
                  {payments.map((payment) => renderPaymentItem(payment, 'bg-slate-50'))}
                  <PaginationFooter />
                </>
              )}
            </TabsContent>

            <TabsContent value="income" className="space-y-2 lg:space-y-3 mt-4">
              {payments.length === 0 ? (
                <p className="text-slate-600 text-center py-8">Henüz gelir kaydı yok</p>
              ) : (
                <>
                  {payments.map((payment) => renderPaymentItem(payment, 'bg-green-50'))}
                  <PaginationFooter />
                </>
              )}
            </TabsContent>

            <TabsContent value="expense" className="space-y-2 lg:space-y-3 mt-4">
              {payments.length === 0 ? (
                <p className="text-slate-600 text-center py-8">Henüz gider kaydı yok</p>
              ) : (
                <>
                  {payments.map((payment) => renderPaymentItem(payment, 'bg-red-50'))}
                  <PaginationFooter />
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Add/Edit Payment Dialog */}
        <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
          <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md mx-auto max-h-[85vh] overflow-y-auto rounded-xl">
            <DialogHeader>
              <DialogTitle className="text-lg">
                {editingPayment ? 'Ödeme Düzenle' : (dialogType === 'income' ? 'Ödeme Girişi' : 'Para Çıkışı')}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmitPayment} className="space-y-4 pb-2">
              {dialogType === 'income' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="student">Öğrenci (Opsiyonel)</Label>
                    <Popover open={formStudentOpen} onOpenChange={setFormStudentOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={formStudentOpen}
                          className="w-full h-12 justify-between font-normal"
                          data-testid="payment-student-select"
                        >
                          {newPayment.student_id ? (
                            <span className="truncate">
                              {getStudentDisplayLabel(students.find(s => s.id === newPayment.student_id))}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Öğrenci veya veli adı yazın...</span>
                          )}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[350px] p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput 
                            placeholder="Öğrenci veya veli adı yazın..." 
                            value={formStudentSearch}
                            onValueChange={setFormStudentSearch}
                          />
                          <CommandList>
                            <CommandEmpty>Öğrenci bulunamadı.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="none"
                                onSelect={() => {
                                  setNewPayment({ ...newPayment, student_id: '' });
                                  setFormStudentOpen(false);
                                  setFormStudentSearch('');
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    !newPayment.student_id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <span className="text-muted-foreground">Öğrenci Seçme</span>
                              </CommandItem>
                              {filteredStudentsForForm.slice(0, 50).map((student) => {
                                const studentBranches = getStudentBranches(student.id);
                                return (
                                  <CommandItem
                                    key={student.id}
                                    value={student.id}
                                    onSelect={() => {
                                      setNewPayment({ ...newPayment, student_id: student.id, publisher_id: '' });
                                      setFormStudentOpen(false);
                                      setFormStudentSearch('');
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4 flex-shrink-0",
                                        newPayment.student_id === student.id ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    <div className="flex flex-col min-w-0">
                                      <span className="font-medium">{student.name}</span>
                                      {student.parent_name && (
                                        <span className="text-xs text-muted-foreground">Veli: {student.parent_name}</span>
                                      )}
                                      {studentBranches.length > 0 && (
                                        <span className="text-xs text-blue-600 font-medium">{studentBranches.join(', ')}</span>
                                      )}
                                    </div>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {sponsorEnabled && (
                    <div className="space-y-2">
                      <Label htmlFor="publisher">Yayınevi (Opsiyonel)</Label>
                      <Select
                        value={newPayment.publisher_id || 'none'}
                        onValueChange={(v) => setNewPayment({ ...newPayment, publisher_id: v === 'none' ? '' : v, student_id: v === 'none' ? newPayment.student_id : '' })}
                        disabled={!!newPayment.student_id}
                      >
                        <SelectTrigger className="h-12" data-testid="payment-publisher-select">
                          <SelectValue placeholder={newPayment.student_id ? 'Öğrenci seçildiğinde yayınevi seçilemez' : 'Yayınevi seçin'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Yayınevi Seçme</SelectItem>
                          {publishers.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {newPayment.publisher_id && (
                        <p className="text-xs text-indigo-600">Bu ödeme seçilen yayınevinin bakiyesine yansıtılacak.</p>
                      )}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="branch">Branş</Label>
                    <Select 
                      value={newPayment.branch_id} 
                      onValueChange={(value) => {
                        // Branş seçilince aynı isimli kasayı otomatik seç
                        const selectedBranch = branches.find(b => b.id === value);
                        const matchingCashbox = cashboxes.find(c => 
                          c.branch_id === value || c.name?.toLowerCase() === selectedBranch?.name?.toLowerCase()
                        );
                        setNewPayment({ 
                          ...newPayment, 
                          branch_id: value,
                          cashbox_id: matchingCashbox?.id || ''
                        });
                      }}
                    >
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="Branş seçin" />
                      </SelectTrigger>
                      <SelectContent>
                        {branches.map((branch) => (
                          <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              {dialogType === 'expense' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="expense_category">Gider Kategorisi *</Label>
                    <Select value={newPayment.expense_category} onValueChange={(value) => setNewPayment({ ...newPayment, expense_category: value, teacher_id: value === 'Maaş' ? newPayment.teacher_id : '' })}>
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="Kategori seçin" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Maaş">Maaş (Öğretmen Ödemesi)</SelectItem>
                        <SelectItem value="Kira">Kira</SelectItem>
                        <SelectItem value="Reklam">Reklam</SelectItem>
                        <SelectItem value="Ofis">Ofis Gideri</SelectItem>
                        <SelectItem value="Vergi">Vergi</SelectItem>
                        <SelectItem value="Sermaye">Sermaye Çıkışı</SelectItem>
                        <SelectItem value="Diğer">Diğer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cashbox">Kasa</Label>
                    <Select 
                      value={newPayment.cashbox_id} 
                      onValueChange={(value) => setNewPayment({ ...newPayment, cashbox_id: value })}
                    >
                      <SelectTrigger className="h-12" data-testid="expense-cashbox-select">
                        <SelectValue placeholder="Hangi kasadan çıkacak?" />
                      </SelectTrigger>
                      <SelectContent>
                        {cashboxes.map((cashbox) => (
                          <SelectItem key={cashbox.id} value={cashbox.id}>
                            {cashbox.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {newPayment.expense_category === 'Maaş' && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="teacher">Öğretmen *</Label>
                        <Select value={newPayment.teacher_id} onValueChange={(value) => setNewPayment({ ...newPayment, teacher_id: value })}>
                          <SelectTrigger className="h-12">
                            <SelectValue placeholder="Öğretmen seçin" />
                          </SelectTrigger>
                          <SelectContent>
                            {teachers.filter(t => t.status === 'active').map((teacher) => (
                              <SelectItem key={teacher.id} value={teacher.id}>{teacher.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="payment_method">Ödeme Şekli *</Label>
                        <Select 
                          value={newPayment.payment_method} 
                          onValueChange={(value) => setNewPayment({ 
                            ...newPayment, 
                            payment_method: value,
                            tax_amount: value === 'elden' ? '' : newPayment.tax_amount 
                          })}
                        >
                          <SelectTrigger className="h-12" data-testid="payment-method-select">
                            <SelectValue placeholder="Ödeme şekli seçin" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="elden">Elden</SelectItem>
                            <SelectItem value="resmi">Resmi</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {newPayment.payment_method === 'resmi' && (
                        <div className="space-y-2">
                          <Label htmlFor="tax_amount">Vergi Tutarı (₺) *</Label>
                          <Input
                            id="tax_amount"
                            type="number"
                            step="0.01"
                            value={newPayment.tax_amount}
                            onChange={(e) => setNewPayment({ ...newPayment, tax_amount: e.target.value })}
                            className="h-12"
                            placeholder="Kesilen vergi tutarı"
                          />
                          <p className="text-xs text-slate-500">Vergi sadece bilgilendirme amaçlıdır, kasadan ayrıca düşülmez</p>
                        </div>
                      )}
                    </>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="description">Açıklama</Label>
                    <Input
                      id="description"
                      value={newPayment.description}
                      onChange={(e) => setNewPayment({ ...newPayment, description: e.target.value })}
                      className="h-12"
                    />
                  </div>
                </>
              )}
              <div className="space-y-2">
                <Label htmlFor="amount">Tutar (₺) *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={newPayment.amount}
                  onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
                  required
                  className="h-12"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Tarih *</Label>
                <Input
                  id="date"
                  type="date"
                  value={newPayment.date}
                  onChange={(e) => setNewPayment({ ...newPayment, date: e.target.value })}
                  required
                  className="h-12"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank_account">Banka Hesabı</Label>
                <Select 
                  value={newPayment.bank_account_id} 
                  onValueChange={(value) => setNewPayment({ ...newPayment, bank_account_id: value })}
                  required
                >
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Banka hesabı seçin (zorunlu)" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.bank_name} - {account.holder_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button type="button" variant="outline" onClick={closeDialog} className="h-12">
                  İptal
                </Button>
                <Button type="submit" className="h-12">
                  {editingPayment ? 'Güncelle' : 'Kaydet'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Ödemeyi Sil</AlertDialogTitle>
              <AlertDialogDescription>
                Bu ödeme kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>İptal</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeletePayment}
                className="bg-red-600 hover:bg-red-700"
              >
                Sil
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Boş alan onay dialogu */}
        <AlertDialog open={emptyFieldConfirm.open} onOpenChange={(open) => !open && setEmptyFieldConfirm({ open: false, fields: [] })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eksik alan var</AlertDialogTitle>
              <AlertDialogDescription data-testid="empty-field-confirm-text">
                <strong>{emptyFieldConfirm.fields.join(' ve ')}</strong> alanı boş. Böyle kaydetmek istediğinize emin misiniz?
                {emptyFieldConfirm.fields.length === 1 && emptyFieldConfirm.fields[0] === 'Branş / Kasa' && (
                  <span className="block mt-2 text-slate-500">İşlem yalnızca banka hesabına yansıyacak; branş/kasa bakiyesi değişmeyecek.</span>
                )}
                {emptyFieldConfirm.fields.length === 1 && emptyFieldConfirm.fields[0] === 'Banka hesabı' && (
                  <span className="block mt-2 text-slate-500">İşlem yalnızca branş/kasa bakiyesine yansıyacak; banka hesabında işlem olmayacak.</span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="empty-field-confirm-cancel">Vazgeç</AlertDialogCancel>
              <AlertDialogAction
                onClick={doSavePayment}
                data-testid="empty-field-confirm-yes"
                className="bg-blue-600 hover:bg-blue-700"
              >
                Evet, kaydet
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
};

export default AdminPayments;
