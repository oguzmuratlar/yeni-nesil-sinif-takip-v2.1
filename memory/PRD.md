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
- [x] Tarih formatı: "13 Mayıs 2026" (gün ay yıl)

### 5. Admin Sidebar Reorganizasyonu (TAMAMLANDI)
- [x] Collapsible kategoriler (Dersler, Muhasebe)
- [x] Düzenli menü yapısı

### 6. ÖDEV TAKİP SİSTEMİ (TAMAMLANDI - 13 Mayıs 2026)

#### Backend Tabloları:
- `books`, `book_units`, `book_topics`, `book_tests`
- `student_book_assignments`, `student_test_progress`
- `homework_plans`, `homework_plan_items`
- `trial_exams`, `trial_exam_results`

#### Öğretmen Sayfası: `/teacher/students/{id}/homework/{branch_id}`
- [x] **2 Panelli Üst Layout**: Kitaplar (sol) + Kitap İçeriği (sağ)
- [x] **Yatay Haftalık Plan**: Alt satırda yatay gün kartları
- [x] **Sürükle-Bırak Ödev Atama**: Ünite/Konu/Test sürükle-bırak
- [x] **Öğretmen Kitap Oluşturma**: "+ Oluştur" ile yeni kitap (otomatik öğrenciye atanır)
- [x] **Öğretmen İçerik Yönetimi**: Ünite, konu ve test ekleme
- [x] **Ödev Kontrol Butonu**: HER ZAMAN aktif (ödev sayısı ile)
- [x] **Yeni Plan Butonu**: Mevcut ödevleri siler ve yeni plan oluşturur
- [x] **PDF Export**: Yeni tasarım:
  - Tarih: "13 Mayıs 2026" formatı
  - Kitaplar: Tüm kitap isimleri
  - Günler alt alta (dikey liste)
  - Her günde: Kitap (koyu) > Ünite • Konu > Testler
  - Kitap Görevleri: Kitap > Ünite - Konular (gün bilgisi yok)
  - Motivasyon cümleleri yok
  - Tam ekran PDF (sayfa header/footer yok)
- [x] **Test Durum Göstergeleri**: Tüm durumlar
- [x] **"Tamamı Yapıldı" Butonu**: Toplu güncelleme
- [x] **Denemeler Sekmesi**: Deneme sınavı sonuçları

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
│   └── server.py
└── frontend/
    └── src/
        ├── pages/
        │   ├── admin/
        │   │   ├── AdminHomeworkContent.jsx
        │   │   └── AdminAuditLogs.jsx
        │   └── teacher/
        │       └── TeacherHomeworkEntry.jsx
        └── components/
```

---

## Test Credentials
- **Admin**: `admin` / `test123`
- **Öğretmen**: `ilknur.uzunal` / `test123`, `buse.gunes` / `test123`

---

## Son Güncelleme: 13 Mayıs 2026
- Ödev Kontrol butonu her zaman aktif
- Yeni Plan butonu eklendi
- PDF tasarımı güncellendi (günler alt alta, testler birleşik, tam ekran)
- Admin Audit Logs tarih formatı: "13 Mayıs 2026" 
