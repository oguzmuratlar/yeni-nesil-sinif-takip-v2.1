import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TeacherLayout from '../../components/layouts/TeacherLayout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { ScrollArea } from '../../components/ui/scroll-area';
import { 
  Book, ChevronLeft, ChevronDown, Plus, Check, X, 
  Calendar, FileText, RotateCcw, Trash2, Clock, AlertCircle,
  Undo2, Edit, Download, CheckCircle2, GripVertical, ClipboardCheck, RefreshCw, Pencil
} from 'lucide-react';
import apiClient from '../../api/axios';
import { toast } from 'sonner';

// Test durumları ve renkleri
const TEST_STATUSES = {
  not_started: { label: 'Başlanmadı', color: 'bg-white border-slate-200', textColor: 'text-slate-500', bgClass: 'bg-white', icon: null },
  assigned: { label: 'Ödev Verildi', color: 'bg-yellow-100 border-yellow-300', textColor: 'text-yellow-700', bgClass: 'bg-yellow-100', icon: Clock },
  completed: { label: 'Tamamlandı', color: 'bg-green-100 border-green-300', textColor: 'text-green-700', bgClass: 'bg-green-100', icon: Check },
  incomplete: { label: 'Eksik', color: 'bg-red-100 border-red-300', textColor: 'text-red-700', bgClass: 'bg-red-100', icon: X },
  needs_review: { label: 'Tekrar Gerekli', color: 'bg-purple-100 border-purple-300', textColor: 'text-purple-700', bgClass: 'bg-purple-100', icon: RotateCcw },
  skipped: { label: 'Pas Geçildi', color: 'bg-slate-100 border-slate-300', textColor: 'text-slate-500', bgClass: 'bg-slate-100', icon: null },
};

const DAYS_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

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
  
  // Drag state
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverDay, setDragOverDay] = useState(null);
  
  // Dialogs
  const [addBookDialog, setAddBookDialog] = useState(false);
  const [createPlanDialog, setCreatePlanDialog] = useState(false);
  const [freetextDialog, setFreetextDialog] = useState(false);
  const [freetextDate, setFreetextDate] = useState('');
  const [freetextValue, setFreetextValue] = useState('');
  const [statusPopup, setStatusPopup] = useState({ open: false, testId: null, x: 0, y: 0 });
  const [homeworkCheckDialog, setHomeworkCheckDialog] = useState(false);
  const [createBookDialog, setCreateBookDialog] = useState(false);
  
  // Ünite ve Test ekleme dialogs
  const [addUnitDialog, setAddUnitDialog] = useState(false);
  const [addTopicDialog, setAddTopicDialog] = useState(false);
  const [addTestDialog, setAddTestDialog] = useState(false);
  const [selectedUnitForTopic, setSelectedUnitForTopic] = useState(null);
  const [selectedTopicForTest, setSelectedTopicForTest] = useState(null);
  
  // Edit dialogs
  const [editUnitDialog, setEditUnitDialog] = useState(false);
  const [editTopicDialog, setEditTopicDialog] = useState(false);
  const [editTestDialog, setEditTestDialog] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [editingTopic, setEditingTopic] = useState(null);
  const [editingTest, setEditingTest] = useState(null);
  
  // Unit/Topic/Test forms
  const [newUnitForm, setNewUnitForm] = useState({ name: '', color: '#8b5cf6', order_num: 1 });
  const [newTopicForm, setNewTopicForm] = useState({ name: '', order_num: 1 });
  const [newTestForm, setNewTestForm] = useState({ name: '', question_count: 10, order_num: 1 });
  
  // Tabs
  const [activeTab, setActiveTab] = useState('homework');
  
  // Trials
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
  
  // Book creation form
  const [newBookForm, setNewBookForm] = useState({
    name: '',
    publisher: '',
    level: '8',
    book_type: 'soru_bankasi',
    publish_year: new Date().getFullYear()
  });
  
  // Available books
  const [availableBooks, setAvailableBooks] = useState([]);
  const [allBranches, setAllBranches] = useState([]);
  const [selectedBookLevel, setSelectedBookLevel] = useState(null); // Başka sınıf kitabı için
  const [showOtherLevelBooks, setShowOtherLevelBooks] = useState(false);
  
  // Undo
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

  useEffect(() => {
    if (activeTab === 'trials') {
      fetchTrials();
    }
  }, [activeTab]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      
      // Feature flag kontrolü
      try {
        const statusRes = await apiClient.get('/system-settings/homework-status');
        if (!statusRes.data.enabled) {
          toast.error('Ödev takip sistemi şu anda pasif durumda.');
          navigate('/teacher/students');
          return;
        }
      } catch (e) {
        // API hatası varsa devam et (varsayılan aktif)
      }
      
      const [studentRes, branchesRes, booksRes, plansRes] = await Promise.all([
        apiClient.get(`/students/${studentId}`),
        apiClient.get('/branches'),
        apiClient.get(`/homework/students/${studentId}/books?branch_id=${branchId}`),
        apiClient.get(`/homework/students/${studentId}/plans?branch_id=${branchId}&status=active`)
      ]);
      
      setStudent(studentRes.data);
      setAllBranches(branchesRes.data);
      const foundBranch = branchesRes.data.find(b => b.id === branchId);
      setBranch(foundBranch || { name: 'Bilinmiyor' });
      setBooks(booksRes.data);
      
      if (plansRes.data.length > 0) {
        setActivePlan(plansRes.data[0]);
        fetchPlanItems(plansRes.data[0].id);
      } else {
        // Plan yoksa otomatik 7 günlük plan oluştur
        const today = new Date().toISOString().split('T')[0];
        try {
          const newPlanRes = await apiClient.post('/homework/plans', {
            student_id: studentId,
            branch_id: branchId,
            start_date: today,
            duration_days: 7
          });
          // Yeni oluşturulan planı al
          const newPlansRes = await apiClient.get(`/homework/students/${studentId}/plans?branch_id=${branchId}&status=active`);
          if (newPlansRes.data.length > 0) {
            setActivePlan(newPlansRes.data[0]);
            fetchPlanItems(newPlansRes.data[0].id);
          }
        } catch (err) {
          console.error('Auto plan create error:', err);
        }
      }
      
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

  const fetchTrials = async () => {
    try {
      const response = await apiClient.get(`/homework/students/${studentId}/trials?branch_id=${branchId}`);
      setTrials(response.data);
    } catch (error) {
      console.error('Trials error:', error);
    }
  };

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

  const fetchAvailableBooks = async (customLevel = null) => {
    try {
      // Öğrencinin sınıf seviyesini al veya custom level kullan
      let levelNum = customLevel;
      
      if (!levelNum) {
        const studentLevel = student?.level || '';
        // Sınıf numarasını çıkar (örn: "5. Sınıf" -> "5")
        const levelMatch = studentLevel.match(/(\d+)/);
        levelNum = levelMatch ? levelMatch[1] : '';
      }
      
      const response = await apiClient.get(`/homework/books?branch_id=${branchId}${levelNum ? `&level=${levelNum}` : ''}`);
      const assignedBookIds = books.map(b => b.id);
      setAvailableBooks(response.data.filter(b => !assignedBookIds.includes(b.id)));
    } catch (error) {
      toast.error('Kitaplar yüklenemedi');
    }
  };

  // Başka sınıf kitaplarını getir
  const handleSelectOtherLevel = (level) => {
    setSelectedBookLevel(level);
    fetchAvailableBooks(level);
  };

  // Öğrencinin sınıf seviyesini al
  const getStudentLevel = () => {
    const studentLevel = student?.level || '';
    const levelMatch = studentLevel.match(/(\d+)/);
    return levelMatch ? levelMatch[1] : '';
  };

  // Refresh books list after assignment
  const refreshBooks = async () => {
    try {
      const booksRes = await apiClient.get(`/homework/students/${studentId}/books?branch_id=${branchId}`);
      setBooks(booksRes.data);
      if (booksRes.data.length > 0 && !selectedBook) {
        setSelectedBook(booksRes.data[0]);
      }
    } catch (error) {
      console.error('Refresh books error:', error);
    }
  };

  // Test durumu güncelle
  const updateTestStatus = useCallback(async (testId, newStatus, skipUndo = false) => {
    const oldStatus = testProgress[testId]?.status || 'not_started';
    
    if (!skipUndo) {
      setUndoStack(prev => [...prev, { testId, oldStatus }]);
    }
    
    setTestProgress(prev => ({
      ...prev,
      [testId]: { ...prev[testId], status: newStatus }
    }));
    
    try {
      await apiClient.put(`/homework/students/${studentId}/tests/${testId}/status`, {
        status: newStatus
      });
      // Refresh book progress
      refreshBooks();
    } catch (error) {
      setTestProgress(prev => ({
        ...prev,
        [testId]: { ...prev[testId], status: oldStatus }
      }));
      toast.error('Durum güncellenemedi');
    }
  }, [studentId, testProgress]);

  // Ünite için tüm testleri güncelle
  const updateUnitStatus = async (unit, newStatus) => {
    const testIds = [];
    unit.topics?.forEach(topic => {
      topic.tests?.forEach(test => {
        testIds.push(test.id);
      });
    });
    
    for (const testId of testIds) {
      await updateTestStatus(testId, newStatus, true);
    }
    toast.success(`Ünite durumu güncellendi (${testIds.length} test)`);
  };

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
      refreshBooks();
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
      refreshBooks();
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
      refreshBooks();
    } catch (error) {
      toast.error('Kitap kaldırılamadı');
    }
  };

  // Yeni kitap oluştur ve otomatik öğrenciye ata
  const handleCreateBook = async () => {
    if (!newBookForm.name) {
      toast.error('Kitap adı zorunludur');
      return;
    }
    
    try {
      // Kitap oluştur
      const bookRes = await apiClient.post('/homework/books', {
        ...newBookForm,
        branch_id: branchId,
        publish_year: parseInt(newBookForm.publish_year) || null
      });
      
      const bookId = bookRes.data.book_id;
      
      // Otomatik olarak öğrenciye ata
      await apiClient.post(`/homework/students/${studentId}/books`, {
        student_id: studentId,
        book_id: bookId,
        branch_id: branchId
      });
      
      toast.success('Kitap oluşturuldu ve öğrenciye atandı');
      setCreateBookDialog(false);
      setNewBookForm({
        name: '',
        publisher: '',
        level: '8',
        book_type: 'soru_bankasi',
        publish_year: new Date().getFullYear()
      });
      
      // Kitapları yenile ve yeni kitabı seç
      await refreshBooks();
      
      // Yeni kitabı seç
      const booksRes = await apiClient.get(`/homework/students/${studentId}/books?branch_id=${branchId}`);
      const newBook = booksRes.data.find(b => b.id === bookId);
      if (newBook) {
        setSelectedBook(newBook);
      }
    } catch (error) {
      toast.error('Kitap oluşturulamadı');
    }
  };

  // Ünite ekle
  const handleAddUnit = async () => {
    if (!newUnitForm.name || !selectedBook) {
      toast.error('Ünite adı zorunludur');
      return;
    }
    
    try {
      await apiClient.post('/homework/units', {
        book_id: selectedBook.id,
        name: newUnitForm.name,
        color: newUnitForm.color,
        order_num: bookTree?.tree?.length ? bookTree.tree.length + 1 : 1
      });
      toast.success('Ünite eklendi');
      setAddUnitDialog(false);
      setNewUnitForm({ name: '', color: '#8b5cf6', order_num: 1 });
      fetchBookTree(selectedBook.id);
    } catch (error) {
      toast.error('Ünite eklenemedi');
    }
  };

  // Konu ekle
  const handleAddTopic = async () => {
    if (!newTopicForm.name || !selectedUnitForTopic) {
      toast.error('Konu adı zorunludur');
      return;
    }
    
    try {
      const unit = bookTree?.tree?.find(u => u.id === selectedUnitForTopic);
      await apiClient.post('/homework/topics', {
        unit_id: selectedUnitForTopic,
        name: newTopicForm.name,
        order_num: unit?.topics?.length ? unit.topics.length + 1 : 1
      });
      toast.success('Konu eklendi');
      setAddTopicDialog(false);
      setNewTopicForm({ name: '', order_num: 1 });
      setSelectedUnitForTopic(null);
      fetchBookTree(selectedBook.id);
    } catch (error) {
      toast.error('Konu eklenemedi');
    }
  };

  // Test ekle
  const handleAddTest = async () => {
    if (!newTestForm.name || !selectedTopicForTest) {
      toast.error('Test adı zorunludur');
      return;
    }
    
    try {
      const unit = bookTree?.tree?.find(u => u.topics?.some(t => t.id === selectedTopicForTest));
      const topic = unit?.topics?.find(t => t.id === selectedTopicForTest);
      await apiClient.post('/homework/tests', {
        topic_id: selectedTopicForTest,
        name: newTestForm.name,
        question_count: parseInt(newTestForm.question_count) || 10,
        order_num: topic?.tests?.length ? topic.tests.length + 1 : 1
      });
      toast.success('Test eklendi');
      setAddTestDialog(false);
      setNewTestForm({ name: '', question_count: 10, order_num: 1 });
      setSelectedTopicForTest(null);
      fetchBookTree(selectedBook.id);
    } catch (error) {
      toast.error('Test eklenemedi');
    }
  };

  // Ünite düzenle
  const handleEditUnit = async () => {
    if (!newUnitForm.name || !editingUnit) return;
    try {
      await apiClient.put(`/homework/units/${editingUnit.id}`, {
        name: newUnitForm.name,
        color: newUnitForm.color
      });
      toast.success('Ünite güncellendi');
      setEditUnitDialog(false);
      setEditingUnit(null);
      fetchBookTree(selectedBook.id);
    } catch (error) {
      toast.error('Ünite güncellenemedi');
    }
  };

  // Konu düzenle
  const handleEditTopic = async () => {
    if (!newTopicForm.name || !editingTopic) return;
    try {
      await apiClient.put(`/homework/topics/${editingTopic.id}`, {
        name: newTopicForm.name
      });
      toast.success('Konu güncellendi');
      setEditTopicDialog(false);
      setEditingTopic(null);
      fetchBookTree(selectedBook.id);
    } catch (error) {
      toast.error('Konu güncellenemedi');
    }
  };

  // Test düzenle
  const handleEditTest = async () => {
    if (!newTestForm.name || !editingTest) return;
    try {
      await apiClient.put(`/homework/tests/${editingTest.id}`, {
        name: newTestForm.name,
        question_count: parseInt(newTestForm.question_count) || 10
      });
      toast.success('Test güncellendi');
      setEditTestDialog(false);
      setEditingTest(null);
      fetchBookTree(selectedBook.id);
    } catch (error) {
      toast.error('Test güncellenemedi');
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

  // Yeni Plan - mevcut ödevleri temizle ve yeni plan oluştur
  const handleNewPlan = async () => {
    if (!window.confirm('Mevcut haftalık plandaki tüm ödevler silinecek. Emin misiniz?')) return;
    
    try {
      // Mevcut plan varsa sil
      if (activePlan) {
        await apiClient.delete(`/homework/plans/${activePlan.id}`);
      }
      
      // Yeni plan oluştur
      const today = new Date().toISOString().split('T')[0];
      await apiClient.post('/homework/plans', {
        student_id: studentId,
        branch_id: branchId,
        start_date: today,
        duration_days: 7
      });
      
      toast.success('Yeni plan oluşturuldu');
      fetchInitialData();
    } catch (error) {
      toast.error('Yeni plan oluşturulamadı');
    }
  };

  // Plan süresini değiştir
  const handleChangePlanDuration = async (newDuration) => {
    if (!activePlan) return;
    
    try {
      // Mevcut planı güncelle
      await apiClient.put(`/homework/plans/${activePlan.id}`, {
        duration_days: newDuration
      });
      
      toast.success(`Plan süresi ${newDuration} güne güncellendi`);
      fetchInitialData();
    } catch (error) {
      toast.error('Plan süresi güncellenemedi');
    }
  };

  // Drag & Drop handlers
  const handleDragStart = (e, item, type) => {
    setDraggedItem({ ...item, type });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, date) => {
    e.preventDefault();
    setDragOverDay(date);
  };

  const handleDragLeave = () => {
    setDragOverDay(null);
  };

  const handleDrop = async (e, date) => {
    e.preventDefault();
    setDragOverDay(null);
    
    if (!activePlan || !draggedItem) return;
    
    // Tamamlanmış test kontrolü
    const checkIfCompleted = (testId) => {
      const status = testProgress[testId]?.status;
      return status === 'completed';
    };
    
    try {
      if (draggedItem.type === 'test') {
        // Tamamlanmış test kontrolü
        if (checkIfCompleted(draggedItem.id)) {
          toast.error('Tamamlanmış testler ödev olarak verilemez');
          setDraggedItem(null);
          return;
        }
        // Tek test ekle
        await apiClient.post(`/homework/plans/${activePlan.id}/items`, {
          plan_id: activePlan.id,
          day_date: date,
          item_type: 'test',
          test_id: draggedItem.id,
          book_id: selectedBook?.id
        });
        await updateTestStatus(draggedItem.id, 'assigned', true);
      } else if (draggedItem.type === 'unit') {
        // Tamamlanmış testleri filtrele
        let skippedCount = 0;
        let addedCount = 0;
        
        for (const topic of draggedItem.topics || []) {
          for (const test of topic.tests || []) {
            if (checkIfCompleted(test.id)) {
              skippedCount++;
              continue;
            }
            await apiClient.post(`/homework/plans/${activePlan.id}/items`, {
              plan_id: activePlan.id,
              day_date: date,
              item_type: 'test',
              test_id: test.id,
              book_id: selectedBook?.id
            });
            await updateTestStatus(test.id, 'assigned', true);
            addedCount++;
          }
        }
        
        if (skippedCount > 0 && addedCount === 0) {
          toast.error('Tamamlanmış testler ödev olarak verilemez');
          setDraggedItem(null);
          return;
        } else if (skippedCount > 0) {
          toast.warning(`${skippedCount} tamamlanmış test atlandı`);
        }
      } else if (draggedItem.type === 'topic') {
        // Tamamlanmış testleri filtrele
        let skippedCount = 0;
        let addedCount = 0;
        
        for (const test of draggedItem.tests || []) {
          if (checkIfCompleted(test.id)) {
            skippedCount++;
            continue;
          }
          await apiClient.post(`/homework/plans/${activePlan.id}/items`, {
            plan_id: activePlan.id,
            day_date: date,
            item_type: 'test',
            test_id: test.id,
            book_id: selectedBook?.id
          });
          await updateTestStatus(test.id, 'assigned', true);
          addedCount++;
        }
        
        if (skippedCount > 0 && addedCount === 0) {
          toast.error('Tamamlanmış testler ödev olarak verilemez');
          setDraggedItem(null);
          return;
        } else if (skippedCount > 0) {
          toast.warning(`${skippedCount} tamamlanmış test atlandı`);
        }
      }
      
      fetchPlanItems(activePlan.id);
      refreshBooks();
      toast.success('Ödev eklendi');
    } catch (error) {
      toast.error('Ödev eklenemedi');
    }
    
    setDraggedItem(null);
  };

  // Serbest metin ödev
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

  // Tüm ödevleri tamamlandı yap
  const handleMarkAllCompleted = async () => {
    const assignedTests = getAssignedTests();
    
    for (const test of assignedTests) {
      await updateTestStatus(test.id, 'completed', true);
    }
    
    setHomeworkCheckDialog(false);
    toast.success(`${assignedTests.length} ödev tamamlandı olarak işaretlendi`);
    refreshBooks();
  };

  // Ödev verilen testleri getir
  // Tüm haftalık plandaki ödevleri getir (kitap, ünite, konu, test detaylarıyla)
  const getAllPlanHomework = () => {
    const homework = [];
    Object.entries(planItems).forEach(([date, dayItems]) => {
      dayItems.forEach(item => {
        if (item.item_type === 'test' && item.test_id) {
          const status = testProgress[item.test_id]?.status || 'not_started';
          homework.push({
            id: item.test_id,
            item,
            date,
            dayName: DAYS_TR[new Date(date).getDay()],
            dayNum: new Date(date).getDate(),
            bookName: item.test_info?.book_name || 'Kitap',
            unitName: item.test_info?.unit_name || '',
            topicName: item.test_info?.topic_name || '',
            testName: item.test_info?.test_name || 'Test',
            status
          });
        }
      });
    });
    // Tarihe göre sırala
    homework.sort((a, b) => new Date(a.date) - new Date(b.date));
    return homework;
  };

  // Bekleyen (assigned) ödevleri getir
  const getAssignedTests = () => {
    return getAllPlanHomework().filter(h => h.status === 'assigned');
  };

  // PDF Export - Öğrenci dostu renkli tasarım
  const handlePDFExport = () => {
    const planDates = getPlanDates();
    const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const startDate = new Date(activePlan?.start_date);
    const dateStr = `${startDate.getDate()} ${monthNames[startDate.getMonth()]} ${startDate.getFullYear()}`;
    
    // Branşa göre Instagram hesabı
    const instagramAccounts = {
      'Matematik': '@yeni.nesil.matematiik',
      'Türkçe': '@yeni.nesil.turkce',
      'Fen Bilimleri': '@yeni.nesil.fen.bilimleri',
      'Fen': '@yeni.nesil.fen.bilimleri'
    };
    const instagramHandle = instagramAccounts[branch?.name] || '@yeni.nesil.egitim';
    
    // Tüm kitap isimlerini topla
    const allBookNames = new Set();
    
    // Günlere göre ödevleri grupla - Kitap > Ünite > Konu > Testler
    const dayHomework = {};
    Object.entries(planItems).forEach(([date, items]) => {
      if (!dayHomework[date]) dayHomework[date] = {};
      
      items.forEach(item => {
        if (item.item_type === 'test' && item.test_info) {
          const bookName = item.test_info.book_name || selectedBook?.name || 'Kitap';
          const unitName = item.test_info.unit_name || '';
          const topicName = item.test_info.topic_name || '';
          const testName = item.test_info.test_name || 'Test';
          
          allBookNames.add(bookName);
          
          const key = `${bookName}|${unitName}|${topicName}`;
          if (!dayHomework[date][key]) {
            dayHomework[date][key] = {
              bookName,
              unitName,
              topicName,
              tests: []
            };
          }
          dayHomework[date][key].tests.push(testName);
        } else if (item.item_type === 'freetext') {
          const key = `freetext_${item.id}`;
          dayHomework[date][key] = {
            isFreetext: true,
            text: item.freetext
          };
        }
      });
    });
    
    // Kitap görevleri - Kitap > Ünite - Konular
    const bookTasks = {};
    Object.entries(planItems).forEach(([date, items]) => {
      items.forEach(item => {
        if (item.item_type === 'test' && item.test_info) {
          const bookName = item.test_info.book_name || selectedBook?.name || 'Kitap';
          const unitName = item.test_info.unit_name || '';
          const topicName = item.test_info.topic_name || '';
          
          if (!bookTasks[bookName]) bookTasks[bookName] = {};
          if (!bookTasks[bookName][unitName]) bookTasks[bookName][unitName] = new Set();
          if (topicName) bookTasks[bookName][unitName].add(topicName);
        }
      });
    });
    
    const bookNamesStr = Array.from(allBookNames).join(', ') || 'Kitap seçilmedi';
    
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Ödev Planı - ${student?.name}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap');
          
          @page {
            margin: 0;
            size: A4;
          }
          
          * { box-sizing: border-box; margin: 0; padding: 0; }
          
          body { 
            font-family: 'Nunito', sans-serif;
            background: linear-gradient(135deg, #fce7f3 0%, #ede9fe 50%, #e0f2fe 100%);
            min-height: 100vh;
            padding: 0;
            margin: 0;
          }
          
          .container {
            width: 100%;
            min-height: 100vh;
            background: white;
          }
          
          .header {
            background: linear-gradient(135deg, #c084fc 0%, #818cf8 50%, #60a5fa 100%);
            padding: 25px 30px;
            text-align: center;
            position: relative;
          }
          
          .header::before {
            content: '✨';
            position: absolute;
            top: 10px;
            left: 20px;
            font-size: 20px;
          }
          
          .header::after {
            content: '⭐';
            position: absolute;
            top: 12px;
            right: 22px;
            font-size: 18px;
          }
          
          .header h1 {
            color: white;
            font-size: 24px;
            font-weight: 800;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
            margin-bottom: 4px;
          }
          
          .header .instagram {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            margin-top: 8px;
            color: rgba(255,255,255,0.95);
            font-size: 13px;
            font-weight: 600;
          }
          
          .header .instagram svg {
            width: 18px;
            height: 18px;
          }
          
          .header .subtitle {
            color: rgba(255,255,255,0.9);
            font-size: 14px;
            font-weight: 600;
          }
          
          .student-info {
            display: flex;
            justify-content: center;
            gap: 30px;
            padding: 15px;
            background: linear-gradient(90deg, #fdf4ff 0%, #f5f3ff 50%, #eff6ff 100%);
            border-bottom: 2px dashed #e9d5ff;
          }
          
          .info-card {
            text-align: center;
            padding: 12px 20px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.05);
          }
          
          .info-card .label {
            font-size: 10px;
            color: #a855f7;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: 700;
          }
          
          .info-card .value {
            font-size: 13px;
            color: #6b21a8;
            font-weight: 700;
            margin-top: 3px;
          }
          
          .content {
            padding: 20px 25px;
          }
          
          .section-title {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 15px;
            padding-bottom: 8px;
            border-bottom: 3px solid #e9d5ff;
          }
          
          .section-title .icon {
            width: 35px;
            height: 35px;
            background: linear-gradient(135deg, #f0abfc, #c084fc);
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
          }
          
          .section-title h2 {
            color: #7c3aed;
            font-size: 18px;
            font-weight: 700;
          }
          
          .days-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-bottom: 25px;
          }
          
          .day-row {
            display: flex;
            gap: 15px;
            padding: 12px 15px;
            border-radius: 12px;
            background: #fafafa;
            border-left: 4px solid;
          }
          
          .day-row.mon { border-left-color: #ef4444; background: linear-gradient(90deg, #fef2f2 0%, #fff 100%); }
          .day-row.tue { border-left-color: #f97316; background: linear-gradient(90deg, #fff7ed 0%, #fff 100%); }
          .day-row.wed { border-left-color: #eab308; background: linear-gradient(90deg, #fefce8 0%, #fff 100%); }
          .day-row.thu { border-left-color: #22c55e; background: linear-gradient(90deg, #f0fdf4 0%, #fff 100%); }
          .day-row.fri { border-left-color: #06b6d4; background: linear-gradient(90deg, #ecfeff 0%, #fff 100%); }
          .day-row.sat { border-left-color: #8b5cf6; background: linear-gradient(90deg, #f5f3ff 0%, #fff 100%); }
          .day-row.sun { border-left-color: #ec4899; background: linear-gradient(90deg, #fdf2f8 0%, #fff 100%); }
          
          .day-label {
            min-width: 100px;
            text-align: center;
          }
          
          .day-label .day-name {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            color: #6b7280;
          }
          
          .day-label .day-num {
            font-size: 22px;
            font-weight: 800;
            color: #374151;
          }
          
          .day-tasks {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          
          .task-group {
            background: white;
            border-radius: 8px;
            padding: 10px 12px;
            border: 1px solid #e5e7eb;
          }
          
          .task-book {
            font-size: 13px;
            font-weight: 700;
            color: #4c1d95;
            margin-bottom: 3px;
          }
          
          .task-unit-topic {
            font-size: 11px;
            color: #7c3aed;
            margin-bottom: 4px;
          }
          
          .task-tests {
            font-size: 10px;
            color: #6b7280;
            font-style: italic;
          }
          
          .freetext-task {
            background: #fef3c7;
            border-color: #fbbf24;
          }
          
          .freetext-task .task-book {
            color: #92400e;
          }
          
          .empty-day {
            color: #9ca3af;
            font-size: 12px;
            font-style: italic;
          }
          
          .books-section {
            background: linear-gradient(135deg, #fdf4ff 0%, #f5f3ff 100%);
            border-radius: 16px;
            padding: 15px;
            margin-top: 20px;
          }
          
          .book-card {
            background: white;
            border-radius: 12px;
            padding: 12px 15px;
            margin-bottom: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.05);
          }
          
          .book-card:last-child {
            margin-bottom: 0;
          }
          
          .book-name {
            font-size: 14px;
            font-weight: 700;
            color: #4c1d95;
            margin-bottom: 6px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          
          .book-name::before {
            content: '📕';
          }
          
          .book-units {
            font-size: 11px;
            color: #6b7280;
            line-height: 1.6;
          }
          
          .book-unit-name {
            font-weight: 600;
            color: #7c3aed;
          }
          
          @media print {
            html, body { 
              -webkit-print-color-adjust: exact !important; 
              print-color-adjust: exact !important;
              background: white !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            .container { 
              box-shadow: none;
              width: 100%;
              min-height: auto;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📚 Haftalık Ödev Planı</h1>
            <p class="subtitle">${student?.name} • ${branch?.name}</p>
            <div class="instagram">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
              ${instagramHandle}
            </div>
          </div>
          
          <div class="student-info">
            <div class="info-card">
              <div class="label">📅 Tarih</div>
              <div class="value">${dateStr}</div>
            </div>
            <div class="info-card">
              <div class="label">📖 Kitaplar</div>
              <div class="value">${bookNamesStr}</div>
            </div>
          </div>
          
          <div class="content">
            <div class="section-title">
              <div class="icon">📋</div>
              <h2>Bu Hafta Yapılacaklar</h2>
            </div>
            
            <div class="days-list">
    `;
    
    const dayClasses = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    
    planDates.forEach(({ date, dayName, dayNum }) => {
      const dayOfWeek = new Date(date).getDay();
      const dayClass = dayClasses[dayOfWeek];
      const dayTasks = dayHomework[date] || {};
      const taskKeys = Object.keys(dayTasks);
      
      html += `
        <div class="day-row ${dayClass}">
          <div class="day-label">
            <div class="day-name">${dayName}</div>
            <div class="day-num">${dayNum}</div>
          </div>
          <div class="day-tasks">
      `;
      
      if (taskKeys.length === 0) {
        html += '<p class="empty-day">Ödev yok</p>';
      } else {
        taskKeys.forEach(key => {
          const task = dayTasks[key];
          if (task.isFreetext) {
            html += `
              <div class="task-group freetext-task">
                <div class="task-book">${task.text}</div>
              </div>
            `;
          } else {
            const testsStr = task.tests.join(', ');
            html += `
              <div class="task-group">
                <div class="task-book">${task.bookName}</div>
                <div class="task-unit-topic">${task.unitName}${task.topicName ? ' • ' + task.topicName : ''}</div>
                <div class="task-tests">${testsStr}</div>
              </div>
            `;
          }
        });
      }
      
      html += `
          </div>
        </div>
      `;
    });
    
    html += `
            </div>
    `;
    
    // Kitap görevleri bölümü
    if (Object.keys(bookTasks).length > 0) {
      html += `
            <div class="books-section">
              <div class="section-title">
                <div class="icon">📖</div>
                <h2>Kitap Görevleri</h2>
              </div>
      `;
      
      Object.entries(bookTasks).forEach(([bookName, units]) => {
        html += `
              <div class="book-card">
                <div class="book-name">${bookName}</div>
                <div class="book-units">
        `;
        
        const unitEntries = Object.entries(units);
        unitEntries.forEach(([unitName, topics], idx) => {
          const topicsArr = Array.from(topics);
          const topicsStr = topicsArr.length > 0 ? ' - ' + topicsArr.join(', ') : '';
          html += `<span class="book-unit-name">${unitName}</span>${topicsStr}`;
          if (idx < unitEntries.length - 1) html += '<br/>';
        });
        
        html += `
                </div>
              </div>
        `;
      });
      
      html += `
            </div>
      `;
    }
    
    html += `
          </div>
        </div>
        
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 500);
          };
        </script>
      </body>
      </html>
    `;
    
    // Yeni pencere aç ve içeriği yaz
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    } else {
      toast.error('Pop-up engelleyici aktif olabilir');
    }
  };

  // Deneme fonksiyonları
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

  const handleDeleteTrial = async (trialId) => {
    if (!window.confirm('Bu denemeyi silmek istediğinize emin misiniz?')) return;
    
    try {
      await apiClient.delete(`/homework/trials/${trialId}`);
      toast.success('Deneme silindi');
      fetchTrials();
    } catch (error) {
      toast.error('Deneme silinemedi');
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

  // Status popup
  const openStatusPopup = (e, testId) => {
    e.stopPropagation();
    const rect = e.target.getBoundingClientRect();
    setStatusPopup({
      open: true,
      testId,
      x: Math.min(rect.left, window.innerWidth - 180),
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

  const getPlanDates = () => {
    if (!activePlan) return [];
    
    const dates = [];
    const start = new Date(activePlan.start_date);
    
    for (let i = 0; i < activePlan.duration_days; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      const dayName = DAYS_TR[date.getDay()];
      dates.push({ date: dateStr, dayName, dayNum: date.getDate() });
    }
    
    return dates;
  };

  const getTestStatusInfo = (testId) => {
    const status = testProgress[testId]?.status || 'not_started';
    return TEST_STATUSES[status] || TEST_STATUSES.not_started;
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

  const assignedTests = getAssignedTests();

  return (
    <TeacherLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/teacher/students')} className="p-2">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-slate-800">{student?.name}</h1>
              <p className="text-sm text-slate-500">{branch?.name} • Ödev Takip</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
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
        <div className="flex gap-1 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('homework')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'homework' ? 'border-purple-500 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Ödev Takip
          </button>
          <button
            onClick={() => setActiveTab('trials')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'trials' ? 'border-purple-500 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Denemeler
          </button>
        </div>

        {activeTab === 'homework' ? (
          <>
            {/* Üst Satır - 2 Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Sol Panel - Kitaplar */}
              <div className="teacher-card p-3">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-slate-700 text-sm">Kitaplar</h2>
                  <div className="flex gap-1">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-7 text-xs"
                      onClick={() => {
                        setCreateBookDialog(true);
                      }}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Oluştur
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-7 text-xs"
                      onClick={() => {
                        setShowOtherLevelBooks(false);
                        setSelectedBookLevel(null);
                        fetchAvailableBooks();
                        setAddBookDialog(true);
                      }}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Ekle
                    </Button>
                  </div>
                </div>
                
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2 pr-2">
                    {books.length === 0 ? (
                      <div className="text-center py-6 text-slate-400">
                        <Book className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Henüz kitap yok</p>
                      </div>
                    ) : (
                      books.map(book => (
                        <div
                          key={book.id}
                          onClick={() => setSelectedBook(book)}
                          className={`p-2 rounded-lg border cursor-pointer transition-all ${
                            selectedBook?.id === book.id ? 'border-purple-500 bg-purple-50' : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <h3 className="font-medium text-slate-800 text-sm truncate">{book.name}</h3>
                              <div className="flex items-center gap-2 mt-1">
                                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-purple-500" style={{ width: `${book.progress_percent}%` }} />
                                </div>
                                <span className="text-xs text-purple-600 font-medium">{book.progress_percent}%</span>
                              </div>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRemoveBook(book.id); }}
                              className="p-1 hover:bg-red-100 rounded text-slate-400 hover:text-red-500"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Sağ Panel - Kitap Ağacı */}
              <div className="teacher-card p-3">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-slate-700 text-sm">
                    {selectedBook ? selectedBook.name : 'Kitap İçeriği'}
                    <span className="text-xs text-slate-400 ml-2">(sürükle-bırak ile ödev ver)</span>
                  </h2>
                  {selectedBook && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-7 text-xs"
                      onClick={() => setAddUnitDialog(true)}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Ünite
                    </Button>
                  )}
                </div>
                
                <ScrollArea className="h-[200px]">
                  {!selectedBook ? (
                    <div className="text-center py-8 text-slate-400">
                      <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Kitap seçin</p>
                    </div>
                  ) : !bookTree ? (
                    <div className="text-center py-6 text-slate-500 text-sm">Yükleniyor...</div>
                  ) : bookTree.tree.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      <p className="text-sm mb-2">Henüz ünite yok</p>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setAddUnitDialog(true)}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        İlk Üniteyi Ekle
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-1 pr-2">
                      {bookTree.tree.map(unit => (
                        <div key={unit.id} className="border rounded-lg overflow-hidden">
                          {/* Unit Header - Draggable */}
                          <div
                            draggable
                            onDragStart={(e) => handleDragStart(e, unit, 'unit')}
                            className="flex items-center gap-2 p-2 bg-slate-50 cursor-grab hover:bg-slate-100 group"
                          >
                            <GripVertical className="w-3 h-3 text-slate-300 group-hover:text-slate-500" />
                            <button onClick={() => toggleUnit(unit.id)}>
                              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${!expandedUnits[unit.id] ? '-rotate-90' : ''}`} />
                            </button>
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: unit.color || '#94a3b8' }} />
                            <span className="text-xs font-medium text-slate-700 flex-1 truncate" onClick={() => toggleUnit(unit.id)}>{unit.name}</span>
                            <button
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setEditingUnit(unit); 
                                setNewUnitForm({ name: unit.name, color: unit.color || '#8b5cf6' }); 
                                setEditUnitDialog(true); 
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 rounded text-slate-500"
                              title="Düzenle"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedUnitForTopic(unit.id); setAddTopicDialog(true); }}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-purple-100 rounded text-purple-500"
                              title="Konu Ekle"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          {expandedUnits[unit.id] && (
                            <div className="border-t">
                              {unit.topics?.length === 0 && (
                                <div className="text-center py-3 text-slate-400 text-xs">
                                  <button
                                    onClick={() => { setSelectedUnitForTopic(unit.id); setAddTopicDialog(true); }}
                                    className="text-purple-500 hover:text-purple-700"
                                  >
                                    + Konu Ekle
                                  </button>
                                </div>
                              )}
                              {unit.topics?.map(topic => (
                                <div key={topic.id}>
                                  {/* Topic - Draggable */}
                                  <div
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, topic, 'topic')}
                                    className="flex items-center gap-2 p-1.5 pl-6 cursor-grab hover:bg-slate-50 border-b group"
                                  >
                                    <GripVertical className="w-3 h-3 text-slate-300 group-hover:text-slate-500" />
                                    <button onClick={() => toggleTopic(topic.id)}>
                                      <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${!expandedTopics[topic.id] ? '-rotate-90' : ''}`} />
                                    </button>
                                    <span className="text-xs text-slate-600 flex-1 truncate" onClick={() => toggleTopic(topic.id)}>{topic.name}</span>
                                    <span className="text-[10px] text-slate-400">{topic.tests?.length || 0}</span>
                                    <button
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        setEditingTopic(topic); 
                                        setNewTopicForm({ name: topic.name }); 
                                        setEditTopicDialog(true); 
                                      }}
                                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 rounded text-slate-500"
                                      title="Düzenle"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setSelectedTopicForTest(topic.id); setAddTestDialog(true); }}
                                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-blue-100 rounded text-blue-500"
                                      title="Test Ekle"
                                    >
                                      <Plus className="w-3 h-3" />
                                    </button>
                                  </div>

                                  {/* Tests */}
                                  {expandedTopics[topic.id] && (
                                    <>
                                      {topic.tests?.length === 0 && (
                                        <div className="text-center py-2 text-slate-400 text-xs pl-10">
                                          <button
                                            onClick={() => { setSelectedTopicForTest(topic.id); setAddTestDialog(true); }}
                                            className="text-blue-500 hover:text-blue-700"
                                          >
                                            + Test Ekle
                                          </button>
                                        </div>
                                      )}
                                      {topic.tests?.map(test => {
                                        const statusInfo = getTestStatusInfo(test.id);
                                        const StatusIcon = statusInfo.icon;
                                        
                                        return (
                                          <div
                                            key={test.id}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, test, 'test')}
                                            className={`flex items-center gap-2 p-1.5 pl-10 border-b last:border-b-0 cursor-grab group ${statusInfo.bgClass}`}
                                          >
                                            <GripVertical className="w-3 h-3 text-slate-300 group-hover:text-slate-500" />
                                            <button
                                              onClick={(e) => openStatusPopup(e, test.id)}
                                              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all hover:scale-110 ${statusInfo.color} ${statusInfo.textColor}`}
                                            >
                                              {StatusIcon && <StatusIcon className="w-3 h-3" />}
                                            </button>
                                            <span className={`text-xs flex-1 truncate ${statusInfo.textColor}`}>{test.name}</span>
                                            <button
                                              onClick={(e) => { 
                                                e.stopPropagation(); 
                                                setEditingTest(test); 
                                                setNewTestForm({ name: test.name, question_count: test.question_count || 10 }); 
                                                setEditTestDialog(true); 
                                              }}
                                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 rounded text-slate-500"
                                              title="Düzenle"
                                            >
                                              <Pencil className="w-3 h-3" />
                                            </button>
                                          </div>
                                        );
                                      })}
                                    </>
                                  )}
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
            </div>

            {/* Alt Satır - Haftalık Plan (Tam genişlik) */}
            <div className="teacher-card p-4">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <h2 className="font-semibold text-slate-700">Haftalık Plan</h2>
                  {activePlan && (
                    <select
                      value={activePlan.duration_days || 7}
                      onChange={(e) => handleChangePlanDuration(parseInt(e.target.value))}
                      className="text-sm border rounded-md px-2 py-1 bg-white text-slate-700"
                    >
                      {[7,8,9,10,11,12,13,14,15,16,17,18,19,20,21].map(n => (
                        <option key={n} value={n}>{n} gün</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {activePlan && (
                    <>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setHomeworkCheckDialog(true)}
                        className="gap-1 border-green-300 text-green-700 hover:bg-green-50"
                      >
                        <ClipboardCheck className="w-4 h-4" />
                        Ödev Kontrol {getAllPlanHomework().length > 0 && `(${getAllPlanHomework().length})`}
                      </Button>
                      <Button variant="outline" size="sm" onClick={handlePDFExport} className="gap-1">
                        <Download className="w-4 h-4" />
                        PDF
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={handleNewPlan}
                        className="gap-1 border-orange-300 text-orange-700 hover:bg-orange-50"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Yeni Plan
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          setFreetextDate(getPlanDates()[0]?.date || '');
                          setFreetextDialog(true);
                        }}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Not
                      </Button>
                    </>
                  )}
                </div>
              </div>
              
              {!activePlan ? (
                <div className="text-center py-8 text-slate-400">
                  <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Henüz plan yok</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="flex gap-2 min-w-max">
                    {getPlanDates().map(({ date, dayName, dayNum }) => {
                      const dayItems = planItems[date] || [];
                      const isToday = date === new Date().toISOString().split('T')[0];
                      const isDragOver = dragOverDay === date;
                      
                      return (
                        <div 
                          key={date}
                          onDragOver={(e) => handleDragOver(e, date)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, date)}
                          className={`w-36 border rounded-lg overflow-hidden transition-all ${
                            isToday ? 'border-purple-400 bg-purple-50/50' : ''
                          } ${isDragOver ? 'border-purple-500 bg-purple-100 scale-105' : ''}`}
                        >
                          <div className={`px-3 py-2 text-center ${isToday ? 'bg-purple-100' : 'bg-slate-50'}`}>
                            <div className={`text-xs font-medium ${isToday ? 'text-purple-700' : 'text-slate-700'}`}>{dayName}</div>
                            <div className={`text-lg font-bold ${isToday ? 'text-purple-600' : 'text-slate-600'}`}>{dayNum}</div>
                          </div>
                          
                          <div className="p-2 min-h-[120px] space-y-1">
                            {dayItems.length === 0 ? (
                              <p className="text-[10px] text-slate-400 text-center py-4">Sürükle bırak</p>
                            ) : (
                              dayItems.map(item => (
                                <div 
                                  key={item.id}
                                  className="flex items-start gap-1 p-1.5 bg-white rounded border text-xs group"
                                >
                                  {item.item_type === 'test' ? (
                                    <>
                                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1 shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <p className="font-medium text-slate-700 truncate text-[10px]">
                                          {item.test_info?.book_name}-{item.test_info?.unit_name}-{item.test_info?.topic_name}
                                        </p>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-1 shrink-0" />
                                      <p className="flex-1 text-slate-600 text-[10px] truncate">{item.freetext}</p>
                                    </>
                                  )}
                                  <button
                                    onClick={() => handleRemovePlanItem(item.id)}
                                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 rounded text-slate-400 hover:text-red-500"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Denemeler Sekmesi */
          <div className="teacher-card p-4">
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
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {trials.map(trial => {
                  const net = trial.correct_count - (trial.wrong_count / 4);
                  return (
                    <div key={trial.id} className="border rounded-lg p-4 hover:border-purple-200">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <h3 className="font-medium text-slate-800">{trial.exam_name}</h3>
                          <p className="text-sm text-slate-500">{trial.exam_date}</p>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openTrialDialog(trial)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDeleteTrial(trial.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-4 gap-2 mb-3">
                        <div className="text-center p-2 bg-green-50 rounded">
                          <p className="text-lg font-bold text-green-600">{trial.correct_count}</p>
                          <p className="text-[10px] text-slate-500">Doğru</p>
                        </div>
                        <div className="text-center p-2 bg-red-50 rounded">
                          <p className="text-lg font-bold text-red-600">{trial.wrong_count}</p>
                          <p className="text-[10px] text-slate-500">Yanlış</p>
                        </div>
                        <div className="text-center p-2 bg-slate-50 rounded">
                          <p className="text-lg font-bold text-slate-600">{trial.empty_count}</p>
                          <p className="text-[10px] text-slate-500">Boş</p>
                        </div>
                        <div className="text-center p-2 bg-purple-50 rounded">
                          <p className="text-lg font-bold text-purple-600">{net.toFixed(2)}</p>
                          <p className="text-[10px] text-slate-500">Net</p>
                        </div>
                      </div>
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
        <>
          <div className="fixed inset-0 z-40" onClick={closeStatusPopup} />
          <div 
            className="fixed z-50 bg-white rounded-lg shadow-xl border p-2 min-w-[150px]"
            style={{ left: statusPopup.x, top: statusPopup.y }}
          >
            <div className="space-y-0.5">
              {Object.entries(TEST_STATUSES).map(([key, info]) => {
                const Icon = info.icon;
                return (
                  <button
                    key={key}
                    onClick={() => handleQuickStatusChange(key)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-slate-100 ${info.textColor}`}
                  >
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${info.color}`}>
                      {Icon && <Icon className="w-2.5 h-2.5" />}
                    </div>
                    {info.label}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Ödev Kontrol Dialog */}
      <Dialog open={homeworkCheckDialog} onOpenChange={setHomeworkCheckDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-green-600" />
              Haftalık Ödev Kontrolü
            </DialogTitle>
          </DialogHeader>
          <div className="py-4" style={{ maxHeight: '60vh', overflow: 'auto' }}>
            {(() => {
              const allHomework = getAllPlanHomework();
              const pendingCount = allHomework.filter(h => h.status === 'assigned').length;
              
              return (
                <>
                  <div className="flex gap-4 mb-4 text-sm sticky top-0 bg-white pb-2 border-b">
                    <span className="text-slate-600">Toplam: <strong>{allHomework.length}</strong> ödev</span>
                    <span className="text-yellow-600">Bekleyen: <strong>{pendingCount}</strong></span>
                    <span className="text-green-600">Tamamlanan: <strong>{allHomework.filter(h => h.status === 'completed').length}</strong></span>
                  </div>
                  
                  <div className="space-y-2">
                      {allHomework.length === 0 ? (
                        <p className="text-center text-slate-500 py-8">Henüz ödev atanmamış</p>
                      ) : (
                        allHomework.map(hw => {
                          const statusInfo = TEST_STATUSES[hw.status] || TEST_STATUSES.not_started;
                          const StatusIcon = statusInfo.icon;
                          
                          return (
                            <div key={`${hw.id}-${hw.date}`} className={`p-3 rounded-lg border ${statusInfo.bgClass}`}>
                              <div className="flex items-start gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                      {hw.dayName} {hw.dayNum}
                                    </span>
                                    {StatusIcon && (
                                      <span className={`flex items-center gap-1 text-xs ${statusInfo.textColor}`}>
                                        <StatusIcon className="w-3 h-3" />
                                        {statusInfo.label}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm font-bold text-slate-800">{hw.bookName}</p>
                                  <p className="text-xs text-purple-600">{hw.unitName} {hw.topicName && `• ${hw.topicName}`}</p>
                                  <p className="text-xs text-slate-600 mt-0.5">{hw.testName}</p>
                                </div>
                                <div className="flex gap-1 shrink-0">
                                  <button
                                    onClick={() => updateTestStatus(hw.id, 'completed')}
                                    className={`p-1.5 rounded ${hw.status === 'completed' ? 'bg-green-500 text-white' : 'bg-green-100 text-green-600 hover:bg-green-200'}`}
                                    title="Tamamlandı"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => updateTestStatus(hw.id, 'incomplete')}
                                    className={`p-1.5 rounded ${hw.status === 'incomplete' ? 'bg-red-500 text-white' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
                                    title="Eksik"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => updateTestStatus(hw.id, 'needs_review')}
                                    className={`p-1.5 rounded ${hw.status === 'needs_review' ? 'bg-purple-500 text-white' : 'bg-purple-100 text-purple-600 hover:bg-purple-200'}`}
                                    title="Tekrar Gerekli"
                                  >
                                    <RotateCcw className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                </>
              );
            })()}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setHomeworkCheckDialog(false)}>Kapat</Button>
            {getAssignedTests().length > 0 && (
              <Button onClick={handleMarkAllCompleted} className="gap-1 bg-green-600 hover:bg-green-700">
                <CheckCircle2 className="w-4 h-4" />
                Bekleyenleri Tamamla ({getAssignedTests().length})
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kitap Ekleme Dialog */}
      <Dialog open={addBookDialog} onOpenChange={(open) => {
        setAddBookDialog(open);
        if (!open) {
          setShowOtherLevelBooks(false);
          setSelectedBookLevel(null);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {showOtherLevelBooks 
                ? (selectedBookLevel ? `Kitap Ekle - ${selectedBookLevel}. Sınıf` : 'Başka Sınıf Kitabı Ekle')
                : `Kitap Ekle${getStudentLevel() ? ` - ${getStudentLevel()}. Sınıf` : ''}`}
            </DialogTitle>
          </DialogHeader>
          
          {/* Başka Sınıf Kitabı Seçimi */}
          {showOtherLevelBooks && (
            <div className="border-b pb-3 mb-3">
              <p className="text-sm text-slate-500 mb-2">Sınıf seçin:</p>
              <div className="flex flex-wrap gap-2">
                {['5', '6', '7', '8'].map((level) => (
                  <Button
                    key={level}
                    variant={selectedBookLevel === level ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleSelectOtherLevel(level)}
                    className={selectedBookLevel === level ? "bg-purple-600" : ""}
                  >
                    {level}. Sınıf
                  </Button>
                ))}
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="mt-2 text-slate-500"
                onClick={() => {
                  setShowOtherLevelBooks(false);
                  setSelectedBookLevel(null);
                  fetchAvailableBooks();
                }}
              >
                ← Geri Dön
              </Button>
            </div>
          )}
          
          <ScrollArea className="max-h-72">
            <div className="space-y-2 py-2">
              {availableBooks.length === 0 ? (
                <p className="text-center text-slate-500 py-4">
                  {showOtherLevelBooks && selectedBookLevel 
                    ? `${selectedBookLevel}. sınıf için eklenebilecek kitap yok`
                    : 'Eklenebilecek kitap yok'}
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
          
          {/* Başka Sınıf Kitabı Ekle Butonu */}
          {!showOtherLevelBooks && (
            <div className="border-t pt-3 mt-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full gap-2 text-purple-600 border-purple-300 hover:bg-purple-50"
                onClick={() => {
                  setShowOtherLevelBooks(true);
                  setSelectedBookLevel(null);
                  setAvailableBooks([]);
                }}
              >
                <Book className="w-4 h-4" />
                Başka Sınıf Kitabı Ekle
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Kitap Oluşturma Dialog */}
      <Dialog open={createBookDialog} onOpenChange={setCreateBookDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Yeni Kitap Oluştur</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Kitap Adı *</label>
              <Input
                value={newBookForm.name}
                onChange={(e) => setNewBookForm({ ...newBookForm, name: e.target.value })}
                placeholder="Örn: Fenomen B"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Yayınevi</label>
              <Input
                value={newBookForm.publisher}
                onChange={(e) => setNewBookForm({ ...newBookForm, publisher: e.target.value })}
                placeholder="Örn: Bilgi Yayınları"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700">Sınıf</label>
                <select
                  value={newBookForm.level}
                  onChange={(e) => setNewBookForm({ ...newBookForm, level: e.target.value })}
                  className="mt-1 w-full p-2 border rounded-lg"
                >
                  <option value="5">5. Sınıf</option>
                  <option value="6">6. Sınıf</option>
                  <option value="7">7. Sınıf</option>
                  <option value="8">8. Sınıf</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Basım Yılı</label>
                <Input
                  type="number"
                  value={newBookForm.publish_year}
                  onChange={(e) => setNewBookForm({ ...newBookForm, publish_year: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateBookDialog(false)}>İptal</Button>
            <Button onClick={handleCreateBook}>Oluştur</Button>
          </DialogFooter>
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
                  <option key={d.date} value={d.date}>{d.dayName} ({d.dayNum})</option>
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

      {/* Ünite Ekleme Dialog */}
      <Dialog open={addUnitDialog} onOpenChange={setAddUnitDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Yeni Ünite Ekle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Ünite Adı *</label>
              <Input
                value={newUnitForm.name}
                onChange={(e) => setNewUnitForm({ ...newUnitForm, name: e.target.value })}
                placeholder="Örn: Yazım Kuralları"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Renk</label>
              <div className="flex gap-2 mt-2">
                {['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'].map(color => (
                  <button
                    key={color}
                    onClick={() => setNewUnitForm({ ...newUnitForm, color })}
                    className={`w-8 h-8 rounded-full border-2 ${newUnitForm.color === color ? 'border-slate-800 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddUnitDialog(false)}>İptal</Button>
            <Button onClick={handleAddUnit}>Ekle</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Konu Ekleme Dialog */}
      <Dialog open={addTopicDialog} onOpenChange={setAddTopicDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Yeni Konu Ekle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Konu Adı *</label>
              <Input
                value={newTopicForm.name}
                onChange={(e) => setNewTopicForm({ ...newTopicForm, name: e.target.value })}
                placeholder="Örn: Büyük Harflerin Yazımı"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddTopicDialog(false); setSelectedUnitForTopic(null); }}>İptal</Button>
            <Button onClick={handleAddTopic}>Ekle</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Ekleme Dialog */}
      <Dialog open={addTestDialog} onOpenChange={setAddTestDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Yeni Test Ekle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Test Adı *</label>
              <Input
                value={newTestForm.name}
                onChange={(e) => setNewTestForm({ ...newTestForm, name: e.target.value })}
                placeholder="Örn: Test 1"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddTestDialog(false); setSelectedTopicForTest(null); }}>İptal</Button>
            <Button onClick={handleAddTest}>Ekle</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ünite Düzenleme Dialog */}
      <Dialog open={editUnitDialog} onOpenChange={setEditUnitDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Üniteyi Düzenle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Ünite Adı *</label>
              <Input
                value={newUnitForm.name}
                onChange={(e) => setNewUnitForm({ ...newUnitForm, name: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Renk</label>
              <div className="flex gap-2 mt-2">
                {['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'].map(color => (
                  <button
                    key={color}
                    onClick={() => setNewUnitForm({ ...newUnitForm, color })}
                    className={`w-8 h-8 rounded-full border-2 ${newUnitForm.color === color ? 'border-slate-800 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditUnitDialog(false); setEditingUnit(null); }}>İptal</Button>
            <Button onClick={handleEditUnit}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Konu Düzenleme Dialog */}
      <Dialog open={editTopicDialog} onOpenChange={setEditTopicDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Konuyu Düzenle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Konu Adı *</label>
              <Input
                value={newTopicForm.name}
                onChange={(e) => setNewTopicForm({ ...newTopicForm, name: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditTopicDialog(false); setEditingTopic(null); }}>İptal</Button>
            <Button onClick={handleEditTopic}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Düzenleme Dialog */}
      <Dialog open={editTestDialog} onOpenChange={setEditTestDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Testi Düzenle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Test Adı *</label>
              <Input
                value={newTestForm.name}
                onChange={(e) => setNewTestForm({ ...newTestForm, name: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditTestDialog(false); setEditingTest(null); }}>İptal</Button>
            <Button onClick={handleEditTest}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TeacherLayout>
  );
};

export default TeacherHomeworkEntry;
