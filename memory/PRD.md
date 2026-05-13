# Eğitim Portalı - Product Requirements Document

## Orijinal Problem Statement
Özel ders veren öğretmenler için kapsamlı bir eğitim merkezi yönetim sistemi. Öğrenci takibi, ders planlama, muhasebe, gamification ve ödev takip sistemi içerir.

## Temel Kullanıcılar
1. **Admin**: Tam yetki, tüm öğretmen/öğrenci/muhasebe yönetimi
2. **Öğretmen**: Kendi öğrencileri, dersleri, ödevleri yönetimi
3. **Öğrenci/Veli**: (Gelecekte planlanıyor - şu an login yok)

---

## Uygulanan Özellikler

### 1. Temel Sistem (TAMAMLANDI)
- [x] JWT tabanlı authentication (Admin + Öğretmen)
- [x] Öğrenci CRUD
- [x] Branş yönetimi (Matematik, Türkçe, Fen Bilimleri)
- [x] Ders girişi ve planlama
- [x] Grup dersleri

### 2. Muhasebe Sistemi (TAMAMLANDI)
- [x] Banka hesapları yönetimi
- [x] Gelir/gider takibi
- [x] Öğrenci ödeme durumu
- [x] Raporlama

### 3. Gamification (TAMAMLANDI)
- [x] Öğretmen puanları
- [x] Rozetler
- [x] Sıralama tablosu

### 4. Audit Log Sistemi (TAMAMLANDI)
- [x] Tüm kritik işlemlerin loglanması
- [x] Türkçe çeviriler
- [x] Grup dersler için tek log kaydı

### 5. Admin Sidebar Reorganizasyonu (TAMAMLANDI)
- [x] Collapsible kategoriler (Dersler, Muhasebe)
- [x] Düzenli menü yapısı

### 6. ÖDEV TAKİP SİSTEMİ (TAMAMLANDI - 13 Mayıs 2026)

#### Backend Tabloları:
- `books` - Kitap havuzu
- `book_units` - Ünite
- `book_topics` - Konu
- `book_tests` - Test
- `student_book_assignments` - Öğrenci-kitap ataması
- `student_test_progress` - Test ilerleme durumu
- `homework_plans` - Haftalık planlar
- `homework_plan_items` - Plan öğeleri
- `trial_exams` - Deneme sınavları
- `trial_exam_results` - Deneme sonuçları

#### API Endpoints:
- `GET/POST/PUT/DELETE /api/homework/books` - Kitap CRUD
- `GET/POST/PUT/DELETE /api/homework/units` - Ünite CRUD
- `GET/POST/PUT/DELETE /api/homework/topics` - Konu CRUD
- `GET/POST/PUT/DELETE /api/homework/tests` - Test CRUD
- `GET/POST /api/homework/students/{id}/books` - Öğrenci kitap ataması
- `GET/PUT /api/homework/students/{id}/tests/{id}/status` - Test durum güncelleme
- `GET/POST /api/homework/plans` - Haftalık plan
- `POST /api/homework/plans/{id}/items` - Plan öğesi ekleme
- `GET/POST/PUT /api/homework/trials` - Deneme sınavları

#### Admin Sayfası: `/admin/homework-content`
- [x] Kitap oluşturma/düzenleme
- [x] Ünite ekleme
- [x] Konu ekleme
- [x] Test ekleme
- [x] 5,6,7,8. sınıf filtreleme
- [x] Basım yılı gösterimi

#### Öğretmen Sayfası: `/teacher/students/{id}/homework/{branch_id}`
- [x] **2 Panelli Üst Layout**: Kitaplar (sol) + Kitap İçeriği (sağ)
- [x] **Yatay Haftalık Plan**: Alt satırda yatay gün kartları
- [x] **Sürükle-Bırak Ödev Atama**: Ünite/Konu/Test sürükle-bırak
- [x] **Öğretmen Kitap Oluşturma**: "+ Oluştur" butonu ile yeni kitap tanımlama
- [x] **Otomatik Kitap Atama**: Öğretmen kitap oluşturunca öğrenciye otomatik atanır
- [x] **Öğretmen Ünite Ekleme**: Kitaba ünite ekleme (+ Ünite butonu)
- [x] **Öğretmen Konu Ekleme**: Üniteye konu ekleme (+ Konu Ekle bağlantısı)
- [x] **Öğretmen Test Ekleme**: Konuya test ekleme (+ Test Ekle bağlantısı)
- [x] **Test Durum Göstergeleri**: Başlanmadı, Ödev Verildi, Tamamlandı, Eksik, Tekrar Gerekli, Pas Geçildi
- [x] **Ödev Kontrol Modal'ı**: Bekleyen ödevleri listeler
- [x] **"Tamamı Yapıldı" Butonu**: Tek tıkla tüm ödevleri tamamla
- [x] **PDF Export**: Öğrenci dostu pastel renkli tasarım (yeni sekme + print dialog)
- [x] **Serbest Not Ekleme**: "+ Not" butonu
- [x] **Denemeler Sekmesi**: Deneme sınavı sonuçları girişi
- [x] **Geri Al (Undo)**: Son durum değişikliğini geri al
- [x] **Progress Bar**: Kitap tamamlanma yüzdesi

---

## Yapılmayacak Görevler (Kullanıcı Kararı)
- ~~Admin'den öğretmene kitap atama~~
- ~~iOS/PWA mobil uygulama dönüşümü~~
- ~~WordPress entegrasyonu~~
- ~~Hızlı ders ekleme butonu~~
- ~~Kamp SMS hatırlatmaları~~

---

## Teknik Detaylar

### Teknoloji Stack
- **Backend**: FastAPI, Python, Motor (async MongoDB)
- **Frontend**: React 19, Tailwind CSS, Shadcn UI
- **Database**: MongoDB
- **Auth**: JWT

### Dosya Yapısı
```
/app
├── backend/
│   └── server.py (~5600 satır - monolitik, refaktör istenmedi)
└── frontend/
    └── src/
        ├── pages/
        │   ├── admin/
        │   │   └── AdminHomeworkContent.jsx
        │   └── teacher/
        │       ├── TeacherHomeworkEntry.jsx (2050+ satır)
        │       └── TeacherStudents.jsx
        └── components/
            └── layouts/
                └── AdminLayout.jsx
```

---

## Test Credentials
- **Admin**: `admin` / `test123`
- **Öğretmen**: `ilknur.uzunal` / `test123`, `buse.gunes` / `test123`

---

## Son Güncelleme
- **Tarih**: 13 Mayıs 2026
- **Son Değişiklikler**:
  - PDF Export: Pastel renkli, öğrenci dostu yeni tasarım
  - Kitap oluşturma: Otomatik öğrenciye atama
  - Öğretmen içerik yönetimi: Ünite, konu ve test ekleme
  - Backend yetki düzenlemeleri: Öğretmen içerik ekleyebilir
