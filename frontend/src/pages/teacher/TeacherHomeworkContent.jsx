import React, { useState, useEffect } from 'react';
import { Book, Plus, Edit, Trash2, ChevronRight, ChevronDown, Search, FileText, Layers, BookOpen, Copy, ArrowUp, ArrowDown } from 'lucide-react';
import TeacherLayout from '../../components/layouts/TeacherLayout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog';
import { ScrollArea } from '../../components/ui/scroll-area';
import apiClient from '../../api/axios';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';

const BOOK_TYPES = [
  { value: 'soru_bankasi', label: 'Soru Bankası' },
  { value: 'paragraf_kitabi', label: 'Paragraf Kitabı' },
  { value: 'brans_denemesi', label: 'Branş Denemesi' },
  { value: 'fasikul', label: 'Fasikül' },
  { value: 'meb_kaynagi', label: 'MEB Kaynağı' },
  { value: 'kamp_kitabi', label: 'Kamp Kitabı' },
  { value: 'ozel_kaynak', label: 'Özel Kaynak' },
];

const LEVELS = ['5', '6', '7', '8'];

const TeacherHomeworkContent = () => {
  const { user } = useAuth();
  const [books, setBooks] = useState([]);
  const [branches, setBranches] = useState([]);
  const [teacherBranches, setTeacherBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLevel, setFilterLevel] = useState('all');
  
  // Selected book & tree
  const [selectedBook, setSelectedBook] = useState(null);
  const [bookTree, setBookTree] = useState(null);
  const [expandedUnits, setExpandedUnits] = useState({});
  const [expandedTopics, setExpandedTopics] = useState({});
  
  // Dialogs
  const [bookDialogOpen, setBookDialogOpen] = useState(false);
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [topicDialogOpen, setTopicDialogOpen] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  // Form states
  const [editingBook, setEditingBook] = useState(null);
  const [editingUnit, setEditingUnit] = useState(null);
  const [editingTopic, setEditingTopic] = useState(null);
  const [editingTest, setEditingTest] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  
  // Form data
  const [bookForm, setBookForm] = useState({ name: '', publisher: '', branch_id: '', level: '', book_type: 'soru_bankasi', publish_year: '' });
  const [unitForm, setUnitForm] = useState({ name: '', color: '' });
  const [topicForm, setTopicForm] = useState({ name: '', total_questions: '' });
  const [testForm, setTestForm] = useState({ name: '', question_count: '', difficulty: '', test_type: '' });

  useEffect(() => {
    fetchData();
  }, [user]);

  useEffect(() => {
    if (selectedBook) {
      fetchBookTree(selectedBook.id);
    }
  }, [selectedBook]);

  const fetchData = async () => {
    try {
      // Önce öğretmenin branşlarını al
      let teacherBranchIds = [];
      if (user?.teacher_id) {
        const teacherRes = await apiClient.get(`/teachers/${user.teacher_id}`);
        const teacherData = teacherRes.data;
        teacherBranchIds = teacherData.branches?.map(b => b.branch_id) || [];
        setTeacherBranches(teacherData.branches || []);
      }

      const [booksRes, branchesRes] = await Promise.all([
        apiClient.get('/homework/books'),
        apiClient.get('/branches')
      ]);
      
      // Sadece öğretmenin branşlarına ait kitapları filtrele
      const filteredBooks = booksRes.data.filter(book => 
        teacherBranchIds.includes(book.branch_id)
      );
      
      // Sadece öğretmenin branşlarını göster
      const filteredBranches = branchesRes.data.filter(branch =>
        teacherBranchIds.includes(branch.id)
      );
      
      setBooks(filteredBooks);
      setBranches(filteredBranches);
      
      // İlk branşı varsayılan olarak ayarla
      if (filteredBranches.length > 0) {
        setBookForm(prev => ({ ...prev, branch_id: filteredBranches[0].id }));
      }
    } catch (error) {
      toast.error('Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const fetchBookTree = async (bookId) => {
    try {
      const response = await apiClient.get(`/homework/books/${bookId}/tree`);
      setBookTree(response.data);
    } catch (error) {
      toast.error('Kitap içeriği yüklenemedi');
    }
  };

  // Filter books
  const filteredBooks = books.filter(book => {
    const matchesSearch = book.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (book.publisher && book.publisher.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesLevel = filterLevel === 'all' || book.level === filterLevel;
    return matchesSearch && matchesLevel;
  });

  // Book CRUD
  const openBookDialog = (book = null) => {
    if (book) {
      setEditingBook(book);
      setBookForm({
        name: book.name,
        publisher: book.publisher || '',
        branch_id: book.branch_id,
        level: book.level,
        book_type: book.book_type,
        publish_year: book.publish_year || ''
      });
    } else {
      setEditingBook(null);
      setBookForm({ 
        name: '', 
        publisher: '', 
        branch_id: branches[0]?.id || '', 
        level: '8', 
        book_type: 'soru_bankasi', 
        publish_year: '' 
      });
    }
    setBookDialogOpen(true);
  };

  const handleSaveBook = async () => {
    if (!bookForm.name || !bookForm.branch_id || !bookForm.level) {
      toast.error('Kitap adı, branş ve sınıf zorunludur');
      return;
    }
    try {
      const data = {
        ...bookForm,
        publish_year: bookForm.publish_year ? parseInt(bookForm.publish_year) : null
      };
      if (editingBook) {
        await apiClient.put(`/homework/books/${editingBook.id}`, data);
        toast.success('Kitap güncellendi');
      } else {
        await apiClient.post('/homework/books', data);
        toast.success('Kitap oluşturuldu');
      }
      setBookDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'İşlem başarısız');
    }
  };

  // Copy book with all content
  const handleCopyBook = async (bookId) => {
    try {
      await apiClient.post(`/homework/books/${bookId}/copy`);
      toast.success('Kitap kopyalandı');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Kopyalama başarısız');
    }
  };

  // Reorder units
  const handleMoveUnit = async (unitId, direction) => {
    if (!bookTree) return;
    
    const units = [...bookTree.tree];
    const currentIndex = units.findIndex(u => u.id === unitId);
    
    if (direction === 'up' && currentIndex > 0) {
      [units[currentIndex], units[currentIndex - 1]] = [units[currentIndex - 1], units[currentIndex]];
    } else if (direction === 'down' && currentIndex < units.length - 1) {
      [units[currentIndex], units[currentIndex + 1]] = [units[currentIndex + 1], units[currentIndex]];
    } else {
      return;
    }
    
    // Update order numbers
    const unitOrders = units.map((u, idx) => ({ id: u.id, order: idx + 1 }));
    
    try {
      await apiClient.put(`/homework/books/${selectedBook.id}/units/reorder`, unitOrders);
      toast.success('Sıralama güncellendi');
      fetchBookTree(selectedBook.id);
    } catch (error) {
      toast.error('Sıralama güncellenemedi');
    }
  };

  // Reorder topics within a unit
  const handleMoveTopic = async (unitId, topicId, direction) => {
    if (!bookTree) return;
    
    const unit = bookTree.tree.find(u => u.id === unitId);
    if (!unit || !unit.topics) return;
    
    const topics = [...unit.topics];
    const currentIndex = topics.findIndex(t => t.id === topicId);
    
    if (direction === 'up' && currentIndex > 0) {
      [topics[currentIndex], topics[currentIndex - 1]] = [topics[currentIndex - 1], topics[currentIndex]];
    } else if (direction === 'down' && currentIndex < topics.length - 1) {
      [topics[currentIndex], topics[currentIndex + 1]] = [topics[currentIndex + 1], topics[currentIndex]];
    } else {
      return;
    }
    
    // Update order numbers
    const topicOrders = topics.map((t, idx) => ({ id: t.id, order: idx + 1 }));
    
    try {
      await apiClient.put(`/homework/units/${unitId}/topics/reorder`, topicOrders);
      toast.success('Konu sıralaması güncellendi');
      fetchBookTree(selectedBook.id);
    } catch (error) {
      toast.error('Konu sıralaması güncellenemedi');
    }
  };

  // Unit CRUD
  const openUnitDialog = (unit = null) => {
    if (unit) {
      setEditingUnit(unit);
      setUnitForm({ name: unit.name, color: unit.color || '' });
    } else {
      setEditingUnit(null);
      setUnitForm({ name: '', color: '' });
    }
    setUnitDialogOpen(true);
  };

  const handleSaveUnit = async () => {
    if (!unitForm.name) {
      toast.error('Ünite adı zorunludur');
      return;
    }
    try {
      if (editingUnit) {
        await apiClient.put(`/homework/units/${editingUnit.id}`, {
          book_id: selectedBook.id,
          name: unitForm.name,
          color: unitForm.color || null
        });
        toast.success('Ünite güncellendi');
      } else {
        await apiClient.post('/homework/units', {
          book_id: selectedBook.id,
          name: unitForm.name,
          color: unitForm.color || null
        });
        toast.success('Ünite oluşturuldu');
      }
      setUnitDialogOpen(false);
      fetchBookTree(selectedBook.id);
    } catch (error) {
      toast.error('İşlem başarısız');
    }
  };

  // Topic CRUD
  const openTopicDialog = (unitId, topic = null) => {
    if (topic) {
      setEditingTopic({ ...topic, unit_id: unitId });
      setTopicForm({ name: topic.name, total_questions: topic.total_questions || '' });
    } else {
      setEditingTopic({ unit_id: unitId });
      setTopicForm({ name: '', total_questions: '' });
    }
    setTopicDialogOpen(true);
  };

  const handleSaveTopic = async () => {
    if (!topicForm.name) {
      toast.error('Konu adı zorunludur');
      return;
    }
    try {
      const data = {
        unit_id: editingTopic.unit_id,
        name: topicForm.name,
        total_questions: topicForm.total_questions ? parseInt(topicForm.total_questions) : null
      };
      if (editingTopic.id) {
        await apiClient.put(`/homework/topics/${editingTopic.id}`, data);
        toast.success('Konu güncellendi');
      } else {
        await apiClient.post('/homework/topics', data);
        toast.success('Konu oluşturuldu');
      }
      setTopicDialogOpen(false);
      fetchBookTree(selectedBook.id);
    } catch (error) {
      toast.error('İşlem başarısız');
    }
  };

  // Test CRUD
  const openTestDialog = (topicId, test = null) => {
    if (test) {
      setEditingTest({ ...test, topic_id: topicId });
      setTestForm({
        name: test.name,
        question_count: test.question_count || '',
        difficulty: test.difficulty || '',
        test_type: test.test_type || ''
      });
    } else {
      setEditingTest({ topic_id: topicId });
      setTestForm({ name: '', question_count: '', difficulty: '', test_type: '' });
    }
    setTestDialogOpen(true);
  };

  const handleSaveTest = async () => {
    if (!testForm.name) {
      toast.error('Test adı zorunludur');
      return;
    }
    try {
      const data = {
        topic_id: editingTest.topic_id,
        name: testForm.name,
        question_count: testForm.question_count ? parseInt(testForm.question_count) : null,
        difficulty: testForm.difficulty || null,
        test_type: testForm.test_type || null
      };
      if (editingTest.id) {
        await apiClient.put(`/homework/tests/${editingTest.id}`, data);
        toast.success('Test güncellendi');
      } else {
        await apiClient.post('/homework/tests', data);
        toast.success('Test oluşturuldu');
      }
      setTestDialogOpen(false);
      fetchBookTree(selectedBook.id);
    } catch (error) {
      toast.error('İşlem başarısız');
    }
  };

  // Delete handlers
  const openDeleteDialog = (type, item) => {
    setDeleteTarget({ type, item });
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    try {
      const { type, item } = deleteTarget;
      switch (type) {
        case 'book':
          await apiClient.delete(`/homework/books/${item.id}`);
          setSelectedBook(null);
          setBookTree(null);
          fetchData();
          break;
        case 'unit':
          await apiClient.delete(`/homework/units/${item.id}`);
          fetchBookTree(selectedBook.id);
          break;
        case 'topic':
          await apiClient.delete(`/homework/topics/${item.id}`);
          fetchBookTree(selectedBook.id);
          break;
        case 'test':
          await apiClient.delete(`/homework/tests/${item.id}`);
          fetchBookTree(selectedBook.id);
          break;
        default:
          break;
      }
      toast.success('Silindi');
      setDeleteDialogOpen(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Silme başarısız');
    }
  };

  const toggleUnit = (unitId) => {
    setExpandedUnits(prev => ({ ...prev, [unitId]: !prev[unitId] }));
  };

  const toggleTopic = (topicId) => {
    setExpandedTopics(prev => ({ ...prev, [topicId]: !prev[topicId] }));
  };

  const getBookTypeLabel = (type) => BOOK_TYPES.find(t => t.value === type)?.label || type;

  // Öğretmenin branş adını al
  const getTeacherBranchName = () => {
    if (branches.length === 1) {
      return branches[0].name;
    }
    return branches.map(b => b.name).join(', ');
  };

  return (
    <TeacherLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <BookOpen className="w-7 h-7 text-teal-600" />
              İçerik Yönetimi
            </h1>
            <p className="text-slate-600 mt-1">
              {getTeacherBranchName()} branşı için kitap ve içerik yönetimi
            </p>
          </div>
          <Button onClick={() => openBookDialog()} className="gap-2 bg-teal-600 hover:bg-teal-700">
            <Plus className="w-4 h-4" />
            Yeni Kitap
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sol Panel - Kitap Listesi */}
          <div className="lg:col-span-1 teacher-card p-4 space-y-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Kitap ara..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Sadece sınıf filtresi göster (branş filtresi yok) */}
            <div>
              <Select value={filterLevel} onValueChange={setFilterLevel}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Sınıf" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Sınıflar</SelectItem>
                  {LEVELS.map(l => (
                    <SelectItem key={l} value={l}>{l}. Sınıf</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ScrollArea className="h-[calc(100vh-380px)]">
              <div className="space-y-2 pr-2">
                {loading ? (
                  <div className="text-center py-8 text-slate-500">Yükleniyor...</div>
                ) : filteredBooks.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <Book className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                    <p>Kitap bulunamadı</p>
                  </div>
                ) : (
                  filteredBooks.map(book => (
                    <div
                      key={book.id}
                      onClick={() => setSelectedBook(book)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedBook?.id === book.id
                          ? 'border-teal-500 bg-teal-50'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-medium text-slate-800 truncate">{book.name}</h3>
                          {book.publish_year && (
                            <p className="text-xs text-teal-600 font-medium">{book.publish_year} Basım</p>
                          )}
                          <p className="text-xs text-slate-500 mt-0.5">
                            {book.branch_name} • {book.level}. Sınıf
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {getBookTypeLabel(book.book_type)}
                            {book.publisher && ` • ${book.publisher}`}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Sağ Panel - Kitap İçerik Ağacı */}
          <div className="lg:col-span-2 teacher-card p-4">
            {!selectedBook ? (
              <div className="h-full flex items-center justify-center text-slate-500">
                <div className="text-center">
                  <Layers className="w-16 h-16 mx-auto text-slate-300 mb-4" />
                  <p className="text-lg font-medium">Kitap Seçin</p>
                  <p className="text-sm mt-1">İçerik yapısını düzenlemek için sol listeden bir kitap seçin</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Kitap Header */}
                <div className="flex items-start justify-between gap-4 pb-4 border-b">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">{selectedBook.name}</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      {selectedBook.branch_name} • {selectedBook.level}. Sınıf • {getBookTypeLabel(selectedBook.book_type)}
                    </p>
                    {bookTree && (
                      <p className="text-sm text-teal-600 mt-1">
                        Toplam {bookTree.total_tests} test
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openBookDialog(selectedBook)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleCopyBook(selectedBook.id)}
                      title="Kitabı Kopyala"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => openDeleteDialog('book', selectedBook)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Ünite Ekle Button */}
                <Button variant="outline" size="sm" onClick={() => openUnitDialog()} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Ünite Ekle
                </Button>

                {/* Tree View */}
                <ScrollArea className="h-[calc(100vh-450px)]">
                  <div className="space-y-2 pr-2">
                    {bookTree?.tree.map(unit => (
                      <div key={unit.id} className="border rounded-lg overflow-hidden">
                        {/* Unit Header */}
                        <div
                          className="flex items-center gap-2 p-3 bg-slate-50 cursor-pointer hover:bg-slate-100"
                          onClick={() => toggleUnit(unit.id)}
                        >
                          {expandedUnits[unit.id] ? (
                            <ChevronDown className="w-4 h-4 text-slate-500" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-500" />
                          )}
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: unit.color || '#94a3b8' }}
                          />
                          <span className="font-medium text-slate-700 flex-1">{unit.name}</span>
                          <span className="text-xs text-slate-500">{unit.topics?.length || 0} konu</span>
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            <button
                              className="p-1 hover:bg-slate-200 rounded"
                              onClick={() => handleMoveUnit(unit.id, 'up')}
                              title="Yukarı Taşı"
                            >
                              <ArrowUp className="w-3.5 h-3.5 text-slate-500" />
                            </button>
                            <button
                              className="p-1 hover:bg-slate-200 rounded"
                              onClick={() => handleMoveUnit(unit.id, 'down')}
                              title="Aşağı Taşı"
                            >
                              <ArrowDown className="w-3.5 h-3.5 text-slate-500" />
                            </button>
                            <button
                              className="p-1 hover:bg-slate-200 rounded"
                              onClick={() => openUnitDialog(unit)}
                            >
                              <Edit className="w-3.5 h-3.5 text-slate-500" />
                            </button>
                            <button
                              className="p-1 hover:bg-red-100 rounded"
                              onClick={() => openDeleteDialog('unit', unit)}
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </button>
                          </div>
                        </div>

                        {/* Topics */}
                        {expandedUnits[unit.id] && (
                          <div className="border-t">
                            <div className="p-2 pl-8">
                              <button
                                className="text-xs text-teal-600 hover:text-teal-700 flex items-center gap-1"
                                onClick={() => openTopicDialog(unit.id)}
                              >
                                <Plus className="w-3 h-3" />
                                Konu Ekle
                              </button>
                            </div>
                            {unit.topics?.map((topic, topicIndex) => (
                              <div key={topic.id} className="border-t">
                                <div
                                  className="flex items-center gap-2 p-2 pl-8 cursor-pointer hover:bg-slate-50"
                                  onClick={() => toggleTopic(topic.id)}
                                >
                                  {expandedTopics[topic.id] ? (
                                    <ChevronDown className="w-4 h-4 text-slate-400" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-slate-400" />
                                  )}
                                  <FileText className="w-4 h-4 text-teal-500" />
                                  <span className="text-sm text-slate-700 flex-1">{topic.name}</span>
                                  <span className="text-xs text-slate-500">{topic.tests?.length || 0} test</span>
                                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                                    <button
                                      className={`p-1 hover:bg-slate-200 rounded ${topicIndex === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                                      onClick={() => handleMoveTopic(unit.id, topic.id, 'up')}
                                      disabled={topicIndex === 0}
                                      title="Yukarı Taşı"
                                    >
                                      <ArrowUp className="w-3 h-3 text-slate-500" />
                                    </button>
                                    <button
                                      className={`p-1 hover:bg-slate-200 rounded ${topicIndex === unit.topics.length - 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                                      onClick={() => handleMoveTopic(unit.id, topic.id, 'down')}
                                      disabled={topicIndex === unit.topics.length - 1}
                                      title="Aşağı Taşı"
                                    >
                                      <ArrowDown className="w-3 h-3 text-slate-500" />
                                    </button>
                                    <button
                                      className="p-1 hover:bg-slate-200 rounded"
                                      onClick={() => openTopicDialog(unit.id, topic)}
                                    >
                                      <Edit className="w-3 h-3 text-slate-500" />
                                    </button>
                                    <button
                                      className="p-1 hover:bg-red-100 rounded"
                                      onClick={() => openDeleteDialog('topic', topic)}
                                    >
                                      <Trash2 className="w-3 h-3 text-red-500" />
                                    </button>
                                  </div>
                                </div>

                                {/* Tests */}
                                {expandedTopics[topic.id] && (
                                  <div className="bg-slate-50 border-t">
                                    <div className="p-2 pl-14">
                                      <button
                                        className="text-xs text-teal-600 hover:text-teal-700 flex items-center gap-1"
                                        onClick={() => openTestDialog(topic.id)}
                                      >
                                        <Plus className="w-3 h-3" />
                                        Test Ekle
                                      </button>
                                    </div>
                                    {topic.tests?.map(test => (
                                      <div
                                        key={test.id}
                                        className="flex items-center gap-2 p-2 pl-14 border-t hover:bg-slate-100"
                                      >
                                        <div className="w-2 h-2 rounded-full bg-green-400" />
                                        <span className="text-sm text-slate-600 flex-1">{test.name}</span>
                                        {test.question_count && (
                                          <span className="text-xs text-slate-400">{test.question_count} soru</span>
                                        )}
                                        <div className="flex gap-1">
                                          <button
                                            className="p-1 hover:bg-slate-200 rounded"
                                            onClick={() => openTestDialog(topic.id, test)}
                                          >
                                            <Edit className="w-3 h-3 text-slate-500" />
                                          </button>
                                          <button
                                            className="p-1 hover:bg-red-100 rounded"
                                            onClick={() => openDeleteDialog('test', test)}
                                          >
                                            <Trash2 className="w-3 h-3 text-red-500" />
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Book Dialog */}
      <Dialog open={bookDialogOpen} onOpenChange={setBookDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingBook ? 'Kitap Düzenle' : 'Yeni Kitap'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Kitap Adı *</label>
              <Input
                value={bookForm.name}
                onChange={(e) => setBookForm({ ...bookForm, name: e.target.value })}
                placeholder="Örn: Fenomen B"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Yayınevi</label>
              <Input
                value={bookForm.publisher}
                onChange={(e) => setBookForm({ ...bookForm, publisher: e.target.value })}
                placeholder="Örn: Bilgi Yayınları"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700">Branş *</label>
                {branches.length === 1 ? (
                  <Input
                    value={branches[0]?.name || ''}
                    disabled
                    className="mt-1 bg-slate-100"
                  />
                ) : (
                  <Select value={bookForm.branch_id} onValueChange={(v) => setBookForm({ ...bookForm, branch_id: v })}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Branş seç" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map(b => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Sınıf *</label>
                <Select value={bookForm.level} onValueChange={(v) => setBookForm({ ...bookForm, level: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Sınıf seç" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.map(l => (
                      <SelectItem key={l} value={l}>{l}. Sınıf</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700">Kitap Tipi</label>
                <Select value={bookForm.book_type} onValueChange={(v) => setBookForm({ ...bookForm, book_type: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOOK_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Basım Yılı</label>
                <Input
                  type="number"
                  value={bookForm.publish_year}
                  onChange={(e) => setBookForm({ ...bookForm, publish_year: e.target.value })}
                  placeholder="2024"
                  className="mt-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBookDialogOpen(false)}>İptal</Button>
            <Button onClick={handleSaveBook} className="bg-teal-600 hover:bg-teal-700">Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unit Dialog */}
      <Dialog open={unitDialogOpen} onOpenChange={setUnitDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingUnit?.id ? 'Ünite Düzenle' : 'Yeni Ünite'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Ünite Adı *</label>
              <Input
                value={unitForm.name}
                onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })}
                placeholder="Örn: Yazım Kuralları"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Renk (Opsiyonel)</label>
              <Input
                type="color"
                value={unitForm.color || '#94a3b8'}
                onChange={(e) => setUnitForm({ ...unitForm, color: e.target.value })}
                className="mt-1 h-10"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnitDialogOpen(false)}>İptal</Button>
            <Button onClick={handleSaveUnit} className="bg-teal-600 hover:bg-teal-700">Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Topic Dialog */}
      <Dialog open={topicDialogOpen} onOpenChange={setTopicDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingTopic?.id ? 'Konu Düzenle' : 'Yeni Konu'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Konu Adı *</label>
              <Input
                value={topicForm.name}
                onChange={(e) => setTopicForm({ ...topicForm, name: e.target.value })}
                placeholder="Örn: Büyük Harfler"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Toplam Soru (Opsiyonel)</label>
              <Input
                type="number"
                value={topicForm.total_questions}
                onChange={(e) => setTopicForm({ ...topicForm, total_questions: e.target.value })}
                placeholder="Örn: 50"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTopicDialogOpen(false)}>İptal</Button>
            <Button onClick={handleSaveTopic} className="bg-teal-600 hover:bg-teal-700">Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Dialog */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingTest?.id ? 'Test Düzenle' : 'Yeni Test'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Test Adı *</label>
              <Input
                value={testForm.name}
                onChange={(e) => setTestForm({ ...testForm, name: e.target.value })}
                placeholder="Örn: Test 1"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700">Soru Sayısı</label>
                <Input
                  type="number"
                  value={testForm.question_count}
                  onChange={(e) => setTestForm({ ...testForm, question_count: e.target.value })}
                  placeholder="10"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Zorluk</label>
                <Select value={testForm.difficulty} onValueChange={(v) => setTestForm({ ...testForm, difficulty: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Seç" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kolay">Kolay</SelectItem>
                    <SelectItem value="orta">Orta</SelectItem>
                    <SelectItem value="zor">Zor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestDialogOpen(false)}>İptal</Button>
            <Button onClick={handleSaveTest} className="bg-teal-600 hover:bg-teal-700">Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Silmek istediğinize emin misiniz?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === 'book' && 'Bu kitap ve içindeki tüm üniteler, konular ve testler silinecek. Öğrenci ilerlemeleri de kaybolacak.'}
              {deleteTarget?.type === 'unit' && 'Bu ünite ve altındaki tüm konular ve testler silinecek.'}
              {deleteTarget?.type === 'topic' && 'Bu konu ve altındaki tüm testler silinecek.'}
              {deleteTarget?.type === 'test' && 'Bu test silinecek.'}
              <br /><br />
              <strong>Bu işlem geri alınamaz!</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TeacherLayout>
  );
};

export default TeacherHomeworkContent;
