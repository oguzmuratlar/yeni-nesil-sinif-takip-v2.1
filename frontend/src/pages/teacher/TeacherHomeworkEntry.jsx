import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TeacherLayout from '../../components/layouts/TeacherLayout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { ScrollArea } from '../../components/ui/scroll-area';
import { 
  Book, ChevronLeft, ChevronRight, ChevronDown, Plus, Check, X, 
  Calendar, FileText, RotateCcw, Trash2, Clock, AlertCircle,
  Undo2, Edit
} from 'lucide-react';
import apiClient from '../../api/axios';
import { toast } from 'sonner';

// Test durumları ve renkleri
const TEST_STATUSES = {
  not_started: { label: 'Başlanmadı', color: 'bg-white border-slate-200', textColor: 'text-slate-500', icon: null },
  assigned: { label: 'Ödev Verildi', color: 'bg-yellow-100 border-yellow-300', textColor: 'text-yellow-700', icon: Clock },
  completed: { label: 'Tamamlandı', color: 'bg-green-100 border-green-300', textColor: 'text-green-700', icon: Check },
  incomplete: { label: 'Eksik', color: 'bg-red-100 border-red-300', textColor: 'text-red-700', icon: X },
  needs_review: { label: 'Tekrar Gerekli', color: 'bg-purple-100 border-purple-300', textColor: 'text-purple-700', icon: RotateCcw },
  skipped: { label: 'Pas Geçildi', color: 'bg-slate-100 border-slate-300', textColor: 'text-slate-500', icon: null },
};

const DAYS_TR = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

const TeacherHomeworkEntry = () => {
  const { studentId, branchId } = useParams();
  const navigate = useNavigate();
  
  // State
  const [student, setStudent] = useState(null);
  const [branch, setBranch] = useState(null);
  const [books, setBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [bookTree, setBookTree] = useState(null);
  const [testProgress, setTestProgress] = useState({});
  const [expandedUnits, setExpandedUnits] = useState({});
  const [expandedTopics, setExpandedTopics] = useState({});
  const [loading, setLoading] = useState(true);
  
  // Plan state
  const [activePlan, setActivePlan] = useState(null);
  const [planItems, setPlanItems] = useState({});
  const [planDuration, setPlanDuration] = useState(7);
  
  // Dialogs
  const [addBookDialog, setAddBookDialog] = useState(false);
  const [createPlanDialog, setCreatePlanDialog] = useState(false);
  const [freetextDialog, setFreetextDialog] = useState(false);
  const [freetextDate, setFreetextDate] = useState('');
  const [freetextValue, setFreetextValue] = useState('');
  const [statusPopup, setStatusPopup] = useState({ open: false, testId: null, x: 0, y: 0 });
  
  // Tabs
  const [activeTab, setActiveTab] = useState('homework'); // 'homework' | 'trials'
  
  // Trials (Denemeler)
  const [trials, setTrials] = useState([]);
  const [trialDialogOpen, setTrialDialogOpen] = useState(false);
  const [editingTrial, setEditingTrial] = useState(null);
  const [trialForm, setTrialForm] = useState({
    exam_name: '',
    exam_date: new Date().toISOString().split('T')[0],
    correct_count: 0,
    wrong_count: 0,
    empty_count: 0,
    notes: ''
  });
  
  // Available books for assignment
  const [availableBooks, setAvailableBooks] = useState([]);
  
  // Undo system
  const [undoStack, setUndoStack] = useState([]);

  useEffect(() => {
    fetchInitialData();
  }, [studentId, branchId]);

  useEffect(() => {
    if (selectedBook) {
      fetchBookTree(selectedBook.id);
      fetchTestProgress(selectedBook.id);
    }
  }, [selectedBook]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      
      // Tüm branşları çek ve istenen branşı filtrele
      const [studentRes, branchesRes, booksRes, plansRes] = await Promise.all([
        apiClient.get(`/students/${studentId}`),
        apiClient.get('/branches'),
        apiClient.get(`/homework/students/${studentId}/books?branch_id=${branchId}`),
        apiClient.get(`/homework/students/${studentId}/plans?branch_id=${branchId}&status=active`)
      ]);
      
      setStudent(studentRes.data);
      
      // Branşı filtrele
      const foundBranch = branchesRes.data.find(b => b.id === branchId);
      setBranch(foundBranch || { name: 'Bilinmiyor' });
      
      setBooks(booksRes.data);
      
      // Aktif plan varsa yükle
      if (plansRes.data.length > 0) {
        setActivePlan(plansRes.data[0]);
        fetchPlanItems(plansRes.data[0].id);
      }
      
      // İlk kitabı seç
      if (booksRes.data.length > 0) {
        setSelectedBook(booksRes.data[0]);
      }
    } catch (error) {
      console.error('Data fetch error:', error);
      toast.error('Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  // Denemeleri çek
  const fetchTrials = async () => {
    try {
      const response = await apiClient.get(`/homework/students/${studentId}/trials?branch_id=${branchId}`);
      setTrials(response.data);
    } catch (error) {
      console.error('Trials error:', error);
    }
  };

  useEffect(() => {
    if (activeTab === 'trials') {
      fetchTrials();
    }
  }, [activeTab, studentId, branchId]);

  const fetchBookTree = async (bookId) => {
    try {
      const response = await apiClient.get(`/homework/books/${bookId}/tree`);
      setBookTree(response.data);
    } catch (error) {
      console.error('Book tree error:', error);
    }
  };

  const fetchTestProgress = async (bookId) => {
    try {
      const response = await apiClient.get(`/homework/students/${studentId}/books/${bookId}/progress`);
      setTestProgress(response.data);
    } catch (error) {
      console.error('Progress error:', error);
    }
  };

  const fetchPlanItems = async (planId) => {
    try {
      const response = await apiClient.get(`/homework/plans/${planId}`);
      setPlanItems(response.data.days || {});
    } catch (error) {
      console.error('Plan items error:', error);
    }
  };

  const fetchAvailableBooks = async () => {
    try {
      const response = await apiClient.get(`/homework/books?branch_id=${branchId}`);
      // Zaten atanmış kitapları filtrele
      const assignedBookIds = books.map(b => b.id);
      setAvailableBooks(response.data.filter(b => !assignedBookIds.includes(b.id)));
    } catch (error) {
      toast.error('Kitaplar yüklenemedi');
    }
  };

  // Test durumu güncelle (auto-save)
  const updateTestStatus = useCallback(async (testId, newStatus) => {
    const oldStatus = testProgress[testId]?.status || 'not_started';
    
    // Undo stack'e ekle
    setUndoStack(prev => [...prev, { testId, oldStatus }]);
    
    // Optimistic update
    setTestProgress(prev => ({
      ...prev,
      [testId]: { ...prev[testId], status: newStatus }
    }));
    
    try {
      await apiClient.put(`/homework/students/${studentId}/tests/${testId}/status`, {
        status: newStatus
      });
    } catch (error) {
      // Hata durumunda geri al
      setTestProgress(prev => ({
        ...prev,
        [testId]: { ...prev[testId], status: oldStatus }
      }));
      toast.error('Durum güncellenemedi');
    }
  }, [studentId, testProgress]);

  // Undo
  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;
    
    const lastAction = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    
    setTestProgress(prev => ({
      ...prev,
      [lastAction.testId]: { ...prev[lastAction.testId], status: lastAction.oldStatus }
    }));
    
    try {
      await apiClient.put(`/homework/students/${studentId}/tests/${lastAction.testId}/status`, {
        status: lastAction.oldStatus
      });
      toast.info('Geri alındı');
    } catch (error) {
      console.error('Undo error:', error);
    }
  }, [studentId, undoStack]);

  // Kitap ata
  const handleAssignBook = async (bookId) => {
    try {
      await apiClient.post(`/homework/students/${studentId}/books`, {
        student_id: studentId,
        book_id: bookId,
        branch_id: branchId
      });
      toast.success('Kitap atandı');
      setAddBookDialog(false);
      fetchInitialData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Kitap atanamadı');
    }
  };

  // Kitap kaldır
  const handleRemoveBook = async (bookId) => {
    if (!confirm('Bu kitabı öğrenciden kaldırmak istediğinize emin misiniz?')) return;
    
    try {
      await apiClient.delete(`/homework/students/${studentId}/books/${bookId}`);
      toast.success('Kitap kaldırıldı');
      if (selectedBook?.id === bookId) {
        setSelectedBook(null);
        setBookTree(null);
      }
      fetchInitialData();
    } catch (error) {
      toast.error('Kitap kaldırılamadı');
    }
  };

  // Plan oluştur
  const handleCreatePlan = async () => {
    const today = new Date().toISOString().split('T')[0];
    
    try {
      const response = await apiClient.post('/homework/plans', {
        student_id: studentId,
        branch_id: branchId,
        start_date: today,
        duration_days: planDuration
      });
      toast.success('Plan oluşturuldu');
      setCreatePlanDialog(false);
      fetchInitialData();
    } catch (error) {
      toast.error('Plan oluşturulamadı');
    }
  };

  // Test'i plana ekle
  const handleAddTestToPlan = async (testId, date) => {
    if (!activePlan) {
      toast.error('Önce bir plan oluşturun');
      return;
    }
    
    try {
      await apiClient.post(`/homework/plans/${activePlan.id}/items`, {
        plan_id: activePlan.id,
        day_date: date,
        item_type: 'test',
        test_id: testId,
        book_id: selectedBook?.id
      });
      fetchPlanItems(activePlan.id);
      fetchTestProgress(selectedBook.id);
      toast.success('Ödev eklendi');
    } catch (error) {
      toast.error('Ödev eklenemedi');
    }
  };

  // Serbest metin ödev ekle
  const handleAddFreetext = async () => {
    if (!freetextValue.trim() || !freetextDate) return;
    
    try {
      await apiClient.post(`/homework/plans/${activePlan.id}/items`, {
        plan_id: activePlan.id,
        day_date: freetextDate,
        item_type: 'freetext',
        freetext: freetextValue
      });
      fetchPlanItems(activePlan.id);
      setFreetextDialog(false);
      setFreetextValue('');
      toast.success('Ödev eklendi');
    } catch (error) {
      toast.error('Ödev eklenemedi');
    }
  };

  // Plan öğesi sil
  const handleRemovePlanItem = async (itemId) => {
    try {
      await apiClient.delete(`/homework/plan-items/${itemId}`);
      fetchPlanItems(activePlan.id);
    } catch (error) {
      toast.error('Ödev silinemedi');
    }
  };

  // ============ DENEME FONKSİYONLARI ============
  
  const openTrialDialog = (trial = null) => {
    if (trial) {
      setEditingTrial(trial);
      setTrialForm({
        exam_name: trial.exam_name,
        exam_date: trial.exam_date,
        correct_count: trial.correct_count,
        wrong_count: trial.wrong_count,
        empty_count: trial.empty_count,
        notes: trial.notes || ''
      });
    } else {
      setEditingTrial(null);
      setTrialForm({
        exam_name: '',
        exam_date: new Date().toISOString().split('T')[0],
        correct_count: 0,
        wrong_count: 0,
        empty_count: 0,
        notes: ''
      });
    }
    setTrialDialogOpen(true);
  };

  const handleSaveTrial = async () => {
    if (!trialForm.exam_name || !trialForm.exam_date) {
      toast.error('Deneme adı ve tarihi zorunludur');
      return;
    }
    
    try {
      const data = {
        student_id: studentId,
        branch_id: branchId,
        ...trialForm,
        correct_count: parseInt(trialForm.correct_count) || 0,
        wrong_count: parseInt(trialForm.wrong_count) || 0,
        empty_count: parseInt(trialForm.empty_count) || 0
      };
      
      if (editingTrial) {
        await apiClient.put(`/homework/trials/${editingTrial.id}`, data);
        toast.success('Deneme güncellendi');
      } else {
        await apiClient.post('/homework/trials', data);
        toast.success('Deneme kaydedildi');
      }
      
      setTrialDialogOpen(false);
      fetchTrials();
    } catch (error) {
      toast.error('İşlem başarısız');
    }
  };

  const updateTrialReview = async (trialId, field, value) => {
    try {
      await apiClient.put(`/homework/trials/${trialId}/review?${field}=${value}`);
      fetchTrials();
    } catch (error) {
      console.error('Review update error:', error);
    }
  };

  // ============ HIZLI DURUM DEĞİŞTİRME ============
  
  const openStatusPopup = (e, testId) => {
    e.stopPropagation();
    const rect = e.target.getBoundingClientRect();
    setStatusPopup({
      open: true,
      testId,
      x: rect.left,
      y: rect.bottom + 5
    });
  };

  const closeStatusPopup = () => {
    setStatusPopup({ open: false, testId: null, x: 0, y: 0 });
  };

  const handleQuickStatusChange = async (newStatus) => {
    if (statusPopup.testId) {
      await updateTestStatus(statusPopup.testId, newStatus);
      closeStatusPopup();
    }
  };

  const toggleUnit = (unitId) => {
    setExpandedUnits(prev => ({ ...prev, [unitId]: !prev[unitId] }));
  };

  const toggleTopic = (topicId) => {
    setExpandedTopics(prev => ({ ...prev, [topicId]: !prev[topicId] }));
  };

  // Plan tarihlerini hesapla
  const getPlanDates = () => {
    if (!activePlan) return [];
    
    const dates = [];
    const start = new Date(activePlan.start_date);
    
    for (let i = 0; i < activePlan.duration_days; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      const dayName = DAYS_TR[date.getDay() === 0 ? 6 : date.getDay() - 1];
      dates.push({ date: dateStr, dayName, dayNum: date.getDate() });
    }
    
    return dates;
  };

  const getTestStatusInfo = (testId) => {
    const status = testProgress[testId]?.status || 'not_started';
    return TEST_STATUSES[status] || TEST_STATUSES.not_started;
  };

  // Hızlı durum değiştirme
  const cycleTestStatus = (testId) => {
    const currentStatus = testProgress[testId]?.status || 'not_started';
    const statusOrder = ['not_started', 'assigned', 'completed', 'incomplete', 'needs_review', 'skipped'];
    const currentIndex = statusOrder.indexOf(currentStatus);
    const nextStatus = statusOrder[(currentIndex + 1) % statusOrder.length];
    updateTestStatus(testId, nextStatus);
  };

  if (loading) {
    return (
      <TeacherLayout>
        <div className="flex items-center justify-center h-96">
          <p className="text-slate-500">Yükleniyor...</p>
        </div>
      </TeacherLayout>
    );
  }

  return (
    <TeacherLayout>
      <div className="h-[calc(100vh-120px)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate('/teacher/students')}
              className="p-2"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-slate-800">{student?.name}</h1>
              <p className="text-sm text-slate-500">{branch?.name} • Ödev Takip</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {undoStack.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleUndo} className="gap-1">
                <Undo2 className="w-4 h-4" />
                Geri Al
              </Button>
            )}
            {!activePlan && (
              <Button size="sm" onClick={() => setCreatePlanDialog(true)} className="gap-1">
                <Plus className="w-4 h-4" />
                Plan Oluştur
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('homework')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'homework'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Ödev Takip
          </button>
          <button
            onClick={() => setActiveTab('trials')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'trials'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Denemeler
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'homework' ? (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0">
          {/* Sol Panel - Kitaplar */}
          <div className="lg:col-span-3 teacher-card p-3 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-700 text-sm">Kitaplar</h2>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 w-7 p-0"
                onClick={() => {
                  fetchAvailableBooks();
                  setAddBookDialog(true);
                }}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            
            <ScrollArea className="flex-1">
              <div className="space-y-2 pr-2">
                {books.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <Book className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Henüz kitap yok</p>
                    <Button 
                      variant="link" 
                      size="sm"
                      onClick={() => {
                        fetchAvailableBooks();
                        setAddBookDialog(true);
                      }}
                    >
                      Kitap Ekle
                    </Button>
                  </div>
                ) : (
                  books.map(book => (
                    <div
                      key={book.id}
                      onClick={() => setSelectedBook(book)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedBook?.id === book.id
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-medium text-slate-800 text-sm truncate">{book.name}</h3>
                          <p className="text-xs text-slate-500 mt-0.5">{book.publisher}</p>
                          
                          {/* Progress bar */}
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-slate-500">{book.completed_tests}/{book.total_tests}</span>
                              <span className="text-purple-600 font-medium">{book.progress_percent}%</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-purple-500 transition-all"
                                style={{ width: `${book.progress_percent}%` }}
                              />
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveBook(book.id);
                          }}
                          className="p-1 hover:bg-red-100 rounded text-slate-400 hover:text-red-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Orta Panel - Kitap Ağacı */}
          <div className="lg:col-span-5 teacher-card p-3 flex flex-col min-h-0">
            <h2 className="font-semibold text-slate-700 text-sm mb-3">
              {selectedBook ? selectedBook.name : 'Kitap İçeriği'}
            </h2>
            
            <ScrollArea className="flex-1">
              {!selectedBook ? (
                <div className="text-center py-12 text-slate-400">
                  <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Kitap seçin</p>
                </div>
              ) : !bookTree ? (
                <div className="text-center py-8 text-slate-500">Yükleniyor...</div>
              ) : (
                <div className="space-y-1 pr-2">
                  {bookTree.tree.map(unit => (
                    <div key={unit.id} className="border rounded-lg overflow-hidden">
                      {/* Unit Header */}
                      <div
                        className="flex items-center gap-2 p-2 bg-slate-50 cursor-pointer hover:bg-slate-100"
                        onClick={() => toggleUnit(unit.id)}
                      >
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${!expandedUnits[unit.id] ? '-rotate-90' : ''}`} />
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: unit.color || '#94a3b8' }}
                        />
                        <span className="text-sm font-medium text-slate-700 flex-1 truncate">{unit.name}</span>
                      </div>

                      {/* Topics */}
                      {expandedUnits[unit.id] && (
                        <div className="border-t">
                          {unit.topics?.map(topic => (
                            <div key={topic.id}>
                              <div
                                className="flex items-center gap-2 p-2 pl-6 cursor-pointer hover:bg-slate-50 border-b"
                                onClick={() => toggleTopic(topic.id)}
                              >
                                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${!expandedTopics[topic.id] ? '-rotate-90' : ''}`} />
                                <span className="text-sm text-slate-600 flex-1 truncate">{topic.name}</span>
                                <span className="text-xs text-slate-400">{topic.tests?.length || 0}</span>
                              </div>

                              {/* Tests */}
                              {expandedTopics[topic.id] && topic.tests?.map(test => {
                                const statusInfo = getTestStatusInfo(test.id);
                                const StatusIcon = statusInfo.icon;
                                
                                return (
                                  <div
                                    key={test.id}
                                    className={`flex items-center gap-2 p-2 pl-10 border-b last:border-b-0 ${statusInfo.color}`}
                                  >
                                    {/* Status button - tıklayınca popup açılır */}
                                    <button
                                      onClick={(e) => openStatusPopup(e, test.id)}
                                      className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all hover:scale-110 ${statusInfo.color} ${statusInfo.textColor}`}
                                    >
                                      {StatusIcon && <StatusIcon className="w-4 h-4" />}
                                    </button>
                                    
                                    <span className={`text-sm flex-1 truncate ${statusInfo.textColor}`}>
                                      {test.name}
                                    </span>
                                    
                                    {test.question_count && (
                                      <span className="text-xs text-slate-400">{test.question_count}s</span>
                                    )}
                                    
                                    {/* Plana ekle butonu */}
                                    {activePlan && statusInfo.label !== 'Tamamlandı' && (
                                      <select
                                        className="text-xs border rounded px-1 py-0.5 bg-white"
                                        onChange={(e) => {
                                          if (e.target.value) {
                                            handleAddTestToPlan(test.id, e.target.value);
                                            e.target.value = '';
                                          }
                                        }}
                                        defaultValue=""
                                      >
                                        <option value="">+ Ekle</option>
                                        {getPlanDates().map(d => (
                                          <option key={d.date} value={d.date}>
                                            {d.dayName} ({d.dayNum})
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Sağ Panel - Haftalık Plan */}
          <div className="lg:col-span-4 teacher-card p-3 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-700 text-sm">
                {activePlan ? 'Haftalık Plan' : 'Plan Yok'}
              </h2>
              {activePlan && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setFreetextDate(getPlanDates()[0]?.date || '');
                    setFreetextDialog(true);
                  }}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Not
                </Button>
              )}
            </div>
            
            <ScrollArea className="flex-1">
              {!activePlan ? (
                <div className="text-center py-12 text-slate-400">
                  <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm mb-2">Henüz plan yok</p>
                  <Button size="sm" onClick={() => setCreatePlanDialog(true)}>
                    Plan Oluştur
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 pr-2">
                  {getPlanDates().map(({ date, dayName, dayNum }) => {
                    const dayItems = planItems[date] || [];
                    const isToday = date === new Date().toISOString().split('T')[0];
                    
                    return (
                      <div 
                        key={date} 
                        className={`border rounded-lg overflow-hidden ${isToday ? 'border-purple-400 bg-purple-50/50' : ''}`}
                      >
                        <div className={`px-3 py-2 ${isToday ? 'bg-purple-100' : 'bg-slate-50'}`}>
                          <div className="flex items-center justify-between">
                            <span className={`text-sm font-medium ${isToday ? 'text-purple-700' : 'text-slate-700'}`}>
                              {dayName}
                            </span>
                            <span className={`text-xs ${isToday ? 'text-purple-600' : 'text-slate-500'}`}>
                              {dayNum}
                            </span>
                          </div>
                        </div>
                        
                        <div className="p-2 space-y-1.5 min-h-[60px]">
                          {dayItems.length === 0 ? (
                            <p className="text-xs text-slate-400 text-center py-2">Boş</p>
                          ) : (
                            dayItems.map(item => (
                              <div 
                                key={item.id}
                                className="flex items-start gap-2 p-2 bg-white rounded border text-sm group"
                              >
                                {item.item_type === 'test' ? (
                                  <>
                                    <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-slate-700 text-xs truncate">
                                        {item.test_info?.test_name}
                                      </p>
                                      <p className="text-xs text-slate-400 truncate">
                                        {item.test_info?.topic_name}
                                      </p>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="w-2 h-2 rounded-full bg-orange-400 mt-1.5 shrink-0" />
                                    <p className="flex-1 text-xs text-slate-600">{item.freetext}</p>
                                  </>
                                )}
                                <button
                                  onClick={() => handleRemovePlanItem(item.id)}
                                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 rounded text-slate-400 hover:text-red-500"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
        ) : (
          /* ============ DENEME SEKMESİ ============ */
          <div className="flex-1 teacher-card p-4 overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-700">Deneme Sonuçları</h2>
              <Button size="sm" onClick={() => openTrialDialog()} className="gap-1">
                <Plus className="w-4 h-4" />
                Deneme Ekle
              </Button>
            </div>
            
            {trials.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Henüz deneme kaydı yok</p>
                <Button 
                  variant="link" 
                  size="sm"
                  onClick={() => openTrialDialog()}
                >
                  İlk denemeyi ekle
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {trials.map(trial => {
                  const net = trial.correct_count - (trial.wrong_count / 4);
                  return (
                    <div key={trial.id} className="border rounded-lg p-4 hover:border-purple-200 transition-all">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <h3 className="font-medium text-slate-800">{trial.exam_name}</h3>
                          <p className="text-sm text-slate-500">{trial.exam_date}</p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => openTrialDialog(trial)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-4 gap-3 mb-3">
                        <div className="text-center p-2 bg-green-50 rounded">
                          <p className="text-lg font-bold text-green-600">{trial.correct_count}</p>
                          <p className="text-xs text-slate-500">Doğru</p>
                        </div>
                        <div className="text-center p-2 bg-red-50 rounded">
                          <p className="text-lg font-bold text-red-600">{trial.wrong_count}</p>
                          <p className="text-xs text-slate-500">Yanlış</p>
                        </div>
                        <div className="text-center p-2 bg-slate-50 rounded">
                          <p className="text-lg font-bold text-slate-600">{trial.empty_count}</p>
                          <p className="text-xs text-slate-500">Boş</p>
                        </div>
                        <div className="text-center p-2 bg-purple-50 rounded">
                          <p className="text-lg font-bold text-purple-600">{net.toFixed(2)}</p>
                          <p className="text-xs text-slate-500">Net</p>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={trial.reviewed_wrong}
                            onChange={(e) => updateTrialReview(trial.id, 'reviewed_wrong', e.target.checked)}
                            className="rounded border-slate-300"
                          />
                          <span className="text-sm text-slate-600">Yanlışlara baktı</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={trial.reviewed_topics}
                            onChange={(e) => updateTrialReview(trial.id, 'reviewed_topics', e.target.checked)}
                            className="rounded border-slate-300"
                          />
                          <span className="text-sm text-slate-600">Eksik konuyu tekrar etti</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={trial.found_mistakes}
                            onChange={(e) => updateTrialReview(trial.id, 'found_mistakes', e.target.checked)}
                            className="rounded border-slate-300"
                          />
                          <span className="text-sm text-slate-600">Kaçırdığı bilgiyi buldu</span>
                        </label>
                      </div>
                      
                      {trial.notes && (
                        <p className="mt-2 text-sm text-slate-500 bg-slate-50 p-2 rounded">{trial.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status Popup */}
      {statusPopup.open && (
        <div 
          className="fixed z-50 bg-white rounded-lg shadow-xl border p-2 min-w-[160px]"
          style={{ left: statusPopup.x, top: statusPopup.y }}
        >
          <div className="space-y-1">
            {Object.entries(TEST_STATUSES).map(([key, info]) => {
              const Icon = info.icon;
              return (
                <button
                  key={key}
                  onClick={() => handleQuickStatusChange(key)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm hover:bg-slate-100 ${info.textColor}`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${info.color}`}>
                    {Icon && <Icon className="w-3 h-3" />}
                  </div>
                  {info.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Click outside to close status popup */}
      {statusPopup.open && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={closeStatusPopup}
        />
      )}

      {/* Kitap Ekleme Dialog */}
      <Dialog open={addBookDialog} onOpenChange={setAddBookDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Kitap Ekle</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-96">
            <div className="space-y-2 py-2">
              {availableBooks.length === 0 ? (
                <p className="text-center text-slate-500 py-4">
                  Eklenebilecek kitap yok
                </p>
              ) : (
                availableBooks.map(book => (
                  <div
                    key={book.id}
                    onClick={() => handleAssignBook(book.id)}
                    className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:border-purple-300 hover:bg-purple-50"
                  >
                    <Book className="w-8 h-8 text-purple-500" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 truncate">{book.name}</p>
                      <p className="text-xs text-slate-500">{book.publisher} • {book.level}. Sınıf</p>
                    </div>
                    <Plus className="w-5 h-5 text-slate-400" />
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Plan Oluşturma Dialog */}
      <Dialog open={createPlanDialog} onOpenChange={setCreatePlanDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Yeni Plan Oluştur</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-slate-700">Plan Süresi</label>
            <div className="flex gap-2 mt-2">
              {[7, 14, 21].map(days => (
                <Button
                  key={days}
                  variant={planDuration === days ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPlanDuration(days)}
                >
                  {days} Gün
                </Button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Bugünden itibaren {planDuration} günlük plan oluşturulacak.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatePlanDialog(false)}>İptal</Button>
            <Button onClick={handleCreatePlan}>Oluştur</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Serbest Metin Dialog */}
      <Dialog open={freetextDialog} onOpenChange={setFreetextDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Serbest Ödev Ekle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Gün</label>
              <select
                className="w-full mt-1 p-2 border rounded-lg"
                value={freetextDate}
                onChange={(e) => setFreetextDate(e.target.value)}
              >
                {getPlanDates().map(d => (
                  <option key={d.date} value={d.date}>
                    {d.dayName} ({d.dayNum})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Ödev Notu</label>
              <Input
                value={freetextValue}
                onChange={(e) => setFreetextValue(e.target.value)}
                placeholder="Örn: 20 paragraf çöz"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFreetextDialog(false)}>İptal</Button>
            <Button onClick={handleAddFreetext}>Ekle</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deneme Dialog */}
      <Dialog open={trialDialogOpen} onOpenChange={setTrialDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTrial ? 'Deneme Düzenle' : 'Yeni Deneme'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Deneme Adı *</label>
              <Input
                value={trialForm.exam_name}
                onChange={(e) => setTrialForm({ ...trialForm, exam_name: e.target.value })}
                placeholder="Örn: LGS Deneme 1"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Tarih *</label>
              <Input
                type="date"
                value={trialForm.exam_date}
                onChange={(e) => setTrialForm({ ...trialForm, exam_date: e.target.value })}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium text-green-600">Doğru</label>
                <Input
                  type="number"
                  min="0"
                  value={trialForm.correct_count}
                  onChange={(e) => setTrialForm({ ...trialForm, correct_count: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-red-600">Yanlış</label>
                <Input
                  type="number"
                  min="0"
                  value={trialForm.wrong_count}
                  onChange={(e) => setTrialForm({ ...trialForm, wrong_count: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600">Boş</label>
                <Input
                  type="number"
                  min="0"
                  value={trialForm.empty_count}
                  onChange={(e) => setTrialForm({ ...trialForm, empty_count: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Notlar</label>
              <Input
                value={trialForm.notes}
                onChange={(e) => setTrialForm({ ...trialForm, notes: e.target.value })}
                placeholder="İsteğe bağlı not..."
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrialDialogOpen(false)}>İptal</Button>
            <Button onClick={handleSaveTrial}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TeacherLayout>
  );
};

export default TeacherHomeworkEntry;
