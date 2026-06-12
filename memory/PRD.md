# Eğitim Portalı - Product Requirements Document

## Orijinal Problem Statement
Özel ders veren öğretmenler için kapsamlı bir eğitim merkezi yönetim sistemi.

---

## Son Güncelleme: 12 Haziran 2026

### YENİ ÖZELLİK: Tarih Bazlı Fiyat Güncelleme ✅

Admin kullanıcılar, öğrenci ve öğretmen fiyatlarını tarih bazlı güncelleyebilir:
- **Geçerlilik Tarihi**: Fiyat değişikliğinin başlangıç tarihi belirlenebilir
- **Geriye Dönük Koruma**: Bu tarihten önce alınan dersler eski fiyattan hesaplanır
- **İleriye Dönük Uygulama**: Bu tarihten sonra alınan dersler yeni fiyattan hesaplanır
- **Bakiye Yeniden Hesaplama**: Öğrenci ve öğretmen bakiyeleri fiyat geçmişi snapshot'larına göre hesaplanır

#### Yeni Endpoint'ler:
```
GET  /api/student-price-history/{student_id}     - Öğrenci fiyat geçmişi
POST /api/student-price-history                   - Öğrenci fiyatı güncelle
GET  /api/teacher-price-history/{teacher_id}     - Öğretmen fiyat geçmişi
POST /api/teacher-price-history                   - Öğretmen fiyatı güncelle
```

#### Frontend Güncellemeleri:
- `AdminStudentForm.jsx`: "Fiyat Güncelle" butonu ve modal eklendi
- `AdminTeacherForm.jsx`: "Fiyat Güncelle" butonu ve modal eklendi
- Her iki modal'da tarih seçici ve fiyat geçmişi görüntüleme mevcut

#### Test Sonuçları:
- Backend: %100 (9/9 test geçti)
- Frontend: %100 (tüm akışlar doğrulandı)

---

## SENE SONU İŞLEMİ - TÜM FAZLAR TAMAMLANDI ✅

| Faz | İçerik | Durum |
|-----|--------|-------|
| Faz 1 | Temel dönem altyapısı, migration | ✅ TAMAMLANDI |
| Faz 2 | Sene sonu preview | ✅ TAMAMLANDI |
| Faz 3 | Sene sonu execute | ✅ TAMAMLANDI |
| Faz 4 | Fiyat geçmişi ve snapshot | ✅ TAMAMLANDI |
| Faz 5 | Dönem filtresi ve dashboard | ✅ TAMAMLANDI |
| Faz 6 | Tarih bazlı fiyat güncelleme UI | ✅ TAMAMLANDI |

---

## Mevcut Özellikler

### Temel Modüller
- Öğrenci yönetimi (CRUD, kurs ataması, risk durumu)
- Öğretmen yönetimi (CRUD, branş/fiyat ataması)
- Ders girişi (birebir ve grup dersleri)
- Ödeme takibi (öğrenci ödemeleri, öğretmen maaşları)
- Kamp yönetimi
- YouTube içerik takibi
- Ödev sistemi (toggle ile açılıp kapanabilir)

### Finansal Özellikler
- Branş bazlı öğrenci bakiye hesaplama
- Öğretmen kazanç hesaplama (ders + kamp + YouTube)
- Fiyat geçmişi snapshot'ları ile gerçek zamanlı bakiye
- Dönem bazlı finansal raporlama

### Akademik Dönem Yönetimi
- Dönem oluşturma ve yönetimi
- Sene sonu preview (bakiye devir simülasyonu)
- Sene sonu execute (güvenli dönem kapatma)
- Kapalı dönem read-only koruması

---

## API Endpoints Özeti

### Öğrenci
```
GET    /api/students
GET    /api/students/{id}
POST   /api/students
PUT    /api/students/{id}
DELETE /api/students/{id}
GET    /api/students/{id}/finance-detail
```

### Öğretmen
```
GET    /api/teachers
GET    /api/teachers/{id}
POST   /api/teachers
PUT    /api/teachers/{id}
GET    /api/teacher-balance/{id}
GET    /api/teacher-prices
POST   /api/teacher-prices
```

### Fiyat Geçmişi (YENİ)
```
GET    /api/student-price-history/{student_id}
POST   /api/student-price-history
GET    /api/teacher-price-history/{teacher_id}
POST   /api/teacher-price-history
GET    /api/current-prices/{student_id}
```

### Dönem (Season)
```
GET    /api/seasons
GET    /api/seasons/current
POST   /api/admin/seasons/create-initial
POST   /api/admin/seasons/migrate
POST   /api/year-end/preview
POST   /api/year-end/execute
```

---

## Dosya Yapısı

```
/app
├── backend/
│   ├── server.py          # Ana backend (8000+ satır)
│   └── tests/
│       └── test_price_history.py
├── frontend/
│   └── src/
│       └── pages/
│           └── admin/
│               ├── AdminStudentForm.jsx  (Fiyat güncelleme modal eklendi)
│               ├── AdminTeacherForm.jsx  (Fiyat güncelleme modal eklendi)
│               ├── AdminYearEndPreview.jsx
│               └── AdminDashboard.jsx
└── memory/
    ├── PRD.md
    ├── test_credentials.md
    └── SENE_SONU_TEKNIK_DOKUMAN.md
```

---

## Backlog / Gelecek Görevler

### P2 - Yakın Vadeli
- [ ] Birebir öğrenci dersleri için pagination
- [ ] Hızlı ders girişi butonu

### P3 - Uzak Vadeli
- [ ] Kamp SMS hatırlatmaları
- [ ] WordPress entegrasyonu

### Teknik Borç
- [ ] server.py modüler yapıya dönüştürme (8000+ satır)
- [ ] Fiyat geçmişi çakışma kontrolü düzeltme (duplicate $or key)

---

## Test Credentials
- **Admin**: `admin` / `test123`
- **Öğretmen**: `ilknur.uzunal` / `test123`

---

Son Test: 12 Haziran 2026
Durum: TÜM TESTLER GEÇTİ ✅
