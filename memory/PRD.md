# Eğitim Portalı - Product Requirements Document

## Orijinal Problem Statement
Özel ders veren öğretmenler için kapsamlı bir eğitim merkezi yönetim sistemi.

---

## Uygulanan Özellikler (21 Mayıs 2026)

### 🔴 Kritik Bug Düzeltmeleri
- [x] **Grup Dersi Görünmüyor Hatası**: Grup dersleri artık doğru şekilde görünüyor
  - Backend: `create_group_lesson` endpoint'i artık `group_id`, `teacher_id`, `branch_id`, `student_id` alanlarını kaydediyor
  - Frontend: `TeacherGroupLessons.jsx` ve `AdminGroupLesson.jsx` önce `group_id` ile filtreliyor

### 🆕 Feature Flag Sistemi
- [x] **Yeni Geliştirmeler Sayfası**: `/admin/settings` - Admin panelinden özellikleri açıp kapatabilir
- [x] **Ödev Takip Sistemi Toggle**: Aktif/Pasif toggle ile ödev sistemini kontrol edebilir
- [x] **Öğretmen Butonu Kontrolü**: Feature flag pasif olduğunda "Ödev" butonu gizlenir
- [x] **Backend Koruması**: Pasif olduğunda `/api/homework/*` endpoint'leri 403 döner

### 📄 Pagination (Sayfalama)
- [x] **Backend Endpoint**: `/api/lessons/paginated` - `page`, `page_size`, `group_id`, `teacher_id` parametreleri
- [x] **Response Format**: `{ data, total_count, page, page_size, total_pages }`
- [x] **Grup Dersleri UI**: 15 kayıt/sayfa, Önceki/Sonraki butonları

---

## Önceki Özellikler (13 Mayıs 2026)

### Admin Paneli - İçerik Yönetimi
- [x] **Kitap Kopyalama**: Tüm içerik dahil kitap kopyalama
- [x] **Ünite Sıralama**: Yukarı/aşağı butonlarıyla sıralama

### Öğretmen Ödev Takip
- [x] **Otomatik Plan**: Sayfa açılınca otomatik 7 günlük plan
- [x] **Plan Süresi**: 7-21 gün arası dropdown
- [x] **İçerik Düzenleme**: Ünite/Konu/Test adı düzenlenebilir
- [x] **Sınıf Kontrolü**: Öğrenci sadece kendi sınıf seviyesindeki kitapları görür
- [x] **Tamamlanan Test Kontrolü**: Tamamlanmış testler ödev olarak atanamaz

### PDF Export
- [x] Instagram bilgisi branşa göre
- [x] Tarih formatı: "13 Mayıs 2026"
- [x] Günler alt alta (dikey liste)

---

## Teknik Detaylar

### Yeni Backend Endpoints (21 Mayıs 2026)
- `GET /api/system-settings` - Tüm ayarları listele (admin only)
- `PUT /api/system-settings/{key}` - Ayar güncelle
- `GET /api/system-settings/homework-status` - Ödev sistemi durumu
- `GET /api/lessons/paginated` - Sayfalı ders listesi
- `POST /api/admin/repair-group-lessons` - Migration endpoint (eski verileri düzeltme)

### Dosya Yapısı
```
/app
├── backend/server.py
└── frontend/src/pages/
    ├── admin/
    │   ├── AdminHomeworkContent.jsx
    │   └── AdminSettings.jsx (YENİ)
    └── teacher/
        ├── TeacherHomeworkEntry.jsx
        ├── TeacherStudents.jsx (homeworkEnabled kontrolü)
        └── TeacherGroupLessons.jsx (pagination eklendi)
```

---

## Backlog / Gelecek Görevler

### P2 - Yakın Vadeli
- [ ] Birebir öğrenci dersleri için pagination
- [ ] Migration: Eski grup derslerine `group_id` ekleme

### P3 - Uzak Vadeli
- [ ] Hızlı Ders Girişi butonu
- [ ] Kamp SMS hatırlatmaları
- [ ] WordPress entegrasyonu

---

## Test Credentials
- **Admin**: `admin` / `test123`
- **Öğretmen**: `ilknur.uzunal` / `test123`

## Son Güncelleme: 21 Mayıs 2026
