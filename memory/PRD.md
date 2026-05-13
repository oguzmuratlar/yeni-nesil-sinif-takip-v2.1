# Eğitim Portalı - Product Requirements Document

## Orijinal Problem Statement
Özel ders veren öğretmenler için kapsamlı bir eğitim merkezi yönetim sistemi.

---

## Uygulanan Özellikler (13 Mayıs 2026)

### Admin Paneli - İçerik Yönetimi
- [x] **Kitap Kopyalama**: Tüm içerik dahil kitap kopyalama (ad: "Kitap - kopya")
- [x] **Ünite Sıralama**: Yukarı/aşağı butonlarıyla sıralama değiştirme

### Öğretmen Ödev Takip
- [x] **Otomatik Plan**: Sayfa açılınca otomatik 7 günlük plan oluşturulur
- [x] **Plan Süresi Seçimi**: 7-21 gün arası seçilebilir dropdown
- [x] **Plan Oluştur butonu kaldırıldı** (otomatik oluşuyor)
- [x] **İçerik Düzenleme**: Ünite/Konu/Test adı düzenlenebilir (kalem ikonu)
- [x] **Sınıf Kontrolü**: Öğrenci sadece kendi sınıf seviyesindeki kitapları görür
- [x] **Tamamlanan Test Kontrolü**: Tamamlanmış testler ödev olarak atanamaz
- [x] **Ödev Kontrol Modal'ı**: Scroll özelliği, tüm plandaki ödevleri listeler

### PDF Export
- [x] **Instagram bilgisi**: Branşa göre (Matematik: @yeni.nesil.matematiik, Türkçe: @yeni.nesil.turkce, Fen: @yeni.nesil.fen.bilimleri)
- [x] Tarih formatı: "13 Mayıs 2026"
- [x] Günler alt alta (dikey liste)
- [x] Aynı konunun testleri birleşik gösterim
- [x] Tam ekran (sayfa header/footer yok)

### Denemeler
- [x] Checkbox'lar kaldırıldı (Yanlışlar, Eksik konular, Bilgi bulundu)

---

## Teknik Detaylar

### Yeni Backend Endpoints
- `POST /api/homework/books/{id}/copy` - Kitap kopyalama
- `PUT /api/homework/books/{id}/units/reorder` - Ünite sıralama
- `PUT /api/homework/plans/{id}` - Plan süresi güncelleme

### Dosya Yapısı
```
/app
├── backend/server.py
└── frontend/src/pages/
    ├── admin/AdminHomeworkContent.jsx
    └── teacher/TeacherHomeworkEntry.jsx
```

---

## Test Credentials
- **Admin**: `admin` / `test123`
- **Öğretmen**: `ilknur.uzunal` / `test123`

---

## Son Güncelleme: 13 Mayıs 2026
