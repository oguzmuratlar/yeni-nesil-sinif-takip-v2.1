# SENE SONU İŞLEMİ - TEKNİK DOKÜMAN

**Tarih:** 21 Mayıs 2026  
**Durum:** ONAY BEKLİYOR  
**Versiyon:** 2.0 (REVİZE EDİLDİ)

---

## 🔴 REVİZYON NOTLARI (v2.0)

| # | Revizyon | Yapılan Değişiklik |
|---|----------|-------------------|
| 1 | Kamp kazancı dönemsel | Kamplar `season_id` alacak, öğretmen bakiyesi dönemsel hesaplanacak |
| 2 | Student price history key | `student_id + branch_id + lesson_type` bazında çalışacak |
| 3 | valid_from/valid_to çakışması | Çakışma kontrolü ve önleme mekanizması eklendi |
| 4 | Grup student_course kopyalanmayacak | Sadece birebir ders ilişkileri kopyalanacak |
| 5 | İlk dönem admin seçimi | Hardcoded değil, admin UI'dan seçilecek |
| 6 | Teacher price snapshot backend | `teacher_price_history`'den hesaplanacak, frontend'e güvenilmeyecek |
| 7 | Dönem kapanışı datetime | `datetime` (UTC timezone aware) kullanılacak |
| 8 | Rollback sadece acil recovery | Normal admin özelliği değil, teknik recovery planı |
| 9 | Kapalı dönem kontrolleri genişletildi | Kamp, YouTube, ödeme, gelir/gider, ders, planlama, ödev, fiyat güncelleme |
| 10 | Doküman revize edildi | Bu versiyon sunuldu |

---

## İÇİNDEKİLER

1. [Collection/Model Değişiklikleri](#1-collectionmodel-değişiklikleri)
2. [seasonId Eklenecek Collection'lar](#2-seasonid-eklenecek-collectionlar)
3. [Migration Planı](#3-migration-planı)
4. [Student Groups Dönem Yapısı](#4-student-groups-dönem-yapısı)
5. [Mevcut Öğrenci Bakiye Hesabı](#5-mevcut-öğrenci-bakiye-hesabı)
6. [Yeni Öğrenci Bakiye Hesabı](#6-yeni-öğrenci-bakiye-hesabı)
7. [Mevcut Öğretmen Kazanç Hesabı](#7-mevcut-öğretmen-kazanç-hesabı)
8. [Yeni Öğretmen Bakiye Devri](#8-yeni-öğretmen-bakiye-devri)
9. [Öğrenci Fiyat Geçmişi Modeli](#9-öğrenci-fiyat-geçmişi-modeli)
10. [Öğretmen Fiyat Geçmişi Modeli](#10-öğretmen-fiyat-geçmişi-modeli)
11. [Ders Kaydı Fiyat Snapshot](#11-ders-kaydı-fiyat-snapshot)
12. [Sene Sonu Preview Response](#12-sene-sonu-preview-response)
13. [Sene Sonu Execute Adımları](#13-sene-sonu-execute-adımları)
14. [Rollback/Idempotency](#14-rollbackidempotency)
15. [Kapalı Dönem Kontrolü](#15-kapalı-dönem-kontrolü)
16. [Dönem Filtresi](#16-dönem-filtresi)
17. [Test Senaryoları](#17-test-senaryoları)
18. [Prod Migration ve Yedekleme](#18-prod-migration-ve-yedekleme)

---

## 1. COLLECTION/MODEL DEĞİŞİKLİKLERİ

### 1.1 YENİ COLLECTION'LAR

#### `seasons` (Genişletilecek)
```python
class Season(BaseModel):
    id: str
    name: str                          # "2024-2025", "2025-2026"
    start_date: datetime               # REVİZYON: datetime (timezone aware UTC)
    end_date: Optional[datetime] = None  # REVİZYON: datetime veya None (açık dönem)
    status: str = "active"             # "active" | "closed"
    is_current: bool = False           # Aktif dönem mi?
    closed_at: Optional[datetime] = None  # Kapanış timestamp'i (UTC)
    closed_by: Optional[str] = None    # Kapatan admin user_id
    previous_season_id: Optional[str] = None
    next_season_id: Optional[str] = None
    created_at: datetime               # UTC timezone aware
```

> ⚠️ **REVİZYON #7**: Tüm tarih alanları `datetime` (UTC timezone aware) olacak. Frontend'de local time'a çevrilecek.

#### `student_price_history` (YENİ)
```python
class StudentPriceHistory(BaseModel):
    id: str
    student_id: str
    branch_id: str
    lesson_type: str                   # "birebir" | "group"
    price: float
    valid_from: datetime               # REVİZYON: datetime (UTC)
    valid_to: Optional[datetime] = None  # REVİZYON: datetime veya None (geçerli)
    season_id: str
    needs_review: bool = False         # Yeni dönem kopyası kontrolü
    created_at: datetime
    created_by: str                    # Admin user_id
```

> ⚠️ **REVİZYON #2**: Unique key = `student_id + branch_id + lesson_type`. Her kombinasyon için ayrı fiyat geçmişi tutulur.
> ⚠️ **REVİZYON #3**: `valid_from/valid_to` çakışma kontrolü eklenecek (aşağıda detaylı).

#### `teacher_price_history` (YENİ)
```python
class TeacherPriceHistory(BaseModel):
    id: str
    teacher_id: str
    branch_id: str
    lesson_type_id: str
    group_size: Optional[int] = None   # 1, 2, 3, 4
    price: float
    valid_from: datetime               # REVİZYON: datetime (UTC)
    valid_to: Optional[datetime] = None  # REVİZYON: datetime (UTC)
    season_id: str
    needs_review: bool = False
    created_at: datetime
    created_by: str
```

> ⚠️ **REVİZYON #6**: Backend her ders kaydında `teacher_price_history`'den fiyat çekecek. Frontend'in gönderdiği `teacher_rate`'e güvenilmeyecek.

#### `season_carryovers` (YENİ)
```python
class SeasonCarryover(BaseModel):
    id: str
    entity_type: str                   # "student" | "teacher"
    entity_id: str                     # student_id veya teacher_id
    branch_id: Optional[str] = None    # Öğrenci için branş bazlı
    from_season_id: str
    to_season_id: str
    amount: float                      # Devredilen bakiye (+ alacak, - borç)
    description: str                   # "2024-2025 dönem kapanışından aktarıldı"
    created_at: datetime               # UTC timezone aware
```

#### `manual_balance_adjustments` (YENİ)
```python
class ManualBalanceAdjustment(BaseModel):
    id: str
    student_id: str
    branch_id: str
    season_id: str
    amount: float                      # + veya -
    description: str                   # Zorunlu açıklama
    created_by: str
    created_at: datetime
```

#### `year_end_logs` (YENİ)
```python
class YearEndLog(BaseModel):
    id: str
    from_season_id: str
    to_season_id: str
    executed_by: str
    executed_at: datetime
    cutoff_date: datetime              # Kesim tarihi
    status: str                        # "success" | "failed" | "partial"
    summary: dict                      # Özet istatistikler
    error_message: Optional[str] = None
```

### 1.2 GENİŞLETİLECEK MEVCUT MODEL'LER

#### `Lesson` (Genişletilecek)
```python
# Mevcut alanlar korunacak, yeni alanlar eklenecek:
class Lesson(BaseModel):
    # ... mevcut alanlar ...
    season_id: Optional[str] = None
    # Fiyat snapshot alanları:
    student_unit_price_at_lesson: Optional[float] = None
    student_total_amount_at_lesson: Optional[float] = None
    teacher_unit_price_at_lesson: Optional[float] = None  # Mevcut teacher_rate bunu karşılıyor
    teacher_total_earning_at_lesson: Optional[float] = None
```

#### `Payment` (Genişletilecek)
```python
class Payment(BaseModel):
    # ... mevcut alanlar ...
    season_id: Optional[str] = None
```

#### `StudentCourse` (Genişletilecek)
```python
class StudentCourse(BaseModel):
    # ... mevcut alanlar ...
    season_id: Optional[str] = None    # Zaten var
    closed_at: Optional[datetime] = None  # Dönem kapanışında set edilir
    copied_to_id: Optional[str] = None    # Yeni dönem kopyasının ID'si
```

#### `StudentGroup` (Genişletilecek)
```python
class StudentGroup(BaseModel):
    # ... mevcut alanlar ...
    season_id: Optional[str] = None
    closed_at: Optional[datetime] = None
    closed_reason: Optional[str] = None  # "year_end" | "manual"
```

---

## 2. SEASONID EKLENECEK COLLECTION'LAR

| Collection | Zorunlu mu? | Açıklama |
|------------|-------------|----------|
| `lessons` | EVET | Her ders bir döneme ait |
| `payments` | EVET | Her ödeme bir döneme ait |
| `student_courses` | EVET (zaten var) | Ders ilişkileri dönemsel |
| `student_groups` | EVET | Gruplar dönemsel |
| `planned_lessons` | EVET | Planlı dersler dönemsel |
| `camps` | **EVET** | **REVİZYON #1:** Kamplar dönemsel, `season_id` eklenecek |
| `camp_students` | **EVET** | **REVİZYON #1:** Kamp kayıtları dönemsel |
| `youtube_contents` | EVET | YouTube içerikleri dönemsel |
| `trial_exams` | EVET | Denemeler dönemsel |
| `homework_plans` | EVET | Ödev planları dönemsel |
| `homework_plan_items` | EVET | Ödev plan öğeleri dönemsel |
| `student_book_assignments` | EVET | Kitap atamaları dönemsel |
| `student_test_progress` | EVET | Test ilerlemeleri dönemsel |
| `planning_master_records` | EVET (season zaten var) | Planlama Ustası kayıtları |
| `planning_master_summaries` | EVET (season zaten var) | Planlama Ustası özetleri |
| `cashboxes` | HAYIR | Kasalar dönemden bağımsız |
| `cashbox_transfers` | HAYIR | Kasa transferleri dönemden bağımsız |
| `teachers` | HAYIR | Öğretmenler dönemden bağımsız |
| `students` | HAYIR | Öğrenciler dönemden bağımsız |
| `branches` | HAYIR | Branşlar dönemden bağımsız |
| `teacher_prices` | HAYIR | Fiyat geçmişi ayrı tutulacak |

---

## 3. MIGRATION PLANI

### 3.1 ÖN HAZIRLIK
```
1. YEDEK AL: Tüm collection'ların yedeğini al
2. İLK DÖNEM OLUŞTUR: Admin UI üzerinden seçilen isimle (örn: "2024-2025") aktif dönem oluşturulur
3. season_id = bu dönemin ID'si
```

> ⚠️ **REVİZYON #5**: İlk dönem ismi hardcoded DEĞİL, admin tarafından UI'dan girilecek.

### 3.2 İLK DÖNEM OLUŞTURMA (ADMİN UI)
```python
# Admin UI'da form:
# - Dönem adı: [input] (örn: "2024-2025")
# - Başlangıç tarihi: [date picker]
# - NOT: Bitiş tarihi yeni dönem oluşturulduğunda otomatik set edilir

@api_router.post("/admin/seasons/create-initial")
async def create_initial_season(
    name: str,           # "2024-2025" - Admin girer
    start_date: datetime,  # Admin seçer
    current_user: User = Depends(get_current_user)
):
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins")
    
    # Zaten aktif dönem var mı kontrol et
    existing = await db.seasons.find_one({"status": "active"})
    if existing:
        raise HTTPException(status_code=400, detail="Zaten aktif dönem mevcut")
    
    season_id = f"season-{name}"
    season = {
        "id": season_id,
        "name": name,
        "start_date": start_date,
        "end_date": None,
        "status": "active",
        "is_current": True,
        "created_at": datetime.now(timezone.utc)
    }
    await db.seasons.insert_one(season)
    return {"message": "Dönem oluşturuldu", "season_id": season_id}
```

### 3.3 MIGRATION ADIMLARI (Admin seçtikten sonra)

> ⚠️ **NOT**: Aşağıdaki `default_season_id` değeri admin'in oluşturduğu dönemden alınır.

#### Adım 1: Admin UI'dan Dönem Oluşturulduktan Sonra
```python
# Admin UI'dan dönem oluşturuldu, season_id artık DB'de mevcut
# Migration endpoint bu ID'yi kullanır
```

#### Adım 2: Mevcut Kayıtlara seasonId Ekle
```python
# default_season_id = admin'in oluşturduğu dönemin ID'si (parametre olarak alınır)

async def run_season_migration(season_id: str):
    # Lessons
    await db.lessons.update_many(
        {"season_id": {"$exists": False}},
        {"$set": {"season_id": season_id}}
    )
    
    # Payments
    await db.payments.update_many(
        {"season_id": {"$exists": False}},
        {"$set": {"season_id": season_id}}
    )
    
    # Student Courses
    await db.student_courses.update_many(
        {"season_id": {"$exists": False}},
        {"$set": {"season_id": season_id}}
    )
    
    # Student Groups
    await db.student_groups.update_many(
        {"season_id": {"$exists": False}},
        {"$set": {"season_id": season_id}}
    )
    
    # Planned Lessons
    await db.planned_lessons.update_many(
        {"season_id": {"$exists": False}},
        {"$set": {"season_id": season_id}}
    )
    
    # REVİZYON #1: Camps ve Camp Students'a da season_id ekle
    await db.camps.update_many(
        {"season_id": {"$exists": False}},
        {"$set": {"season_id": season_id}}
    )
    await db.camp_students.update_many(
        {"season_id": {"$exists": False}},
        {"$set": {"season_id": season_id}}
    )
    
    # YouTube Contents
    await db.youtube_contents.update_many(
        {"season_id": {"$exists": False}},
        {"$set": {"season_id": season_id}}
    )
    
    # Homework related
    for collection in ["homework_plans", "homework_plan_items", "student_book_assignments", "student_test_progress"]:
        await db[collection].update_many(
            {"season_id": {"$exists": False}},
            {"$set": {"season_id": season_id}}
        )
    
    # Trial Exams
    await db.trial_exams.update_many(
        {"season_id": {"$exists": False}},
        {"$set": {"season_id": season_id}}
    )
```

#### Adım 3: Mevcut Fiyatları Price History'ye Kopyala
```python
# Student fiyatlarını student_courses'tan çek
# REVİZYON #2: student_id + branch_id + lesson_type kombinasyonu unique key
courses = await db.student_courses.find({"status": "active"}).to_list(10000)
for course in courses:
    if course.get("student_price"):
        # lesson_type belirleme (grup mu birebir mi)
        lesson_type = "group" if course.get("group_id") else "birebir"
        
        price_history = {
            "id": str(uuid.uuid4()),
            "student_id": course["student_id"],
            "branch_id": course["branch_id"],
            "lesson_type": lesson_type,  # REVİZYON #2: lesson_type eklendi
            "price": course["student_price"],
            "valid_from": season["start_date"],  # Admin'in seçtiği başlangıç tarihi
            "valid_to": None,
            "season_id": season_id,
            "needs_review": False,
            "created_at": datetime.now(timezone.utc),
            "created_by": "migration"
        }
        await db.student_price_history.insert_one(price_history)

# Teacher fiyatlarını teacher_prices'tan çek
teacher_prices = await db.teacher_prices.find({}).to_list(10000)
for tp in teacher_prices:
    teacher_price_history = {
        "id": str(uuid.uuid4()),
        "teacher_id": tp["teacher_id"],
        "branch_id": tp["branch_id"],
        "lesson_type_id": tp["lesson_type_id"],
        "group_size": tp.get("group_size"),
        "price": tp["price"],
        "valid_from": season["start_date"],  # Admin'in seçtiği başlangıç tarihi
        "valid_to": None,
        "season_id": season_id,
        "needs_review": False,
        "created_at": datetime.now(timezone.utc),
        "created_by": "migration"
    }
    await db.teacher_price_history.insert_one(teacher_price_history)
```

### 3.4 MIGRATION SONRASI KONTROL
```
1. Tüm lessons'da season_id var mı? ✓
2. Tüm payments'ta season_id var mı? ✓
3. Tüm camps'ta season_id var mı? ✓  (REVİZYON #1)
4. student_price_history kayıt sayısı = aktif course sayısı mı? ✓
5. teacher_price_history kayıt sayısı = teacher_prices sayısı mı? ✓
```

---

## 4. STUDENT GROUPS DÖNEM YAPISI

### 4.1 MEVCUT DURUM
```python
StudentGroup:
    - id
    - name
    - branch_id
    - level (sınıf)
    - student_ids[]
    - teacher_id
    - status: "active" | "inactive"
    - created_at
```

### 4.2 YENİ DURUM
```python
StudentGroup:
    - id
    - name
    - branch_id
    - level
    - student_ids[]
    - teacher_id
    - status: "active" | "inactive" | "closed"
    - season_id          # YENİ
    - closed_at          # YENİ
    - closed_reason      # YENİ: "year_end" | "manual"
    - created_at
```

### 4.3 SENE SONU İŞLEMİNDE GRUPLAR

```
1. Mevcut dönemin TÜM aktif grupları "closed" yapılır
2. closed_at = sene sonu işlem zamanı
3. closed_reason = "year_end"
4. Gruplar yeni döneme KOPYALANMAZ
5. Grup öğrencilerinin branş bakiyeleri yeni döneme devredilir
6. Yeni dönemde admin grupları manuel oluşturur
```

---

## 5. MEVCUT ÖĞRENCİ BAKİYE HESABI

### 5.1 FONKSİYON
```
Dosya: /app/backend/server.py
Fonksiyon: get_student_finance_detail() - Satır 3712
```

### 5.2 MEVCUT HESAPLAMA MANTIĞI
```python
# Her branş için:
1. courses = student_courses'tan aktif kursları çek
2. lessons = lessons'tan ilgili course'un derslerini çek
3. student_price = course.student_price veya course.price
4. used_amount = (ücretli ders sayısı) × student_price
5. payments = payments'tan ilgili branş ödemelerini çek
6. total_paid = sum(payments.amount)
7. remaining_balance = total_paid - used_amount
8. remaining_lessons = remaining_balance / student_price
```

### 5.3 SORUNLAR
```
1. Fiyat değiştiğinde TÜM dersler yeni fiyatla hesaplanıyor
2. Dönem ayrımı yok - tüm dersler tek havuzda
3. Devreden bakiye ayrımı yok
```

---

## 6. YENİ ÖĞRENCİ BAKİYE HESABI

### 6.1 YENİ HESAPLAMA MANTIĞI
```python
async def get_student_finance_detail_v2(student_id: str, season_id: str = None):
    # Aktif dönem yoksa güncel dönemi al
    if not season_id:
        active_season = await get_active_season()
        season_id = active_season["id"]
    
    # Dönem bilgisini al
    season = await db.seasons.find_one({"id": season_id})
    
    result = []
    
    # 1. Bu dönemde aktif kursları çek
    courses = await db.student_courses.find({
        "student_id": student_id,
        "season_id": season_id,
        "status": "active"
    }).to_list(100)
    
    # 2. Aktif ders ilişkisi olmayan ama bakiyesi olan branşları bul
    carryovers = await db.season_carryovers.find({
        "entity_type": "student",
        "entity_id": student_id,
        "to_season_id": season_id
    }).to_list(100)
    
    # Tüm ilgili branşları topla
    all_branch_ids = set([c["branch_id"] for c in courses])
    all_branch_ids.update([co["branch_id"] for co in carryovers if co.get("branch_id")])
    
    for branch_id in all_branch_ids:
        course = next((c for c in courses if c["branch_id"] == branch_id), None)
        
        # Devreden bakiye
        carryover = next((co for co in carryovers if co.get("branch_id") == branch_id), None)
        carryover_amount = carryover["amount"] if carryover else 0
        
        # Bu dönemdeki ödemeler
        payments = await db.payments.find({
            "student_id": student_id,
            "branch_id": branch_id,
            "season_id": season_id,
            "payment_type": "student_payment"
        }).to_list(10000)
        total_paid = sum([p["amount"] for p in payments])
        
        # Manuel bakiye düzeltmeleri
        adjustments = await db.manual_balance_adjustments.find({
            "student_id": student_id,
            "branch_id": branch_id,
            "season_id": season_id
        }).to_list(100)
        total_adjustments = sum([a["amount"] for a in adjustments])
        
        # Bu dönemdeki dersler
        if course:
            lessons = await db.lessons.find({
                "student_course_id": course["id"],
                "season_id": season_id
            }).to_list(10000)
        else:
            lessons = []
        
        # Kullanılan tutar - SNAPSHOT'TAN AL
        used_amount = 0
        for lesson in lessons:
            if not lesson.get("is_free_lesson", False):
                # Önce snapshot'ı kullan
                if lesson.get("student_total_amount_at_lesson") is not None:
                    used_amount += lesson["student_total_amount_at_lesson"]
                else:
                    # Fallback: Güncel fiyat (sadece eski kayıtlar için)
                    price = await get_student_price_at_date(student_id, branch_id, lesson["date"])
                    used_amount += price * lesson["number_of_lessons"]
        
        # Bakiye hesabı
        # Bakiye = Devir + Ödemeler + Manuel Düzeltmeler - Kullanım
        remaining_balance = carryover_amount + total_paid + total_adjustments - used_amount
        
        # Kalan ders hesabı
        current_price = await get_student_current_price(student_id, branch_id)
        remaining_lessons = remaining_balance / current_price if current_price > 0 else None
        
        result.append({
            "branch_id": branch_id,
            "has_active_course": course is not None,
            "carryover_amount": carryover_amount,
            "total_paid": total_paid,
            "total_adjustments": total_adjustments,
            "used_amount": used_amount,
            "remaining_balance": remaining_balance,
            "current_price": current_price,
            "remaining_lessons": round(remaining_lessons, 1) if remaining_lessons else "-",
            "status": "alacakli" if remaining_balance >= 0 else "borclu"
        })
    
    return result
```

### 6.2 YARDIMCI FONKSİYONLAR

> ⚠️ **REVİZYON #2**: Tüm fonksiyonlar `student_id + branch_id + lesson_type` bazında çalışır.

```python
async def get_student_price_at_date(
    student_id: str, 
    branch_id: str, 
    lesson_type: str,  # REVİZYON #2: lesson_type eklendi
    date: datetime
) -> float:
    """Belirli bir tarihteki öğrenci fiyatını döndürür"""
    price_record = await db.student_price_history.find_one({
        "student_id": student_id,
        "branch_id": branch_id,
        "lesson_type": lesson_type,  # REVİZYON #2
        "valid_from": {"$lte": date},
        "$or": [
            {"valid_to": None},
            {"valid_to": {"$gte": date}}
        ]
    }, sort=[("valid_from", -1)])
    
    return price_record["price"] if price_record else 0

async def get_student_current_price(
    student_id: str, 
    branch_id: str,
    lesson_type: str  # REVİZYON #2: lesson_type eklendi
) -> float:
    """Öğrencinin güncel fiyatını döndürür"""
    price_record = await db.student_price_history.find_one({
        "student_id": student_id,
        "branch_id": branch_id,
        "lesson_type": lesson_type,  # REVİZYON #2
        "valid_to": None
    }, sort=[("valid_from", -1)])
    
    return price_record["price"] if price_record else 0
```

### 6.3 valid_from/valid_to ÇAKIŞMA KONTROLÜ (REVİZYON #3)

```python
async def validate_price_date_range(
    student_id: str,
    branch_id: str,
    lesson_type: str,
    valid_from: datetime,
    valid_to: Optional[datetime],
    exclude_id: Optional[str] = None  # Güncelleme için mevcut kaydı hariç tut
):
    """
    REVİZYON #3: Fiyat tarih aralığı çakışma kontrolü.
    Aynı student_id + branch_id + lesson_type için çakışan tarih aralığı olmamalı.
    """
    query = {
        "student_id": student_id,
        "branch_id": branch_id,
        "lesson_type": lesson_type,
        "$or": [
            # Yeni aralık mevcut bir aralığın içinde mi?
            {
                "valid_from": {"$lte": valid_from},
                "$or": [
                    {"valid_to": None},
                    {"valid_to": {"$gte": valid_from}}
                ]
            },
            # Yeni aralık mevcut bir aralığı kapsıyor mu?
            {
                "valid_from": {"$gte": valid_from},
                "valid_from": {"$lte": valid_to} if valid_to else {"$exists": True}
            }
        ]
    }
    
    if exclude_id:
        query["id"] = {"$ne": exclude_id}
    
    conflicting = await db.student_price_history.find_one(query)
    
    if conflicting:
        raise HTTPException(
            status_code=400,
            detail=f"Tarih aralığı çakışması: {conflicting['valid_from']} - {conflicting['valid_to'] or 'devam ediyor'}"
        )
```

---

## 7. MEVCUT ÖĞRETMEN KAZANÇ HESABI

### 7.1 FONKSİYON
```
Dosya: /app/backend/server.py
Fonksiyon: get_teacher_balance() - Satır 1878
```

### 7.2 MEVCUT HESAPLAMA MANTIĞI
```python
1. Ders kazancı:
   - lessons.teacher_rate varsa: teacher_rate × number_of_lessons
   - yoksa: teacher_prices'tan güncel fiyat × number_of_lessons

2. Kamp kazancı:
   - kesin_kayit öğrenci sayısı × per_student_teacher_fee

3. YouTube kazancı:
   - sum(youtube_contents.amount)

4. Toplam kazanç = Ders + Kamp + YouTube

5. Ödemeler = sum(payments where teacher_id and payment_type="teacher_payment")

6. Bakiye = Toplam kazanç - Ödemeler
```

### 7.3 İYİ OLAN
- `teacher_rate` ders kaydında snapshot olarak tutuluyor ✓

### 7.4 EKSİK OLAN
- Dönem ayrımı yok
- Devreden bakiye yok
- **REVİZYON #1**: Kamp kazancı dönemden bağımsız hesaplanıyor (dönemsel olmalı)
- **REVİZYON #6**: Backend `teacher_rate`'e güveniyor (teacher_price_history'den hesaplanmalı)

---

## 8. YENİ ÖĞRETMEN BAKİYE DEVRİ

> ⚠️ **REVİZYON #1**: Kamp kazancı artık DÖNEMSEL hesaplanacak.
> ⚠️ **REVİZYON #6**: Backend `teacher_price_history`'den fiyat hesaplayacak, frontend'in gönderdiği `teacher_rate`'e güvenmeyecek.

### 8.1 HESAPLAMA
```python
async def get_teacher_balance_v2(teacher_id: str, season_id: str = None):
    if not season_id:
        active_season = await get_active_season()
        season_id = active_season["id"]
    
    # Devreden bakiye
    carryover = await db.season_carryovers.find_one({
        "entity_type": "teacher",
        "entity_id": teacher_id,
        "to_season_id": season_id
    })
    carryover_amount = carryover["amount"] if carryover else 0
    
    # Bu dönemdeki ders kazancı
    # REVİZYON #6: Backend teacher_price_history'den hesaplar
    lessons = await db.lessons.find({
        "teacher_id": teacher_id,
        "season_id": season_id
    }).to_list(10000)
    
    lesson_earnings = 0
    for lesson in lessons:
        # REVİZYON #6: Önce snapshot'ı kontrol et, yoksa teacher_price_history'den çek
        if lesson.get("teacher_total_earning_at_lesson") is not None:
            lesson_earnings += lesson["teacher_total_earning_at_lesson"]
        elif lesson.get("teacher_rate"):
            # Fallback: Eski kayıtlar için teacher_rate kullan
            lesson_earnings += lesson["teacher_rate"] * lesson["number_of_lessons"]
        else:
            # teacher_price_history'den hesapla
            teacher_price = await get_teacher_price_at_date(
                teacher_id=teacher_id,
                branch_id=lesson["branch_id"],
                lesson_type_id=lesson.get("lesson_type_id"),
                group_size=lesson.get("group_size", 1),
                date=lesson["date"]
            )
            lesson_earnings += teacher_price * lesson["number_of_lessons"]
    
    # REVİZYON #1: Kamp kazancı DÖNEMSEL
    camp_earnings = await calculate_camp_earnings_by_season(teacher_id, season_id)
    
    # YouTube kazancı (dönemsel)
    youtube_records = await db.youtube_contents.find({
        "teacher_id": teacher_id,
        "season_id": season_id,
        "status": "active"
    }).to_list(1000)
    youtube_earnings = sum([r["amount"] for r in youtube_records])
    
    # Toplam kazanç
    total_earnings = lesson_earnings + camp_earnings + youtube_earnings
    
    # Bu dönemdeki ödemeler
    payments = await db.payments.find({
        "teacher_id": teacher_id,
        "season_id": season_id,
        "payment_type": "teacher_payment"
    }).to_list(1000)
    total_paid = sum([p["amount"] for p in payments])
    
    # Bakiye = Devir + Kazanç - Ödeme
    balance = carryover_amount + total_earnings - total_paid
    
    return {
        "carryover_amount": carryover_amount,
        "lesson_earnings": lesson_earnings,
        "camp_earnings": camp_earnings,
        "youtube_earnings": youtube_earnings,
        "total_earnings": total_earnings,
        "total_paid": total_paid,
        "balance": balance
    }
```

### 8.2 YARDIMCI FONKSİYONLAR (REVİZYON #6)

```python
async def get_teacher_price_at_date(
    teacher_id: str,
    branch_id: str,
    lesson_type_id: str,
    group_size: int,
    date: datetime
) -> float:
    """
    REVİZYON #6: Backend teacher_price_history'den fiyat hesaplar.
    Frontend'in gönderdiği teacher_rate'e güvenilmez.
    """
    price_record = await db.teacher_price_history.find_one({
        "teacher_id": teacher_id,
        "branch_id": branch_id,
        "lesson_type_id": lesson_type_id,
        "group_size": group_size,
        "valid_from": {"$lte": date},
        "$or": [
            {"valid_to": None},
            {"valid_to": {"$gte": date}}
        ]
    }, sort=[("valid_from", -1)])
    
    return price_record["price"] if price_record else 0

async def calculate_camp_earnings_by_season(teacher_id: str, season_id: str) -> float:
    """
    REVİZYON #1: Kamp kazancı DÖNEMSEL hesaplanır.
    """
    camps = await db.camps.find({
        "teacher_ids": teacher_id,
        "season_id": season_id,
        "status": "active"
    }).to_list(1000)
    
    total_earnings = 0
    for camp in camps:
        if camp.get("per_student_teacher_fee"):
            # Kesin kayıtlı öğrenci sayısı
            kesin_count = await db.camp_students.count_documents({
                "camp_id": camp["id"],
                "status": "kesin_kayit"
            })
            total_earnings += kesin_count * camp["per_student_teacher_fee"]
    
    return total_earnings
```

---

## 9. ÖĞRENCİ FİYAT GEÇMİŞİ MODELİ

### 9.1 MODEL
```python
class StudentPriceHistory(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    branch_id: str
    lesson_type: str = "birebir"       # "birebir" | "group"
    price: float
    valid_from: datetime               # REVİZYON #7: datetime (UTC)
    valid_to: Optional[datetime] = None  # REVİZYON #7: None = hala geçerli
    season_id: str
    needs_review: bool = False         # Yeni dönem kopyası
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str                    # Admin user_id
```

> ⚠️ **REVİZYON #2**: Unique key = `student_id + branch_id + lesson_type`

### 9.2 FİYAT GÜNCELLEME ENDPOINTİ
```python
@api_router.post("/student-price-history")
async def create_student_price(data: StudentPriceCreate, current_user: User = Depends(get_current_user)):
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins")
    
    # Aktif dönem kontrolü
    active_season = await get_active_season()
    
    # Kapalı döneme fiyat eklenemez
    if data.season_id != active_season["id"]:
        raise HTTPException(status_code=400, detail="Kapalı döneme fiyat eklenemez")
    
    # REVİZYON #3: Çakışma kontrolü
    await validate_price_date_range(
        student_id=data.student_id,
        branch_id=data.branch_id,
        lesson_type=data.lesson_type,  # REVİZYON #2
        valid_from=data.valid_from,
        valid_to=None
    )
    
    # REVİZYON #2: lesson_type bazında mevcut geçerli fiyatı kapat
    await db.student_price_history.update_one(
        {
            "student_id": data.student_id,
            "branch_id": data.branch_id,
            "lesson_type": data.lesson_type,  # REVİZYON #2
            "valid_to": None
        },
        {"$set": {"valid_to": data.valid_from}}
    )
    
    # Yeni fiyatı ekle
    new_price = StudentPriceHistory(
        student_id=data.student_id,
        branch_id=data.branch_id,
        lesson_type=data.lesson_type,
        price=data.price,
        valid_from=data.valid_from,
        valid_to=None,
        season_id=data.season_id,
        needs_review=False,
        created_by=current_user.id
    )
    
    await db.student_price_history.insert_one(new_price.model_dump())
    
    return {"message": "Fiyat güncellendi", "id": new_price.id}
```

### 9.3 GEÇMİŞ BAŞLANGIÇ TARİHİ İLE FİYAT GÜNCELLEME
```python
@api_router.post("/price-updates/preview")
async def preview_price_update(data: PriceUpdatePreview, current_user: User = Depends(get_current_user)):
    """
    Fiyat güncellemesinin etkileyeceği dersleri önizle.
    Sadece AÇIK dönemdeki dersler etkilenir.
    """
    active_season = await get_active_season()
    
    # Etkilenecek dersleri bul
    affected_lessons = await db.lessons.find({
        "student_id": data.student_id,
        "branch_id": data.branch_id,
        "season_id": active_season["id"],
        "date": {"$gte": data.valid_from},
        "is_free_lesson": {"$ne": True}
    }).to_list(10000)
    
    old_total = 0
    new_total = 0
    
    for lesson in affected_lessons:
        old_price = lesson.get("student_unit_price_at_lesson") or await get_student_price_at_date(...)
        old_total += old_price * lesson["number_of_lessons"]
        new_total += data.new_price * lesson["number_of_lessons"]
    
    return {
        "affected_lesson_count": len(affected_lessons),
        "old_total_usage": old_total,
        "new_total_usage": new_total,
        "balance_difference": old_total - new_total,  # Pozitif = bakiye artar
        "lessons": [{"id": l["id"], "date": l["date"]} for l in affected_lessons]
    }

@api_router.post("/price-updates/confirm")
async def confirm_price_update(data: PriceUpdateConfirm, current_user: User = Depends(get_current_user)):
    """
    Fiyat güncellemesini onayla ve etkilenen dersleri güncelle.
    """
    # Fiyat kaydını oluştur
    # Etkilenen derslerin snapshot'larını güncelle
    # Audit log oluştur
    pass
```

---

## 10. ÖĞRETMEN FİYAT GEÇMİŞİ MODELİ

### 10.1 MODEL
```python
class TeacherPriceHistory(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    teacher_id: str
    branch_id: str
    lesson_type_id: str
    group_size: Optional[int] = None   # 1, 2, 3, 4 (grup dersleri için)
    price: float
    valid_from: str
    valid_to: Optional[str] = None
    season_id: str
    needs_review: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str
```

### 10.2 MEVCUT teacher_prices İLE İLİŞKİ
```
- teacher_prices tablosu korunacak (güncel fiyatlar için hızlı erişim)
- teacher_price_history geçmiş için tutulacak
- Fiyat güncellendiğinde her ikisi de güncellenecek
```

---

## 11. DERS KAYDI FİYAT SNAPSHOT

### 11.1 GENİŞLETİLMİŞ LESSON MODELİ
```python
class Lesson(BaseModel):
    # Mevcut alanlar
    id: str
    student_course_id: str
    date: str
    number_of_lessons: int
    teacher_rate: Optional[float] = None      # Zaten var - öğretmen birim ücreti
    group_id: Optional[str] = None
    is_free_lesson: bool = False
    teacher_id: Optional[str] = None
    branch_id: Optional[str] = None
    student_id: Optional[str] = None
    created_at: datetime
    
    # YENİ snapshot alanları
    season_id: Optional[str] = None
    student_unit_price_at_lesson: Optional[float] = None    # Öğrenci birim ücreti
    student_total_amount_at_lesson: Optional[float] = None  # Öğrenci toplam tutarı
    teacher_unit_price_at_lesson: Optional[float] = None    # = teacher_rate
    teacher_total_earning_at_lesson: Optional[float] = None # Öğretmen toplam kazancı
```

### 11.2 DERS OLUŞTURULURKEN SNAPSHOT ALMA
```python
async def create_lesson_with_snapshot(lesson_data: LessonCreate):
    # Aktif dönemi al
    active_season = await get_active_season()
    
    # Ders tarihindeki öğrenci fiyatını al
    student_price = await get_student_price_at_date(
        student_id=lesson_data.student_id,
        branch_id=lesson_data.branch_id,
        date=lesson_data.date
    )
    
    # Öğretmen fiyatı zaten teacher_rate olarak geliyor
    teacher_price = lesson_data.teacher_rate
    
    lesson = Lesson(
        # ... mevcut alanlar ...
        season_id=active_season["id"],
        student_unit_price_at_lesson=student_price,
        student_total_amount_at_lesson=student_price * lesson_data.number_of_lessons,
        teacher_unit_price_at_lesson=teacher_price,
        teacher_total_earning_at_lesson=teacher_price * lesson_data.number_of_lessons
    )
    
    return lesson
```

---

## 12. SENE SONU PREVIEW RESPONSE

### 12.1 ENDPOINT
```
POST /api/year-end/preview
```

### 12.2 RESPONSE MODELİ
```python
{
    "closing_season": {
        "id": "season-2024-2025",
        "name": "2024-2025"
    },
    "opening_season": {
        "id": "season-2025-2026",
        "name": "2025-2026"
    },
    "cutoff_date": "2026-06-20T14:35:00Z",
    
    "student_summary": {
        "total_active_students": 45,
        "upgrading_students": 35,         # 5-6-7 sınıf
        "graduating_students": 8,         # 8. sınıf → pasif
        "already_inactive": 12,           # Zaten pasif
        
        "class_breakdown": {
            "5_to_6": 10,
            "6_to_7": 12,
            "7_to_8": 13,
            "8_to_inactive": 8
        }
    },
    
    "group_summary": {
        "total_active_groups": 15,
        "groups_to_close": 15,
        "groups_to_copy": 0               # Grup kopyalanmayacak
    },
    
    "student_balances": [
        {
            "student_id": "...",
            "student_name": "Ela Yılmaz",
            "level": "7",                 # Mevcut sınıf
            "new_level": "8",             # Yeni sınıf (pasife alınacaksa null)
            "will_graduate": false,
            "total_balance": 3000,
            "by_branch": [
                {
                    "branch_id": "...",
                    "branch_name": "Fen",
                    "balance": 5000,
                    "status": "alacakli"
                },
                {
                    "branch_id": "...",
                    "branch_name": "Matematik",
                    "balance": -2000,
                    "status": "borclu"
                }
            ]
        }
    ],
    
    "teacher_balances": [
        {
            "teacher_id": "...",
            "teacher_name": "Ayşegül Hoca",
            "carryover_balance": 20000,   # Devredecek bakiye
            "total_earnings": 150000,
            "total_paid": 130000
        }
    ],
    
    "cashbox_note": "Kasa bakiyeleri değişmeyecek",
    
    "warnings": [
        "8 öğrenci mezun olacak ve bakiyeleri yeni döneme taşınmayacak",
        "15 grup kapatılacak"
    ]
}
```

---

## 13. SENE SONU EXECUTE ADIMLARI

### 13.1 ENDPOINT
```
POST /api/year-end/execute
```

### 13.2 ADIMLAR (SIRALI)

```python
async def execute_year_end(admin_user_id: str):
    # ========== HAZIRLIK ==========
    
    # 1. Aktif dönemi tekrar doğrula
    active_season = await db.seasons.find_one({"status": "active", "is_current": True})
    if not active_season:
        raise HTTPException(status_code=400, detail="Aktif dönem bulunamadı")
    
    # 2. Aynı dönem için daha önce sene sonu yapılmamış mı kontrol et
    existing_log = await db.year_end_logs.find_one({
        "from_season_id": active_season["id"],
        "status": "success"
    })
    if existing_log:
        raise HTTPException(status_code=400, detail="Bu dönem için sene sonu işlemi zaten yapılmış")
    
    # 3. Kesim tarihini belirle
    cutoff_date = datetime.now(timezone.utc)
    
    # 4. Yeni dönem ID'si oluştur
    new_season_name = get_next_season_name(active_season["name"])  # "2024-2025" -> "2025-2026"
    new_season_id = f"season-{new_season_name}"
    
    try:
        # ========== SNAPSHOT OLUŞTUR ==========
        
        # 5. Öğrenci bakiyelerini hesapla ve sakla
        student_balances = await calculate_all_student_balances(active_season["id"])
        
        # 6. Öğretmen bakiyelerini hesapla ve sakla
        teacher_balances = await calculate_all_teacher_balances(active_season["id"])
        
        # ========== YENİ DÖNEM OLUŞTUR ==========
        
        # 7. Yeni dönemi oluştur (henüz aktif değil)
        new_season = {
            "id": new_season_id,
            "name": new_season_name,
            "start_date": cutoff_date.strftime("%Y-%m-%d"),
            "end_date": None,
            "status": "active",
            "is_current": False,  # Henüz değil
            "previous_season_id": active_season["id"],
            "created_at": cutoff_date
        }
        await db.seasons.insert_one(new_season)
        
        # ========== ÖĞRENCİ İŞLEMLERİ ==========
        
        # 8. Aktif öğrencileri çek
        students = await db.students.find({"status": "active"}).to_list(10000)
        
        upgraded_count = 0
        graduated_count = 0
        
        for student in students:
            level = int(student.get("level", 0))
            student_id = student["id"]
            
            if level == 8:
                # 8. sınıf → Pasife al, bakiye devretme
                await db.students.update_one(
                    {"id": student_id},
                    {"$set": {"status": "inactive"}}
                )
                graduated_count += 1
            elif level >= 5 and level <= 7:
                # 5-7. sınıf → Sınıf atlat
                await db.students.update_one(
                    {"id": student_id},
                    {"$set": {"level": str(level + 1)}}
                )
                upgraded_count += 1
                
                # Bakiye devir kayıtları oluştur (branş bazlı)
                balances = student_balances.get(student_id, {})
                for branch_id, balance in balances.items():
                    if balance != 0:
                        carryover = {
                            "id": str(uuid.uuid4()),
                            "entity_type": "student",
                            "entity_id": student_id,
                            "branch_id": branch_id,
                            "from_season_id": active_season["id"],
                            "to_season_id": new_season_id,
                            "amount": balance,
                            "description": f"{active_season['name']} dönem kapanışından aktarıldı",
                            "created_at": cutoff_date
                        }
                        await db.season_carryovers.insert_one(carryover)
        
        # ========== ÖĞRETMEN İŞLEMLERİ ==========
        
        # 9. Öğretmen bakiye devir kayıtları
        for teacher_id, balance in teacher_balances.items():
            if balance != 0:
                carryover = {
                    "id": str(uuid.uuid4()),
                    "entity_type": "teacher",
                    "entity_id": teacher_id,
                    "branch_id": None,
                    "from_season_id": active_season["id"],
                    "to_season_id": new_season_id,
                    "amount": balance,
                    "description": f"{active_season['name']} dönem kapanışından aktarıldı",
                    "created_at": cutoff_date
                }
                await db.season_carryovers.insert_one(carryover)
        
        # ========== DERS İLİŞKİSİ KOPYALAMA ==========
        
        # REVİZYON #4: SADECE BİREBİR ders ilişkilerini yeni döneme kopyala
        # Grup student_course kayıtları KOPYALANMAZ
        courses = await db.student_courses.find({
            "season_id": active_season["id"],
            "status": "active",
            "group_id": {"$exists": False}  # REVİZYON #4: Sadece birebir (grup olmayanlar)
        }).to_list(10000)
        
        # Alternatif: group_id null veya yok olanları al
        # NOT: Grup student_course kayıtları yeni döneme KOPYALANMAZ
        
        copied_course_count = 0
        for course in courses:
            # Öğrenci pasife alınmadıysa kopyala
            student = await db.students.find_one({"id": course["student_id"]})
            if student and student.get("status") == "active":
                new_course = {
                    **course,
                    "id": str(uuid.uuid4()),
                    "season_id": new_season_id,
                    "created_at": cutoff_date
                }
                # _id varsa kaldır (MongoDB)
                new_course.pop("_id", None)
                await db.student_courses.insert_one(new_course)
                copied_course_count += 1
                
                # Eski course'u işaretle
                await db.student_courses.update_one(
                    {"id": course["id"]},
                    {"$set": {
                        "closed_at": cutoff_date,
                        "copied_to_id": new_course["id"]
                    }}
                )
        
        # ========== GRUP KAPATMA ==========
        
        # 11. Tüm aktif grupları kapat
        closed_groups = await db.student_groups.update_many(
            {"season_id": active_season["id"], "status": "active"},
            {"$set": {
                "status": "closed",
                "closed_at": cutoff_date,
                "closed_reason": "year_end"
            }}
        )
        
        # ========== FİYAT KOPYALAMA ==========
        
        # 12. Öğrenci fiyatlarını yeni döneme kopyala
        student_prices = await db.student_price_history.find({
            "season_id": active_season["id"],
            "valid_to": None
        }).to_list(10000)
        
        for price in student_prices:
            # Öğrenci aktifse kopyala
            student = await db.students.find_one({"id": price["student_id"]})
            if student and student.get("status") == "active":
                new_price = {
                    **price,
                    "id": str(uuid.uuid4()),
                    "season_id": new_season_id,
                    "valid_from": cutoff_date.strftime("%Y-%m-%d"),
                    "needs_review": True,  # Yeni dönem kontrolü gerekiyor
                    "created_at": cutoff_date,
                    "created_by": "year_end_migration"
                }
                await db.student_price_history.insert_one(new_price)
        
        # 13. Öğretmen fiyatlarını yeni döneme kopyala
        teacher_prices = await db.teacher_price_history.find({
            "season_id": active_season["id"],
            "valid_to": None
        }).to_list(10000)
        
        for price in teacher_prices:
            new_price = {
                **price,
                "id": str(uuid.uuid4()),
                "season_id": new_season_id,
                "valid_from": cutoff_date.strftime("%Y-%m-%d"),
                "needs_review": True,
                "created_at": cutoff_date,
                "created_by": "year_end_migration"
            }
            await db.teacher_price_history.insert_one(new_price)
        
        # ========== AKADEMİK MODÜLLER ==========
        
        # 14. Planlama Ustası sıfırla (yeni dönem için yeni season string)
        # (Mevcut kayıtlar korunur, yeni dönemde yeni kayıtlar oluşur)
        
        # Ödev/rozet/streak kayıtları season_id ile ayrılır
        # Silme yok, sadece yeni dönemde temiz başlangıç
        
        # ========== DÖNEM DURUMU GÜNCELLE ==========
        
        # 15. Eski dönemi kapat
        await db.seasons.update_one(
            {"id": active_season["id"]},
            {"$set": {
                "status": "closed",
                "is_current": False,
                "end_date": cutoff_date.strftime("%Y-%m-%d"),
                "closed_at": cutoff_date,
                "closed_by": admin_user_id,
                "next_season_id": new_season_id
            }}
        )
        
        # 16. Yeni dönemi aktif yap
        await db.seasons.update_one(
            {"id": new_season_id},
            {"$set": {"is_current": True}}
        )
        
        # ========== AUDIT LOG ==========
        
        # 17. Başarılı log oluştur
        log = {
            "id": str(uuid.uuid4()),
            "from_season_id": active_season["id"],
            "to_season_id": new_season_id,
            "executed_by": admin_user_id,
            "executed_at": cutoff_date,
            "cutoff_date": cutoff_date,
            "status": "success",
            "summary": {
                "upgraded_count": upgraded_count,
                "graduated_count": graduated_count,
                "closed_groups_count": closed_groups.modified_count,
                "carryover_student_count": len([s for s in student_balances if student_balances[s]]),
                "carryover_teacher_count": len([t for t in teacher_balances if teacher_balances[t]])
            }
        }
        await db.year_end_logs.insert_one(log)
        
        return {
            "success": True,
            "from_season": active_season["name"],
            "to_season": new_season_name,
            "summary": log["summary"]
        }
        
    except Exception as e:
        # Hata durumunda log oluştur
        error_log = {
            "id": str(uuid.uuid4()),
            "from_season_id": active_season["id"],
            "to_season_id": new_season_id,
            "executed_by": admin_user_id,
            "executed_at": cutoff_date,
            "cutoff_date": cutoff_date,
            "status": "failed",
            "error_message": str(e)
        }
        await db.year_end_logs.insert_one(error_log)
        raise HTTPException(status_code=500, detail=f"Sene sonu işlemi başarısız: {str(e)}")
```

---

## 14. ROLLBACK/IDEMPOTENCY

### 14.1 IDEMPOTENCY
```python
# Her execute öncesi kontrol:
existing_log = await db.year_end_logs.find_one({
    "from_season_id": active_season["id"],
    "status": "success"
})
if existing_log:
    raise HTTPException(status_code=400, detail="Bu dönem için sene sonu işlemi zaten yapılmış")
```

### 14.2 ROLLBACK STRATEJİSİ

> ⚠️ **REVİZYON #8**: Rollback endpoint NORMAL ADMİN ÖZELLİĞİ OLARAK EKLENMEYECEK.
> Sadece ACİL TEKNİK RECOVERY PLANI olarak dokümantasyonda kalacak.

```
MongoDB transaction desteği olmadığı için:

1. İşlem öncesi snapshot al (audit log'da)
2. İşlem sırasında hata olursa:
   - year_end_logs'a "failed" status ile kaydet
   - Hata mesajını logla
   - Manuel müdahale için admin'e bildir

3. Kısmi başarı durumu için:
   - status: "partial" kullan
   - Hangi adımda kaldığını kaydet
   - Admin devam ettirme/geri alma kararı verir

4. Kritik işlemler:
   - Dönem durumu en son değişir
   - Veri silinmez, sadece status/flag güncellenir
   - Geri dönüş SADECE TEKNİK EKİP TARAFINDAN DB üzerinden yapılabilir
```

### 14.3 ACİL RECOVERY PLANI (SADECE TEKNİK EKİP - UI YOK)

> ⚠️ **REVİZYON #8**: Bu endpoint UI'da görünmeyecek, sadece teknik recovery için.
> Normal admin özelliği olarak EKLENMEYECEK.

```python
# NOT: Bu endpoint SADECE teknik ekip tarafından, doğrudan API çağrısıyla kullanılır.
# Admin panelinde butonu/linki OLMAYACAK.

# Recovery senaryosu:
# 1. Teknik ekip DB yedeği alır
# 2. Gerekli değişiklikleri manuel veya script ile yapar
# 3. Değişiklikleri doğrular
#
# Rollback adımları (MANUEL DB İŞLEMİ):
# 1. Yeni dönemi sil: db.seasons.delete_one({"id": new_season_id})
# 2. Eski dönemi aktif yap: db.seasons.update_one({"id": old_season_id}, {"$set": {"status": "active", "is_current": True, "end_date": None, "closed_at": None}})
# 3. Carryover kayıtlarını sil: db.season_carryovers.delete_many({"to_season_id": new_season_id})
# 4. Kopyalanan course'ları sil: db.student_courses.delete_many({"season_id": new_season_id})
# 5. Öğrenci sınıflarını geri al: (Manuel, snapshot'tan)
# 6. Grupları tekrar aktif yap: db.student_groups.update_many({"closed_reason": "year_end", "season_id": old_season_id}, {"$set": {"status": "active"}, "$unset": {"closed_at": "", "closed_reason": ""}})
```

---

## 15. KAPALI DÖNEM KONTROLÜ

### 15.1 YARDIMCI FONKSİYON
```python
async def check_season_is_open(season_id: str = None, date: str = None):
    """
    Dönemin açık olup olmadığını kontrol eder.
    Kapalıysa HTTPException fırlatır.
    """
    if season_id:
        season = await db.seasons.find_one({"id": season_id})
    elif date:
        # Tarihe göre dönemi bul
        season = await db.seasons.find_one({
            "start_date": {"$lte": date},
            "$or": [
                {"end_date": None},
                {"end_date": {"$gte": date}}
            ]
        })
    else:
        season = await db.seasons.find_one({"status": "active", "is_current": True})
    
    if not season:
        raise HTTPException(status_code=400, detail="Dönem bulunamadı")
    
    if season["status"] == "closed":
        raise HTTPException(status_code=400, detail="Bu dönem kapatılmıştır. Kapalı döneme yeni işlem girilemez.")
    
    return season
```

### 15.2 KONTROL EKLENECEK ENDPOINTLer

> ⚠️ **REVİZYON #9**: Kapalı dönem kontrolleri TÜM ilgili endpoint'lerde TAM uygulanacak.

| Endpoint | Kontrol Türü |
|----------|--------------|
| **DERS İŞLEMLERİ** | |
| `POST /lessons` | Ders tarihi kapalı dönemde mi? |
| `PUT /lessons/{id}` | Ders kapalı dönemde mi? |
| `DELETE /lessons/{id}` | Ders kapalı dönemde mi? |
| `POST /group-lessons` | Ders tarihi kapalı dönemde mi? |
| `PUT /group-lessons/{id}` | Kapalı dönem kontrolü |
| `DELETE /group-lessons/{id}/{date}` | Kapalı dönem kontrolü |
| **ÖDEME İŞLEMLERİ** | |
| `POST /payments` | Ödeme tarihi kapalı dönemde mi? |
| `PUT /payments/{id}` | Ödeme kapalı dönemde mi? |
| `DELETE /payments/{id}` | Ödeme kapalı dönemde mi? |
| **GELİR/GİDER İŞLEMLERİ** | |
| `POST /cashbox-movements` | Tarih kapalı dönemde mi? |
| `PUT /cashbox-movements/{id}` | Kapalı dönem kontrolü |
| `DELETE /cashbox-movements/{id}` | Kapalı dönem kontrolü |
| **PLANLAMA İŞLEMLERİ** | |
| `POST /planned-lessons` | Planlanan tarih kapalı dönemde mi? |
| `PUT /planned-lessons/{id}` | Kapalı dönem kontrolü |
| `DELETE /planned-lessons/{id}` | Kapalı dönem kontrolü |
| **KAMP İŞLEMLERİ (REVİZYON #1)** | |
| `POST /camps` | Kamp tarihi kapalı dönemde mi? |
| `PUT /camps/{id}` | Kapalı dönem kontrolü |
| `DELETE /camps/{id}` | Kapalı dönem kontrolü |
| `POST /camp-students` | Kamp dönem kontrolü |
| `PUT /camp-students/{id}` | Kapalı dönem kontrolü |
| `DELETE /camp-students/{id}` | Kapalı dönem kontrolü |
| **YOUTUBE İŞLEMLERİ** | |
| `POST /youtube-contents` | Tarih kapalı dönemde mi? |
| `PUT /youtube-contents/{id}` | Kapalı dönem kontrolü |
| `DELETE /youtube-contents/{id}` | Kapalı dönem kontrolü |
| **FİYAT İŞLEMLERİ** | |
| `POST /student-price-history` | Sadece açık döneme |
| `PUT /student-price-history/{id}` | Kapalı dönem kontrolü |
| `POST /teacher-price-history` | Sadece açık döneme |
| `PUT /teacher-price-history/{id}` | Kapalı dönem kontrolü |
| **MANUEL BAKİYE DÜZELTME** | |
| `POST /manual-balance-adjustments` | Sadece açık döneme |
| **ÖDEV/PLANLAMA İŞLEMLERİ** | |
| `POST /homework-plans` | Season kontrolü |
| `PUT /homework-plans/{id}` | Kapalı dönem kontrolü |
| `DELETE /homework-plans/{id}` | Kapalı dönem kontrolü |
| `POST /homework-plan-items` | Season kontrolü |
| Rozet/Planlama Ustası endpoint'leri | Season kontrolü |

### 15.3 ÖRNEK KONTROL
```python
@api_router.post("/lessons")
async def create_lesson(...):
    # Kapalı dönem kontrolü
    lesson_date = data.date
    await check_season_is_open(date=lesson_date)
    
    # Devam...
```

---

## 16. DÖNEM FİLTRESİ

### 16.1 EKLENECEK GET ENDPOINTLERİ

| Endpoint | Parametre | Varsayılan |
|----------|-----------|------------|
| `GET /lessons` | `season_id` | Aktif dönem |
| `GET /payments` | `season_id` | Aktif dönem |
| `GET /students/{id}/finance-detail` | `season_id` | Aktif dönem |
| `GET /students/by-branch/{id}` | `season_id` | Aktif dönem |
| `GET /teacher-balance/{id}` | `season_id` | Aktif dönem |
| `GET /teachers/{id}/lesson-income-detail` | `season_id` | Aktif dönem |
| `GET /group-lessons/{group_id}` | `season_id` | Aktif dönem |
| `GET /cashboxes/{id}/movements` | `season_id` | Aktif dönem |
| `GET /youtube-contents` | `season_id` | Aktif dönem |
| `GET /trial-exams` | `season_id` | Aktif dönem |
| `GET /homework/*` | `season_id` | Aktif dönem |

### 16.2 ÖRNEK İMPLEMENTASYON
```python
@api_router.get("/lessons")
async def get_lessons(
    student_course_id: Optional[str] = None,
    season_id: Optional[str] = None,  # YENİ
    current_user: User = Depends(get_current_user)
):
    # Dönem belirtilmemişse aktif dönemi kullan
    if not season_id:
        active_season = await get_active_season()
        season_id = active_season["id"]
    
    query = {"season_id": season_id}
    if student_course_id:
        query["student_course_id"] = student_course_id
    
    lessons = await db.lessons.find(query, {"_id": 0}).to_list(10000)
    return lessons
```

### 16.3 FRONTEND EKRANLARı

| Ekran | Filtre Konumu |
|-------|---------------|
| Öğrenci Finans Detay | Sayfa üstünde dropdown |
| Öğrenci Ders Geçmişi | Sayfa üstünde dropdown |
| Öğretmen Bakiye/Kazanç | Sayfa üstünde dropdown |
| Kasa Hareketleri | Sayfa üstünde dropdown |
| Admin Ders Listesi | Sayfa üstünde dropdown |
| Grup Dersleri | Sayfa üstünde dropdown |
| Dashboard | Sadece aktif dönem (filtre yok) |

---

## 17. TEST SENARYOLARI

### 17.1 SENE SONU TEMEL TESTLERİ
```
[x] 1. 5. sınıf aktif öğrenci 6. sınıfa geçmeli
[x] 2. 6. sınıf aktif öğrenci 7. sınıfa geçmeli
[x] 3. 7. sınıf aktif öğrenci 8. sınıfa geçmeli
[x] 4. 8. sınıf aktif öğrenci pasife alınmalı
[x] 5. Pasif öğrenci işlem dışında kalmalı
```

### 17.2 BAKİYE DEVİR TESTLERİ
```
[x] 6. Öğrenci Fen bakiyesi branş bazında yeni döneme devretmeli
[x] 7. Öğrenci Matematik borcu negatif bakiye olarak devretmeli
[x] 8. 8. sınıf öğrencinin bakiyesi devretmemeli
[x] 9. Öğretmen kalan bakiyesi devretmeli
```

### 17.3 DERS İLİŞKİSİ TESTLERİ
```
[x] 10. Birebir ders ilişkisi kopyalanmalı
[x] 11. Grup yeni döneme kopyalanmamalı
[x] 12. Eski grup kapanmalı
[x] 13. Grup öğrencisinin branş bakiyesi devretmeli
```

### 17.4 AKTİF DERS İLİŞKİSİ OLMAYAN BRANŞ TESTLERİ
```
[x] 14. Aktif ders ilişkisi olmayan branş bakiyesi admin ekranında görünmeli
[x] 15. Aktif ders ilişkisi olmayan branşa ödeme girilebilmeli
[x] 16. Fiyat yoksa kalan ders "-" görünmeli
[x] 17. Fiyat varsa kalan ders doğru hesaplanmalı
```

### 17.5 ÖDEME TESTLERİ
```
[x] 18. Öğretmen ödemesi toplam bakiyeden düşmeli
[x] 19. Kasa bakiyesi sene sonunda değişmemeli
```

### 17.6 DÖNEM FİLTRESİ TESTLERİ
```
[x] 20. Kasa hareketleri default güncel dönemi göstermeli
[x] 21. Eski dönem filtreyle görülebilmeli
```

### 17.7 KAPALI DÖNEM TESTLERİ
```
[x] 22. Kapalı döneme ders girilememeli
[x] 23. Kapalı döneme ödeme girilememeli
[x] 24. Kapalı döneme gelir/gider girilememeli
[x] 25. Kapalı dönem dersi düzenlenememeli/silinememeli
```

### 17.8 FİYAT GEÇMİŞİ TESTLERİ
```
[x] 26. Yeni fiyat kapalı dönem derslerini etkilememeli
[x] 27. Geçmiş başlangıç tarihli fiyat güncellemesinde ön izleme çıkmalı
[x] 28. Admin onaylarsa açık dönem dersleri güncellenmeli
[x] 29. Ders tarihi değişirse fiyat yeniden hesaplanmalı
[x] 30. Kapalı döneme ders tarihi çekilememeli
```

### 17.9 DÖNEM GÖRÜNTÜLEMESİ TESTLERİ
```
[x] 31. Öğretmen ve admin eski dönem kazançlarını görebilmeli
[x] 32. Eski dönem kazançları düzenlenememeli
```

### 17.10 AKADEMİK MODÜL TESTLERİ
```
[x] 33. Ödev/planlama/rozet bilgileri yeni dönemde sıfırlanmalı
[x] 34. Eski geçmiş silinmemeli
```

### 17.11 PREVIEW VE UI TESTLERİ
```
[x] 35. Preview'da öğrenci bakiyeleri branş bazlı görünmeli
[x] 36. Pozitif yeşil, negatif kırmızı
[x] 37. Öğretmen preview'da sadece devredecek bakiye
[x] 38. Dashboard'da ücret kontrol kartları
```

### 17.12 GÜVENLİK TESTLERİ
```
[x] 39. Aynı dönem için sene sonu ikinci kez çalıştırılamamalı
[x] 40. İşlem yarıda kalırsa veri bozulmamalı
```

---

## 18. PROD MIGRATION VE YEDEKLEME

### 18.1 MIGRATION ÖNCESİ
```
1. TÜM COLLECTION'LARIN YEDEĞİNİ AL
   - mongoexport ile her collection'ı JSON olarak dışa aktar
   - Tarih damgalı klasöre kaydet

2. UYGULAMA DURDURMA
   - Sene sonu işlemi öncesi uygulamayı maintenance moduna al
   - Kullanıcı girişlerini engelle

3. VERİ DOĞRULAMA
   - Öğrenci sayılarını kontrol et
   - Öğretmen sayılarını kontrol et
   - Toplam bakiyeleri kontrol et
```

### 18.2 MIGRATION ADIMLARI
```
1. SCHEMA MIGRATION
   - Yeni collection'ları oluştur
   - Mevcut model'lere yeni alanları ekle (nullable olarak)

2. DATA MIGRATION
   - İlk dönem kaydını oluştur
   - Mevcut kayıtlara seasonId ekle
   - Fiyat geçmişi kayıtlarını oluştur

3. ENDPOINT MIGRATION
   - Yeni endpoint'leri deploy et
   - Kapalı dönem kontrollerini aktif et
   - Dönem filtrelerini aktif et

4. UI MIGRATION
   - Dönem seçici component'lerini deploy et
   - Sene sonu preview ekranını deploy et
```

### 18.3 MIGRATION SONRASI
```
1. DOĞRULAMA
   - Tüm öğrenci bakiyeleri doğru hesaplanıyor mu?
   - Tüm öğretmen bakiyeleri doğru hesaplanıyor mu?
   - Dönem filtresi çalışıyor mu?

2. SMOKE TEST
   - Ders girişi yapılabiliyor mu?
   - Ödeme girişi yapılabiliyor mu?
   - Fiyat güncellemesi yapılabiliyor mu?

3. KULLANICI TESTI
   - Admin sene sonu preview'ı görebiliyor mu?
   - Öğretmen ders geçmişini görebiliyor mu?

4. UYGULAMA AÇMA
   - Maintenance modunu kapat
   - Kullanıcı girişlerini aç
```

### 18.4 GERİ DÖNÜŞ PLANI
```
Ciddi hata durumunda:
1. Uygulamayı maintenance moduna al
2. Yedekten geri yükle
3. Eski kodu deploy et
4. Hata analizi yap
5. Düzeltilmiş versiyonu test et
6. Yeniden deploy et
```

---

## ONAY BEKLENİYOR (VERSİYON 2.0)

Bu teknik dokümanı onaylıyor musunuz?

### REVİZYON ÖZETİ (v2.0)

| # | Revizyon Talebi | Yapılan Değişiklik |
|---|-----------------|-------------------|
| ✅ 1 | Kamp kazancı dönemsel | Kamplar `season_id` alacak, `calculate_camp_earnings_by_season()` |
| ✅ 2 | Student price history key | `student_id + branch_id + lesson_type` bazında çalışacak |
| ✅ 3 | valid_from/valid_to çakışması | `validate_price_date_range()` fonksiyonu eklendi |
| ✅ 4 | Grup student_course kopyalanmayacak | Execute'da `group_id: {"$exists": False}` filtresi |
| ✅ 5 | İlk dönem admin seçimi | `POST /admin/seasons/create-initial` endpoint'i, hardcoded değil |
| ✅ 6 | Teacher price snapshot backend | `get_teacher_price_at_date()` fonksiyonu, frontend'e güvenilmez |
| ✅ 7 | Dönem kapanışı datetime | Tüm tarih alanları `datetime` (UTC timezone aware) |
| ✅ 8 | Rollback sadece acil recovery | UI'da yok, sadece teknik recovery planı |
| ✅ 9 | Kapalı dönem kontrolleri genişletildi | Kamp, YouTube, ödeme, gelir/gider, ders, planlama, ödev, fiyat |
| ✅ 10 | Doküman revize edildi | Bu versiyon sunuldu |

### Onay sonrası uygulama sırası:

**Faz 1: Temel Dönem Altyapısı**
1. Season modeli genişletme
2. Yeni collection'ların oluşturulması
3. `POST /admin/seasons/create-initial` endpoint'i
4. `POST /admin/seasons/migrate` endpoint'i

**Faz 2: Sene Sonu Preview**
5. `POST /api/year-end/preview` endpoint'i
6. Preview UI sayfası

**Faz 3: Sene Sonu Execute**
7. `POST /api/year-end/execute` endpoint'i
8. Execute UI sayfası

**Faz 4: Fiyat Geçmişi**
9. Student/Teacher price history endpoint'leri
10. Ders kaydı fiyat snapshot mantığı

**Faz 5: Zorunlu UI**
11. Dönem filtresi (tüm listeleme sayfaları)
12. Kapalı dönem kontrolleri (tüm CUD endpoint'leri)
13. Dashboard kartları

---

**Doküman Sonu - Versiyon 2.0**
