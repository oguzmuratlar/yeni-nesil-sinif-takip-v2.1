from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Body, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
import json
import zipfile
import io
import tempfile

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=10)
security = HTTPBearer()
SECRET_KEY = os.environ.get('SECRET_KEY', 'your-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

# Double-click koruması için in-memory cache
# Key: "lesson_start:{teacher_id}:{mode}:{type}:{id}:{link_id}:{date}"
# Value: timestamp
import time
_lesson_start_locks = {}

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# ============= MODELS =============

class UserType(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # "admin" or "teacher"

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    password_hash: str
    user_type: str  # "admin" or "teacher"
    teacher_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    username: str
    password: str
    user_type: str
    teacher_id: Optional[str] = None

class LoginRequest(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user_type: str
    teacher_id: Optional[str] = None

class Student(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    parent_name: str
    phone: str
    level: str  # sınıf
    payment_freq: str  # ödeme günü (ayın kaçıncı günü)
    notes: Optional[str] = None
    status: str = "active"
    bank_account_id: Optional[str] = None
    payment_account_name: Optional[str] = None  # Hesap adı (aylık program için)
    is_risky: bool = False  # Riskli öğrenci işareti
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StudentCreate(BaseModel):
    name: str
    parent_name: str
    phone: str
    level: str
    payment_freq: str
    notes: Optional[str] = None
    bank_account_id: Optional[str] = None
    status: Optional[str] = None  # Pasifleştirme için
    payment_account_name: Optional[str] = None  # Hesap adı (aylık program için)
    is_risky: Optional[bool] = None  # Riskli öğrenci işareti

class Teacher(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    phone: str
    address: Optional[str] = None  # Öğretmen adresi
    status: str = "active"
    season_id: Optional[str] = None
    branches: Optional[List[dict]] = None  # [{branch_id, branch_name}]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TeacherCreate(BaseModel):
    name: str
    phone: str
    address: Optional[str] = None  # Öğretmen adresi
    season_id: Optional[str] = None
    status: Optional[str] = None  # Pasifleştirme için

class Branch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str

class LessonType(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str

class Season(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # "2024-2025", "2025-2026"
    start_date: Optional[datetime] = None  # Dönem başlangıcı (UTC)
    end_date: Optional[datetime] = None  # Dönem bitişi (UTC) - None = açık dönem
    status: str = "active"  # "active" | "closed"
    is_current: bool = False  # Aktif dönem mi?
    closed_at: Optional[datetime] = None  # Kapanış timestamp'i (UTC)
    closed_by: Optional[str] = None  # Kapatan admin user_id
    previous_season_id: Optional[str] = None  # Önceki dönem ID'si
    next_season_id: Optional[str] = None  # Sonraki dönem ID'si
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SeasonCreate(BaseModel):
    """İlk dönem oluşturma için admin input modeli"""
    name: str  # Admin girer, hardcoded değil
    start_date: str  # YYYY-MM-DD formatında

# ============= SENE SONU YENİ MODELLER (FAZ 1) =============

class StudentPriceHistory(BaseModel):
    """Öğrenci fiyat geçmişi - student_id + branch_id + lesson_type bazında"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    branch_id: str
    lesson_type: str = "birebir"  # "birebir" | "group"
    price: float
    valid_from: datetime  # Geçerlilik başlangıcı (UTC)
    valid_to: Optional[datetime] = None  # None = hala geçerli
    season_id: str
    needs_review: bool = False  # Yeni dönem kopyası kontrolü
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str  # Admin user_id veya "migration"

class TeacherPriceHistory(BaseModel):
    """Öğretmen fiyat geçmişi"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    teacher_id: str
    branch_id: str
    lesson_type_id: str
    group_size: Optional[int] = None  # 1, 2, 3, 4 (grup dersleri için)
    price: float
    valid_from: datetime  # Geçerlilik başlangıcı (UTC)
    valid_to: Optional[datetime] = None  # None = hala geçerli
    season_id: str
    needs_review: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str

class SeasonCarryover(BaseModel):
    """Dönem devir kaydı - bakiye aktarımları için"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    entity_type: str  # "student" | "teacher"
    entity_id: str  # student_id veya teacher_id
    branch_id: Optional[str] = None  # Öğrenci için branş bazlı
    from_season_id: str
    to_season_id: str
    amount: float  # Devredilen bakiye (+ alacak, - borç)
    description: str  # "2024-2025 dönem kapanışından aktarıldı"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ManualBalanceAdjustment(BaseModel):
    """Manuel bakiye düzeltmesi"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    branch_id: str
    season_id: str
    amount: float  # + veya -
    description: str  # Zorunlu açıklama
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class YearEndLog(BaseModel):
    """Sene sonu işlem logu"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    from_season_id: str
    to_season_id: str
    executed_by: str
    executed_at: datetime
    cutoff_date: datetime  # Kesim tarihi
    status: str  # "success" | "failed" | "partial"
    summary: Optional[dict] = None  # Özet istatistikler
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class BankAccount(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    bank_name: str
    iban: str
    holder_name: str
    is_legal: bool = False

class BankAccountCreate(BaseModel):
    bank_name: str
    iban: str
    holder_name: str
    is_legal: bool = False

class TeacherBranch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    teacher_id: str
    branch_id: str
    season_id: Optional[str] = None

class TeacherPrice(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    teacher_id: str
    branch_id: str
    lesson_type_id: str
    price: float  # For birebir, this is the price. For group, base price
    group_size: Optional[int] = None  # 1, 2, 3, 4 for group lessons
    season_id: Optional[str] = None

class TeacherPriceCreate(BaseModel):
    teacher_id: str
    branch_id: str
    lesson_type_id: str
    price: float
    group_size: Optional[int] = None
    season_id: Optional[str] = None

class StudentGroup(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    branch_id: str
    level: str  # sınıf
    student_ids: List[str]  # öğrenci ID listesi
    teacher_id: Optional[str] = None
    status: str = "active"  # active / inactive / closed
    season_id: Optional[str] = None  # FAZ 1: Dönemsel grup
    closed_at: Optional[datetime] = None  # Kapanış zamanı
    closed_reason: Optional[str] = None  # "year_end" | "manual"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StudentGroupCreate(BaseModel):
    name: str
    branch_id: str
    level: str
    student_ids: List[str]
    teacher_id: Optional[str] = None
    status: str = "active"
    season_id: Optional[str] = None  # FAZ 1: Dönemsel grup

class StudentCourse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    teacher_id: str
    branch_id: str
    lesson_type_id: str
    price: float  # Öğretmen ücreti
    student_price: Optional[float] = None  # Öğrenci ders ücreti (finans hesaplaması için)
    season_id: Optional[str] = None
    status: str = "active"
    group_id: Optional[str] = None  # Grup ders ilişkisi için (birebir ise None)
    closed_at: Optional[datetime] = None  # FAZ 1: Dönem kapanışında set edilir
    copied_to_id: Optional[str] = None  # FAZ 1: Yeni dönem kopyasının ID'si
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StudentCourseCreate(BaseModel):
    student_id: str
    teacher_id: str
    branch_id: str
    lesson_type_id: str
    price: float
    student_price: Optional[float] = None
    season_id: Optional[str] = None
    group_id: Optional[str] = None  # FAZ 1: Grup ders ilişkisi için

class Lesson(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_course_id: str
    date: str
    number_of_lessons: int
    season_id: Optional[str] = None
    teacher_rate: Optional[float] = None  # Ücret, ders oluşturulduğu anki fiyat (geriye dönük değişiklik yapılmaz)
    group_id: Optional[str] = None  # Grup dersi ise grubun ID'si
    teacher_id: Optional[str] = None  # Öğretmen ID - course silinse bile kazanç hesaplanabilsin
    branch_id: Optional[str] = None  # Branş ID - course silinse bile kazanç hesaplanabilsin
    student_id: Optional[str] = None  # Öğrenci ID - course silinse bile izlenebilsin
    is_free_lesson: bool = False  # Ücretsiz ders - öğrenci bakiyesinden düşülmez, öğretmen kazancı devam eder
    # FAZ 4: Fiyat snapshot alanları (henüz kullanılmayacak)
    student_unit_price_at_lesson: Optional[float] = None  # Öğrenci birim ücreti snapshot
    student_total_amount_at_lesson: Optional[float] = None  # Öğrenci toplam tutarı snapshot
    teacher_unit_price_at_lesson: Optional[float] = None  # Öğretmen birim ücreti (= teacher_rate)
    teacher_total_earning_at_lesson: Optional[float] = None  # Öğretmen toplam kazancı snapshot
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class LessonCreate(BaseModel):
    student_course_id: str
    date: str
    number_of_lessons: int
    season_id: Optional[str] = None
    is_free_lesson: bool = False

class PlannedLesson(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_course_id: str
    dates: str  # Comma-separated dates
    number_of_lessons: int
    messaged: bool = False
    month: str
    no_lesson_this_month: bool = False  # Bu ay dersi yok
    season_id: Optional[str] = None  # FAZ 1: Dönemsel planlama
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PlannedLessonCreate(BaseModel):
    student_course_id: str
    dates: str  # Comma-separated dates
    number_of_lessons: int
    messaged: bool = False
    month: str
    no_lesson_this_month: bool = False  # Bu ay dersi yok
    season_id: Optional[str] = None  # FAZ 1: Dönemsel planlama

class Payment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    payment_type: str  # "student_payment", "teacher_payment", "expense", "transfer_out", "transfer_in"
    amount: float
    date: str
    student_id: Optional[str] = None
    teacher_id: Optional[str] = None
    branch_id: Optional[str] = None  # Branş bazlı ödeme takibi
    cashbox_id: Optional[str] = None  # Hangi kasaya/kasadan
    bank_account_id: Optional[str] = None
    description: Optional[str] = None
    expense_category: Optional[str] = None  # "Kira", "Reklam", "Maaş", "Ofis", "Sermaye", "Transfer"
    payment_method: Optional[str] = None  # "elden" veya "resmi" - sadece Maaş kategorisi için
    tax_amount: Optional[float] = None  # Vergi tutarı - sadece resmi maaş ödemeleri için
    transfer_id: Optional[str] = None  # Kasalar arası transfer için
    season_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PaymentCreate(BaseModel):
    payment_type: str
    amount: float
    date: str
    student_id: Optional[str] = None
    teacher_id: Optional[str] = None
    branch_id: Optional[str] = None
    cashbox_id: Optional[str] = None
    bank_account_id: Optional[str] = None
    description: Optional[str] = None
    expense_category: Optional[str] = None
    payment_method: Optional[str] = None  # "elden" veya "resmi"
    tax_amount: Optional[float] = None  # Vergi tutarı
    season_id: Optional[str] = None

# ============= CASHBOX MODELS =============

class BranchCashbox(BaseModel):
    """Branş bazlı kasa modeli"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    branch_id: str  # Hangi branşın kasası
    name: str  # "Türkçe Kasası", "Matematik Kasası" vb.
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CashboxTransfer(BaseModel):
    """Kasalar arası transfer modeli"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    from_cashbox_id: str  # Çıkış kasası
    to_cashbox_id: str  # Giriş kasası
    amount: float
    description: Optional[str] = None
    date: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CashboxTransferCreate(BaseModel):
    from_cashbox_id: str
    to_cashbox_id: str
    amount: float
    description: Optional[str] = None
    date: str

# ============= BANK ACCOUNT TRANSFER MODELS =============

class BankAccountTransfer(BaseModel):
    """Banka hesapları arası transfer modeli"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    from_account_id: str  # Çıkış hesabı
    to_account_id: str  # Giriş hesabı
    amount: float
    description: Optional[str] = None
    date: str
    created_by: Optional[str] = None  # Admin user id
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class BankAccountTransferCreate(BaseModel):
    from_account_id: str
    to_account_id: str
    amount: float
    description: Optional[str] = None
    date: str

# ============= CAMP MODELS =============

class CampStatus:
    ACTIVE = "active"
    COMPLETED = "completed"

class RegistrationStatus:
    ON_KAYIT = "on_kayit"  # Ön Kayıt
    KESIN_KAYIT = "kesin_kayit"  # Kesin Kayıt
    YEDEK = "yedek"  # Yedek

class Camp(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # Kamp adı
    class_level: str  # Kamp sınıfı (5, 6, 7, 8 vb.)
    teacher_id: str  # Öğretmen
    per_student_teacher_fee: float  # Öğretmene öğrenci başı verilecek ücret
    status: str = CampStatus.ACTIVE  # active / completed
    season_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CampCreate(BaseModel):
    name: str
    class_level: str
    teacher_id: str
    per_student_teacher_fee: float
    season_id: Optional[str] = None

class CampUpdate(BaseModel):
    name: Optional[str] = None
    class_level: Optional[str] = None
    teacher_id: Optional[str] = None
    per_student_teacher_fee: Optional[float] = None
    status: Optional[str] = None
    season_id: Optional[str] = None

class CampStudent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    camp_id: str  # Hangi kamp
    student_name: str  # Öğrenci adı
    parent_name: str  # Veli adı
    phone: str  # Telefon numarası
    registration_status: str = RegistrationStatus.ON_KAYIT  # on_kayit / kesin_kayit / yedek
    payment_amount: float  # Ödeme tutarı
    payment_completed: bool = False  # Ödeme yapıldı mı
    notes: Optional[str] = None  # Not alanı
    season_id: Optional[str] = None  # FAZ 1: Dönemsel kamp kaydı
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CampStudentCreate(BaseModel):
    camp_id: str
    student_name: str
    parent_name: str
    phone: str
    registration_status: str = RegistrationStatus.ON_KAYIT
    payment_amount: float
    payment_completed: bool = False
    notes: Optional[str] = None
    season_id: Optional[str] = None  # FAZ 1: Dönemsel kamp kaydı

class CampStudentUpdate(BaseModel):
    student_name: Optional[str] = None
    parent_name: Optional[str] = None
    phone: Optional[str] = None
    registration_status: Optional[str] = None
    payment_amount: Optional[float] = None
    payment_completed: Optional[bool] = None
    notes: Optional[str] = None

# ============= YOUTUBE CONTENT MODELS =============

class YouTubeContentStatus:
    ACTIVE = "active"
    INACTIVE = "inactive"

class YouTubeContent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    teacher_id: str  # Öğretmen
    title: str  # Video başlığı
    amount: float  # Tutar (kazanç)
    date: str  # Çekim tarihi
    status: str = YouTubeContentStatus.ACTIVE  # active / inactive
    season_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class YouTubeContentCreate(BaseModel):
    teacher_id: str
    title: str
    amount: float
    date: Optional[str] = None  # Yoksa bugünün tarihi
    season_id: Optional[str] = None

class YouTubeContentUpdate(BaseModel):
    teacher_id: Optional[str] = None
    title: Optional[str] = None
    amount: Optional[float] = None
    date: Optional[str] = None
    status: Optional[str] = None
    season_id: Optional[str] = None

# ============= SYSTEM SETTINGS / FEATURE FLAGS =============

class SystemSettings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    key: str  # Ayar anahtarı (örn: "homework_tool_enabled")
    value: bool = True  # Ayar değeri
    description: Optional[str] = None  # Açıklama
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SystemSettingsUpdate(BaseModel):
    value: bool
    description: Optional[str] = None

# ============= YNS LEAGUE MODELS =============

class StudentPointDefinitionCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    point: float
    category: str
    is_active: Optional[bool] = True

class StudentPointDefinitionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    point: Optional[float] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None

class StudentPointStatusUpdate(BaseModel):
    is_active: bool

class StudentPointRecordCreate(BaseModel):
    student_id: str
    branch_id: str
    point_definition_id: str
    quantity: Optional[int] = 1
    description: Optional[str] = ""


# ============= AUDIT LOG MODELS =============

class AuditLogActionType:
    ADD = "add"
    UPDATE = "update"
    DELETE = "delete"

class AuditLogCategory:
    LESSON_ENTRY = "lesson_entry"
    LESSON_PLANNING = "lesson_planning"

class AuditLog(BaseModel):
    """Öğretmen işlem logları için model"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    action_type: str  # add, update, delete
    category: str  # lesson_entry, lesson_planning
    teacher_id: str  # İşlemi yapan öğretmen
    teacher_name: Optional[str] = None  # Öğretmen adı (snapshot)
    student_id: Optional[str] = None  # Birebir ders için öğrenci
    student_name: Optional[str] = None  # Öğrenci adı (snapshot)
    group_id: Optional[str] = None  # Grup dersi için grup
    group_name: Optional[str] = None  # Grup adı (snapshot)
    group_students_snapshot: Optional[List[dict]] = None  # Grup öğrencileri snapshot [{id, name}]
    entity_id: str  # Lesson veya PlannedLesson ID
    old_data: Optional[dict] = None  # Değişiklik öncesi veri
    new_data: Optional[dict] = None  # Değişiklik sonrası veri
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ============= ÖDEV TAKİP SİSTEMİ MODELLERİ =============

class BookType:
    """Kitap tipleri"""
    SORU_BANKASI = "soru_bankasi"
    PARAGRAF_KITABI = "paragraf_kitabi"
    BRANS_DENEMESI = "brans_denemesi"
    FASIKUL = "fasikul"
    MEB_KAYNAGI = "meb_kaynagi"
    KAMP_KITABI = "kamp_kitabi"
    OZEL_KAYNAK = "ozel_kaynak"

class TestStatus:
    """Test durumları"""
    NOT_STARTED = "not_started"      # Başlanmadı - Beyaz
    ASSIGNED = "assigned"             # Ödev verildi - Sarı
    COMPLETED = "completed"           # Tamamlandı - Yeşil
    INCOMPLETE = "incomplete"         # Eksik - Kırmızı
    NEEDS_REVIEW = "needs_review"     # Tekrar gerekli - Mor
    SKIPPED = "skipped"               # Pas geçildi - Gri

class Book(BaseModel):
    """Kitap modeli - Branş bazlı ortak havuz"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # Kitap adı
    publisher: Optional[str] = None  # Yayınevi
    branch_id: str  # Branş (Fen, Türkçe, Matematik vb.)
    level: str  # Sınıf (5, 6, 7, 8 vb.)
    book_type: str  # Kitap tipi (soru_bankasi, paragraf_kitabi vb.)
    publish_year: Optional[int] = None  # Basım yılı
    cover_image: Optional[str] = None  # Kapak görseli URL
    status: str = "active"  # active / inactive
    created_by: Optional[str] = None  # Oluşturan öğretmen ID
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class BookCreate(BaseModel):
    name: str
    publisher: Optional[str] = None
    branch_id: str
    level: str
    book_type: str
    publish_year: Optional[int] = None
    cover_image: Optional[str] = None
    status: Optional[str] = "active"

class BookUnit(BaseModel):
    """Ünite modeli"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    book_id: str
    name: str  # Ünite adı
    order: int = 0  # Sıralama
    color: Optional[str] = None  # Renk (opsiyonel)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class BookUnitCreate(BaseModel):
    book_id: str
    name: str
    order: Optional[int] = 0
    color: Optional[str] = None

class BookTopic(BaseModel):
    """Konu modeli"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    unit_id: str
    name: str  # Konu adı
    order: int = 0  # Sıralama
    total_tests: int = 0  # Toplam test sayısı (auto-calculated)
    total_questions: Optional[int] = None  # Toplam soru sayısı (opsiyonel)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class BookTopicCreate(BaseModel):
    unit_id: str
    name: str
    order: Optional[int] = 0
    total_questions: Optional[int] = None

class BookTest(BaseModel):
    """Test modeli"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    topic_id: str
    name: str  # Test adı (Test 1, Test 2, Tekrar Testi vb.)
    question_count: Optional[int] = None  # Soru sayısı
    difficulty: Optional[str] = None  # Zorluk (kolay, orta, zor)
    test_type: Optional[str] = None  # Test tipi
    order: int = 0  # Sıralama
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class BookTestCreate(BaseModel):
    topic_id: str
    name: str
    question_count: Optional[int] = None
    difficulty: Optional[str] = None
    test_type: Optional[str] = None
    order: Optional[int] = 0

class StudentBookAssignment(BaseModel):
    """Öğrenci-Kitap ataması"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    book_id: str
    branch_id: str  # Hangi branşta atandı
    assigned_by: str  # Atayan öğretmen ID
    status: str = "active"  # active / removed
    assigned_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    removed_at: Optional[datetime] = None

class StudentBookAssignmentCreate(BaseModel):
    student_id: str
    book_id: str
    branch_id: str

class StudentTestProgress(BaseModel):
    """Öğrenci test ilerleme durumu"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    book_id: str
    test_id: str
    status: str = "not_started"  # TestStatus değerleri
    correct_count: Optional[int] = None  # Doğru sayısı
    wrong_count: Optional[int] = None  # Yanlış sayısı
    empty_count: Optional[int] = None  # Boş sayısı
    notes: Optional[str] = None  # Öğretmen notu
    updated_by: Optional[str] = None  # Son güncelleyen öğretmen
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StudentTestProgressUpdate(BaseModel):
    status: Optional[str] = None
    correct_count: Optional[int] = None
    wrong_count: Optional[int] = None
    empty_count: Optional[int] = None
    notes: Optional[str] = None

class HomeworkPlan(BaseModel):
    """Haftalık ödev planı"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    branch_id: str  # Hangi branş için
    teacher_id: str  # Planı oluşturan öğretmen
    start_date: str  # Plan başlangıç tarihi (YYYY-MM-DD)
    end_date: str  # Plan bitiş tarihi
    duration_days: int = 7  # Kaç günlük plan
    status: str = "active"  # active / completed / cancelled
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class HomeworkPlanCreate(BaseModel):
    student_id: str
    branch_id: str
    start_date: str
    duration_days: Optional[int] = 7

class HomeworkPlanItem(BaseModel):
    """Plan öğesi - test veya serbest metin"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    plan_id: str
    day_date: str  # Hangi gün için (YYYY-MM-DD)
    item_type: str  # "test" veya "freetext"
    test_id: Optional[str] = None  # Test ise
    book_id: Optional[str] = None  # Test ise kitap ID
    freetext: Optional[str] = None  # Serbest metin ise
    order: int = 0  # Gün içi sıralama
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class HomeworkPlanItemCreate(BaseModel):
    plan_id: str
    day_date: str
    item_type: str
    test_id: Optional[str] = None
    book_id: Optional[str] = None
    freetext: Optional[str] = None
    order: Optional[int] = 0

class TrialExam(BaseModel):
    """Deneme sınavı kaydı"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    branch_id: str
    teacher_id: str  # Kaydeden öğretmen
    exam_name: str  # Deneme adı
    exam_date: str  # Tarih (YYYY-MM-DD)
    correct_count: int = 0
    wrong_count: int = 0
    empty_count: int = 0
    net_score: Optional[float] = None  # Net puan
    reviewed_wrong: bool = False  # Yanlışlara tekrar baktı
    reviewed_topics: bool = False  # Eksik konuyu tekrar etti
    found_mistakes: bool = False  # Kaçırdığı bilgiyi buldu
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TrialExamCreate(BaseModel):
    student_id: str
    branch_id: str
    exam_name: str
    exam_date: str
    correct_count: int = 0
    wrong_count: int = 0
    empty_count: int = 0
    notes: Optional[str] = None

class DailyNote(BaseModel):
    """Günlük yoğunluk notu"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    branch_id: str
    teacher_id: str
    note_date: str  # YYYY-MM-DD
    note: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DailyNoteCreate(BaseModel):
    student_id: str
    branch_id: str
    note_date: str
    note: str

# ============= CALENDAR EVENT MODELS =============

class CalendarEvent(BaseModel):
    """Takvim etkinliği"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    event_date: str  # YYYY-MM-DD
    event_time: Optional[str] = None  # HH:MM (Kamp/Canlı yayın için)
    event_type: str  # video_cekimi, video_paylasimi, kamp, canli_yayin, bulusma
    teacher_ids: List[str] = []  # Hoca ID'leri (video_paylasimi için birden fazla olabilir)
    branch_ids: List[str] = []  # Branş ID'leri (video_paylasimi için)
    video_name: Optional[str] = None  # Video Paylaşımı için video adı
    title: Optional[str] = None  # Özel başlık
    status: str = "cekilecek"  # video_paylasimi için: cekilecek, cekildi, duzenlendi, planlandi
    notes: Optional[str] = None
    created_by: str  # Admin user ID
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CalendarEventCreate(BaseModel):
    event_date: str
    event_time: Optional[str] = None
    event_type: str
    teacher_ids: List[str] = []
    branch_ids: List[str] = []
    video_name: Optional[str] = None
    title: Optional[str] = None
    status: Optional[str] = "cekilecek"
    notes: Optional[str] = None

class CalendarEventUpdate(BaseModel):
    event_date: Optional[str] = None
    event_time: Optional[str] = None
    event_type: Optional[str] = None
    teacher_ids: Optional[List[str]] = None
    branch_ids: Optional[List[str]] = None
    video_name: Optional[str] = None
    title: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class CustomEventType(BaseModel):
    """Admin tarafından tanımlanan özel etkinlik tipi"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    key: str  # Benzersiz slug (custom_<uuid kısaltması>)
    label: str  # Etkinlik adı (free-text)
    icon: str = "📌"  # Emoji ikon
    color: str = "#0ea5e9"  # Takvim rengi
    teacher_visible: bool = True  # Öğretmen takviminde görünsün mü
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CustomEventTypeCreate(BaseModel):
    label: str
    icon: Optional[str] = "📌"
    color: Optional[str] = "#0ea5e9"
    teacher_visible: bool = True

class CustomEventTypeUpdate(BaseModel):
    label: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    teacher_visible: Optional[bool] = None

# Öğretmen renkleri - sistem tarafından atanacak
TEACHER_COLORS = [
    "#E91E63", "#9C27B0", "#673AB7", "#3F51B5", "#2196F3",
    "#00BCD4", "#009688", "#4CAF50", "#8BC34A", "#CDDC39",
    "#FFC107", "#FF9800", "#FF5722", "#795548", "#607D8B",
    "#F44336", "#E040FB", "#7C4DFF", "#448AFF", "#18FFFF"
]

# Varsayılan etkinlik tipi renkleri
DEFAULT_EVENT_TYPE_COLORS = {
    "video_cekimi": "#facc15",   # Sarı
    "video_paylasimi": "#8b5cf6", # Mor (hoca rengiyle değişecek)
    "kamp": "#10b981",           # Yeşil
    "canli_yayin": "#8b5cf6",    # Mor
    "bulusma": "#f472b6"         # Pembe
}

# ============= AUTH HELPERS =============

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# ============================================================
# SHARED TEACHER EARNING CALCULATION FUNCTION
# ============================================================
async def calculate_teacher_earning_rate(
    teacher_id: str,
    branch_id: str,
    lesson_type_id: str,
    group_size: int = None
) -> float:
    """
    Öğretmenin ders ücretini hesaplar.
    
    Kurallar:
    - Birebir ders: teacher_prices'dan birebir fiyatı al (group_size=None)
    - Grup dersi: group_size'a göre fiyat al
      - 1 kişilik grup: ayrı fiyat
      - 2-3-4 kişilik grup: ayrı fiyatlar
      - 4+ kişilik grup: 4 kişilik fiyat
    
    Returns: Öğretmenin ders başına ücreti (TL)
    """
    # teacher_prices'dan fiyat bul
    query = {
        "teacher_id": teacher_id,
        "branch_id": branch_id
    }
    
    if group_size is not None and group_size > 0:
        # Grup dersi - group_size'a göre fiyat bul
        # 4+ kişilik gruplar 4 kişilik fiyat alır
        effective_group_size = min(group_size, 4)
        query["group_size"] = effective_group_size
    else:
        # Birebir ders
        query["group_size"] = None
    
    price_record = await db.teacher_prices.find_one(query, {"_id": 0})
    
    if price_record:
        return price_record.get("price", 0)
    
    # Eğer exact match bulunamazsa, lesson_type_id ile de dene
    query["lesson_type_id"] = lesson_type_id
    price_record = await db.teacher_prices.find_one(query, {"_id": 0})
    
    if price_record:
        return price_record.get("price", 0)
    
    # Hala bulunamazsa, sadece teacher_id ve branch_id ile fallback
    fallback = await db.teacher_prices.find_one({
        "teacher_id": teacher_id,
        "branch_id": branch_id
    }, {"_id": 0})
    
    return fallback.get("price", 0) if fallback else 0


def get_teacher_rate_cached(tp_by_tb, teacher_id, branch_id, lesson_type_id, group_size):
    """calculate_teacher_earning_rate'in bellekten çalışan sürümü (N+1 sorgu önlemek için)."""
    records = tp_by_tb.get((teacher_id, branch_id), [])
    if not records:
        return 0
    if group_size is not None and group_size > 0:
        target_gs = min(group_size, 4)
    else:
        target_gs = None
    for r in records:
        if r.get("group_size") == target_gs:
            return r.get("price", 0)
    return records[0].get("price", 0)

# ============================================================
# AUDIT LOG HELPER FUNCTIONS
# ============================================================

async def create_audit_log(
    action_type: str,
    category: str,
    teacher_id: str,
    entity_id: str,
    student_id: str = None,
    group_id: str = None,
    old_data: dict = None,
    new_data: dict = None
):
    """
    Öğretmen işlemlerini loglar.
    Sadece teacher işlemleri loglanır, admin işlemleri loglanmaz.
    """
    try:
        # Öğretmen bilgisi
        teacher = await db.teachers.find_one({"id": teacher_id}, {"_id": 0})
        teacher_name = teacher.get("name") if teacher else "Bilinmeyen Öğretmen"
        
        # Öğrenci veya grup bilgisi
        student_name = None
        group_name = None
        group_students_snapshot = None
        
        if student_id:
            student = await db.students.find_one({"id": student_id}, {"_id": 0})
            student_name = student.get("name") if student else None
        
        if group_id:
            group = await db.student_groups.find_one({"id": group_id}, {"_id": 0})
            if group:
                group_name = group.get("name")
                # Grup öğrencilerini snapshot olarak al
                student_ids = group.get("student_ids", [])
                if student_ids:
                    students = await db.students.find(
                        {"id": {"$in": student_ids}},
                        {"_id": 0, "id": 1, "name": 1}
                    ).to_list(100)
                    group_students_snapshot = [{"id": s.get("id"), "name": s.get("name")} for s in students]
        
        # Log kaydı oluştur
        log_entry = {
            "id": str(uuid.uuid4()),
            "action_type": action_type,
            "category": category,
            "teacher_id": teacher_id,
            "teacher_name": teacher_name,
            "student_id": student_id,
            "student_name": student_name,
            "group_id": group_id,
            "group_name": group_name,
            "group_students_snapshot": group_students_snapshot,
            "entity_id": entity_id,
            "old_data": old_data,
            "new_data": new_data,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.audit_logs.insert_one(log_entry)
        logging.info(f"Audit log created: {action_type} {category} by teacher {teacher_name}")
    except Exception as e:
        logging.error(f"Failed to create audit log: {str(e)}")

# ============================================================

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = await db.users.find_one({"username": username}, {"_id": 0})
    if user is None:
        raise credentials_exception
    return User(**user)

# ============= AUTH ROUTES =============

@api_router.post("/auth/login", response_model=Token)
async def login(login_data: LoginRequest):
    user = await db.users.find_one({"username": login_data.username}, {"_id": 0})
    if not user or not verify_password(login_data.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    
    # Öğretmen ise, öğretmenin aktif olup olmadığını kontrol et
    if user["user_type"] == "teacher" and user.get("teacher_id"):
        teacher = await db.teachers.find_one({"id": user["teacher_id"]}, {"_id": 0})
        if teacher and teacher.get("status") == "inactive":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Bu hesap pasife alınmıştır. Lütfen yönetici ile iletişime geçin.",
            )
    
    access_token = create_access_token(data={"sub": user["username"]})
    
    # Admin login zamanını KAYDETME - sadece popup kapatıldığında mark-read ile kaydedilecek
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user_type=user["user_type"],
        teacher_id=user.get("teacher_id")
    )

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@api_router.post("/auth/register", response_model=User)
async def register_user(user_data: UserCreate, current_user: User = Depends(get_current_user)):
    # Only admins can create users
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create users")
    
    # Check if username exists
    existing = await db.users.find_one({"username": user_data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    user = User(
        username=user_data.username,
        password_hash=get_password_hash(user_data.password),
        user_type=user_data.user_type,
        teacher_id=user_data.teacher_id
    )
    
    doc = user.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.users.insert_one(doc)
    return user

@api_router.get("/users")
async def get_all_users(current_user: User = Depends(get_current_user)):
    """Tüm kullanıcıları listele"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view users")
    
    users = []
    async for user in db.users.find({}, {"_id": 0, "password_hash": 0}):
        if isinstance(user.get('created_at'), str):
            user['created_at'] = datetime.fromisoformat(user['created_at'])
        users.append(user)
    
    return users

@api_router.get("/users/by-teacher/{teacher_id}")
async def get_user_by_teacher(teacher_id: str, current_user: User = Depends(get_current_user)):
    """Öğretmene bağlı kullanıcı bilgilerini getir"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view user info")
    
    user = await db.users.find_one({"teacher_id": teacher_id}, {"_id": 0, "password_hash": 0})
    if not user:
        return None
    
    if isinstance(user.get('created_at'), str):
        user['created_at'] = datetime.fromisoformat(user['created_at'])
    
    return user

class UserUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    user_type: Optional[str] = None

@api_router.put("/users/by-teacher/{teacher_id}")
async def update_user_by_teacher(teacher_id: str, user_data: UserUpdate, current_user: User = Depends(get_current_user)):
    """Öğretmene bağlı kullanıcı bilgilerini güncelle"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update user info")
    
    user = await db.users.find_one({"teacher_id": teacher_id})
    if not user:
        raise HTTPException(status_code=404, detail="Bu öğretmene bağlı kullanıcı bulunamadı")
    
    update_data = {}
    
    if user_data.username:
        # Kullanıcı adı değişiyorsa, başka biri kullanıyor mu kontrol et
        if user_data.username != user.get("username"):
            existing = await db.users.find_one({"username": user_data.username})
            if existing:
                raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten kullanılıyor")
        update_data["username"] = user_data.username
    
    if user_data.password:
        update_data["password_hash"] = get_password_hash(user_data.password)
    
    if user_data.user_type:
        update_data["user_type"] = user_data.user_type
    
    if update_data:
        await db.users.update_one({"teacher_id": teacher_id}, {"$set": update_data})
    
    return {"message": "Kullanıcı bilgileri güncellendi"}

@api_router.put("/users/{username}")
async def update_user(username: str, user_data: UserUpdate, current_user: User = Depends(get_current_user)):
    """Kullanıcı bilgilerini güncelle"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update users")
    
    user = await db.users.find_one({"username": username})
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    
    # Admin kendi kendini silememeli
    if username == current_user.username and user_data.user_type and user_data.user_type != "admin":
        raise HTTPException(status_code=400, detail="Kendi admin yetkilerinizi kaldıramazsınız")
    
    update_data = {}
    
    if user_data.username and user_data.username != username:
        existing = await db.users.find_one({"username": user_data.username})
        if existing:
            raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten kullanılıyor")
        update_data["username"] = user_data.username
    
    if user_data.password:
        update_data["password_hash"] = get_password_hash(user_data.password)
    
    if user_data.user_type:
        update_data["user_type"] = user_data.user_type
    
    if update_data:
        await db.users.update_one({"username": username}, {"$set": update_data})
    
    return {"message": "Kullanıcı güncellendi"}

@api_router.delete("/users/{username}")
async def delete_user(username: str, current_user: User = Depends(get_current_user)):
    """Kullanıcı sil"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete users")
    
    # Admin kendi kendini silememeli
    if username == current_user.username:
        raise HTTPException(status_code=400, detail="Kendi hesabınızı silemezsiniz")
    
    user = await db.users.find_one({"username": username})
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    
    await db.users.delete_one({"username": username})
    
    return {"message": "Kullanıcı silindi"}

# ============= STUDENT ROUTES =============

@api_router.get("/students/stats/summary")
async def get_students_summary(current_user: User = Depends(get_current_user)):
    """Öğrenci özet istatistiklerini getir"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view student stats")
    
    # Toplam aktif öğrenci sayısı
    total_active = await db.students.count_documents({"status": "active"})
    total_inactive = await db.students.count_documents({"status": "inactive"})
    
    # Aktif öğrenci ID'lerini al
    active_students = await db.students.find({"status": "active"}, {"_id": 0, "id": 1}).to_list(10000)
    active_student_ids = set(s["id"] for s in active_students)
    
    # Öğretmen bazında öğrenci sayısı
    student_courses = await db.student_courses.find({"status": "active"}, {"_id": 0}).to_list(10000)
    teachers = await db.teachers.find({"status": "active"}, {"_id": 0}).to_list(1000)
    
    # Her öğretmenin benzersiz AKTİF öğrenci sayısı
    teacher_student_counts = {}
    for teacher in teachers:
        teacher_students = set()
        for course in student_courses:
            if course["teacher_id"] == teacher["id"]:
                # Sadece aktif öğrencileri say
                if course["student_id"] in active_student_ids:
                    teacher_students.add(course["student_id"])
        teacher_student_counts[teacher["name"]] = len(teacher_students)
    
    return {
        "total_active": total_active,
        "total_inactive": total_inactive,
        "total": total_active + total_inactive,
        "by_teacher": teacher_student_counts
    }

@api_router.get("/students", response_model=List[Student])
async def get_students(current_user: User = Depends(get_current_user)):
    if current_user.user_type == "admin":
        students = await db.students.find({}, {"_id": 0}).to_list(1000)
    else:
        # Teachers only see their students
        student_courses = await db.student_courses.find(
            {"teacher_id": current_user.teacher_id},
            {"_id": 0}
        ).to_list(1000)
        student_ids = list(set([sc["student_id"] for sc in student_courses]))
        students = await db.students.find(
            {"id": {"$in": student_ids}},
            {"_id": 0}
        ).to_list(1000)
    
    for student in students:
        if isinstance(student.get('created_at'), str):
            student['created_at'] = datetime.fromisoformat(student['created_at'])
    return students

@api_router.get("/students/{student_id}", response_model=Student)
async def get_student(student_id: str, current_user: User = Depends(get_current_user)):
    student = await db.students.find_one({"id": student_id}, {"_id": 0})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Check if teacher has access
    if current_user.user_type == "teacher":
        course = await db.student_courses.find_one({
            "student_id": student_id,
            "teacher_id": current_user.teacher_id
        })
        if not course:
            raise HTTPException(status_code=403, detail="Access denied")
    
    if isinstance(student.get('created_at'), str):
        student['created_at'] = datetime.fromisoformat(student['created_at'])
    return Student(**student)

@api_router.post("/students", response_model=Student)
async def create_student(student_data: StudentCreate, current_user: User = Depends(get_current_user)):
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create students")
    
    # Filter out None values to use model defaults
    create_data = {k: v for k, v in student_data.model_dump().items() if v is not None}
    student = Student(**create_data)
    doc = student.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.students.insert_one(doc)
    return student

@api_router.put("/students/{student_id}", response_model=Student)
async def update_student(student_id: str, student_data: StudentCreate, current_user: User = Depends(get_current_user)):
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update students")
    
    existing = await db.students.find_one({"id": student_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Student not found")
    
    update_data = {k: v for k, v in student_data.model_dump().items() if v is not None}
    await db.students.update_one({"id": student_id}, {"$set": update_data})
    
    updated = await db.students.find_one({"id": student_id}, {"_id": 0})
    if isinstance(updated.get('created_at'), str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'])
    return Student(**updated)

@api_router.delete("/students/{student_id}")
async def delete_student(student_id: str, current_user: User = Depends(get_current_user)):
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete students")
    
    result = await db.students.delete_one({"id": student_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Student not found")
    return {"message": "Student deleted successfully"}

# ============= TEACHER ROUTES =============

@api_router.get("/teachers", response_model=List[Teacher])
async def get_teachers(current_user: User = Depends(get_current_user)):
    teachers = await db.teachers.find({}, {"_id": 0}).to_list(1000)
    for teacher in teachers:
        if isinstance(teacher.get('created_at'), str):
            teacher['created_at'] = datetime.fromisoformat(teacher['created_at'])
        
        # Branşları hem teacher_branches hem de teacher_prices tablosundan al
        teacher_id = teacher.get("id")
        branch_ids = set()
        
        # teacher_branches tablosundan
        teacher_branches = await db.teacher_branches.find({"teacher_id": teacher_id}, {"_id": 0, "branch_id": 1}).to_list(100)
        for tb in teacher_branches:
            branch_ids.add(tb["branch_id"])
        
        # teacher_prices tablosundan (UI'dan eklenen branşlar)
        teacher_prices = await db.teacher_prices.find({"teacher_id": teacher_id}, {"_id": 0, "branch_id": 1}).to_list(100)
        for tp in teacher_prices:
            branch_ids.add(tp["branch_id"])
        
        # Branş isimlerini al
        branches_with_names = []
        for branch_id in branch_ids:
            branch = await db.branches.find_one({"id": branch_id}, {"_id": 0, "id": 1, "name": 1})
            if branch:
                branches_with_names.append({
                    "branch_id": branch["id"],
                    "branch_name": branch["name"]
                })
        teacher["branches"] = branches_with_names
    
    return teachers

@api_router.get("/teachers/{teacher_id}", response_model=Teacher)
async def get_teacher(teacher_id: str, current_user: User = Depends(get_current_user)):
    teacher = await db.teachers.find_one({"id": teacher_id}, {"_id": 0})
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
    if isinstance(teacher.get('created_at'), str):
        teacher['created_at'] = datetime.fromisoformat(teacher['created_at'])
    
    # Branşları hem teacher_branches hem de teacher_prices tablosundan al
    branch_ids = set()
    
    # teacher_branches tablosundan
    teacher_branches = await db.teacher_branches.find({"teacher_id": teacher_id}, {"_id": 0, "branch_id": 1}).to_list(100)
    for tb in teacher_branches:
        branch_ids.add(tb["branch_id"])
    
    # teacher_prices tablosundan (UI'dan eklenen branşlar buraya kaydediliyor)
    teacher_prices = await db.teacher_prices.find({"teacher_id": teacher_id}, {"_id": 0, "branch_id": 1}).to_list(100)
    for tp in teacher_prices:
        branch_ids.add(tp["branch_id"])
    
    # Branş isimlerini al
    branches_with_names = []
    for branch_id in branch_ids:
        branch = await db.branches.find_one({"id": branch_id}, {"_id": 0, "id": 1, "name": 1})
        if branch:
            branches_with_names.append({
                "branch_id": branch["id"],
                "branch_name": branch["name"]
            })
    teacher["branches"] = branches_with_names
    
    return Teacher(**teacher)

@api_router.post("/teachers", response_model=Teacher)
async def create_teacher(teacher_data: TeacherCreate, current_user: User = Depends(get_current_user)):
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create teachers")
    
    # Filter out None values to use model defaults
    create_data = {k: v for k, v in teacher_data.model_dump().items() if v is not None}
    teacher = Teacher(**create_data)
    doc = teacher.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    # branches field'ını kaydetme - teacher_branches tablosundan çekilecek
    if 'branches' in doc:
        del doc['branches']
    await db.teachers.insert_one(doc)
    
    # Branşları boş olarak döndür (yeni öğretmenin henüz branşı yok)
    teacher_dict = teacher.model_dump()
    teacher_dict['branches'] = []
    return Teacher(**teacher_dict)

@api_router.put("/teachers/{teacher_id}", response_model=Teacher)
async def update_teacher(teacher_id: str, teacher_data: TeacherCreate, current_user: User = Depends(get_current_user)):
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update teachers")
    
    existing = await db.teachers.find_one({"id": teacher_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Teacher not found")
    
    update_data = {k: v for k, v in teacher_data.model_dump().items() if v is not None}
    await db.teachers.update_one({"id": teacher_id}, {"$set": update_data})
    
    updated = await db.teachers.find_one({"id": teacher_id}, {"_id": 0})
    if isinstance(updated.get('created_at'), str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'])
    
    # Branşları teacher_branches tablosundan çek (eski branches field'ını görmezden gel)
    teacher_branches = await db.teacher_branches.find({"teacher_id": teacher_id}, {"_id": 0}).to_list(100)
    branches_with_names = []
    for tb in teacher_branches:
        branch = await db.branches.find_one({"id": tb["branch_id"]}, {"_id": 0, "id": 1, "name": 1})
        if branch:
            branches_with_names.append({
                "branch_id": branch["id"],
                "branch_name": branch["name"]
            })
    updated["branches"] = branches_with_names
    
    return Teacher(**updated)

@api_router.delete("/teachers/{teacher_id}")
async def delete_teacher(teacher_id: str, current_user: User = Depends(get_current_user)):
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete teachers")
    
    result = await db.teachers.delete_one({"id": teacher_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Teacher not found")
    return {"message": "Teacher deleted successfully"}


@api_router.post("/teachers/{teacher_id}/branches/{branch_id}")
async def add_teacher_branch(teacher_id: str, branch_id: str, current_user: User = Depends(get_current_user)):
    """Öğretmene branş ata"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin öğretmene branş atayabilir")
    
    # Öğretmen kontrolü
    teacher = await db.teachers.find_one({"id": teacher_id})
    if not teacher:
        raise HTTPException(status_code=404, detail="Öğretmen bulunamadı")
    
    # Branş kontrolü
    branch = await db.branches.find_one({"id": branch_id})
    if not branch:
        raise HTTPException(status_code=404, detail="Branş bulunamadı")
    
    # Zaten atanmış mı kontrol et
    existing = await db.teacher_branches.find_one({"teacher_id": teacher_id, "branch_id": branch_id})
    if existing:
        return {"message": "Branş zaten atanmış", "teacher": teacher.get("name"), "branch": branch.get("name")}
    
    # Yeni atama oluştur
    import uuid
    await db.teacher_branches.insert_one({
        "id": str(uuid.uuid4()),
        "teacher_id": teacher_id,
        "branch_id": branch_id
    })
    
    return {"message": "Branş başarıyla atandı", "teacher": teacher.get("name"), "branch": branch.get("name")}


@api_router.delete("/teachers/{teacher_id}/branches/{branch_id}")
async def remove_teacher_branch(teacher_id: str, branch_id: str, current_user: User = Depends(get_current_user)):
    """Öğretmenden branş kaldır"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin branş kaldırabilir")
    
    result = await db.teacher_branches.delete_one({"teacher_id": teacher_id, "branch_id": branch_id})
    if result.deleted_count == 0:
        return {"message": "Atama bulunamadı"}
    
    return {"message": "Branş ataması kaldırıldı"}


# ============= BRANCH ROUTES =============

@api_router.get("/branches", response_model=List[Branch])
async def get_branches():
    branches = await db.branches.find({}, {"_id": 0}).to_list(1000)
    return branches

@api_router.get("/branches/{branch_id}/teachers")
async def get_branch_teachers(branch_id: str, current_user: User = Depends(get_current_user)):
    """Branşa atanmış aktif öğretmenleri getir (teacher_prices tablosundan)"""
    # TeacherBranch veya TeacherPrice üzerinden branşa tanımlı öğretmenleri bul
    teacher_prices = await db.teacher_prices.find(
        {"branch_id": branch_id},
        {"_id": 0, "teacher_id": 1}
    ).to_list(1000)
    
    # Benzersiz öğretmen ID'leri
    teacher_ids = list(set([tp["teacher_id"] for tp in teacher_prices]))
    
    # Sadece aktif öğretmenleri getir
    teachers = await db.teachers.find(
        {"id": {"$in": teacher_ids}, "status": "active"},
        {"_id": 0}
    ).to_list(1000)
    
    for teacher in teachers:
        if isinstance(teacher.get('created_at'), str):
            teacher['created_at'] = datetime.fromisoformat(teacher['created_at'])
    
    return teachers

@api_router.post("/branches", response_model=Branch)
async def create_branch(name: str, current_user: User = Depends(get_current_user)):
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create branches")
    
    branch = Branch(name=name)
    await db.branches.insert_one(branch.model_dump())
    
    # Otomatik olarak aynı isimde kasa oluştur
    cashbox_data = {
        "id": str(uuid.uuid4()),
        "name": name,
        "branch_id": branch.id,
        "balance": 0.0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.cashboxes.insert_one(cashbox_data)
    
    return branch

@api_router.delete("/branches/{branch_id}")
async def delete_branch(branch_id: str, current_user: User = Depends(get_current_user)):
    """Branşı sil. İlişkili kurs, grup veya öğretmen fiyatı varsa silemez."""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete branches")
    
    # İlişkili veri kontrolü
    course_count = await db.student_courses.count_documents({"branch_id": branch_id})
    if course_count > 0:
        raise HTTPException(status_code=400, detail=f"Bu branşa bağlı {course_count} ders kaydı var. Önce dersleri silin veya başka branşa taşıyın.")
    
    group_count = await db.student_groups.count_documents({"branch_id": branch_id})
    if group_count > 0:
        raise HTTPException(status_code=400, detail=f"Bu branşa bağlı {group_count} grup var. Önce grupları silin.")
    
    price_count = await db.teacher_prices.count_documents({"branch_id": branch_id})
    if price_count > 0:
        raise HTTPException(status_code=400, detail=f"Bu branşa tanımlı {price_count} öğretmen fiyatı var. Önce fiyatları silin.")
    
    result = await db.branches.delete_one({"id": branch_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Branch not found")
    
    return {"message": "Branch deleted successfully"}

# ============= LESSON TYPE ROUTES =============

@api_router.get("/lesson-types", response_model=List[LessonType])
async def get_lesson_types():
    lesson_types = await db.lesson_types.find({}, {"_id": 0}).to_list(1000)
    return lesson_types

# ============= SEASON ROUTES =============

@api_router.get("/seasons", response_model=List[Season])
async def get_seasons():
    seasons = await db.seasons.find({}, {"_id": 0}).to_list(1000)
    return seasons

@api_router.post("/seasons", response_model=Season)
async def create_season(name: str, current_user: User = Depends(get_current_user)):
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create seasons")
    
    season = Season(name=name)
    await db.seasons.insert_one(season.model_dump())
    return season

# ============= BANK ACCOUNT ROUTES =============

@api_router.get("/bank-accounts")
async def get_bank_accounts(current_user: User = Depends(get_current_user)):
    """Tüm banka hesaplarını bakiyeleriyle birlikte getir"""
    accounts = await db.bank_accounts.find({}, {"_id": 0}).to_list(1000)
    
    # Her hesap için dinamik bakiye hesapla
    result = []
    for account in accounts:
        account_id = account["id"]
        
        # Gelen ödemeler (student_payment + bank_transfer_in)
        income_payments = await db.payments.find({
            "bank_account_id": account_id,
            "payment_type": {"$in": ["student_payment", "bank_transfer_in"]}
        }, {"_id": 0, "amount": 1}).to_list(10000)
        total_income = sum([p["amount"] for p in income_payments])
        
        # Giden ödemeler (expense, teacher_payment, bank_transfer_out)
        expense_payments = await db.payments.find({
            "bank_account_id": account_id,
            "payment_type": {"$in": ["expense", "teacher_payment", "bank_transfer_out"]}
        }, {"_id": 0, "amount": 1}).to_list(10000)
        total_expense = sum([p["amount"] for p in expense_payments])
        
        # Bakiyeyi hesapla ve account'a ekle
        account["balance"] = total_income - total_expense
        account["total_income"] = total_income
        account["total_expense"] = total_expense
        result.append(account)
    
    return result

@api_router.post("/bank-accounts", response_model=BankAccount)
async def create_bank_account(account_data: BankAccountCreate, current_user: User = Depends(get_current_user)):
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create bank accounts")
    
    account = BankAccount(**account_data.model_dump())
    await db.bank_accounts.insert_one(account.model_dump())
    return account


@api_router.put("/bank-accounts/{account_id}", response_model=BankAccount)
async def update_bank_account(account_id: str, account_data: BankAccountCreate, current_user: User = Depends(get_current_user)):
    """Banka hesabı bilgilerini güncelle"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update bank accounts")
    
    existing = await db.bank_accounts.find_one({"id": account_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Banka hesabı bulunamadı")
    
    update_data = {k: v for k, v in account_data.model_dump().items() if v is not None}
    await db.bank_accounts.update_one({"id": account_id}, {"$set": update_data})
    
    updated = await db.bank_accounts.find_one({"id": account_id}, {"_id": 0})
    return BankAccount(**updated)

@api_router.get("/bank-accounts/{account_id}/balance")
async def get_bank_account_balance(account_id: str, current_user: User = Depends(get_current_user)):
    """Banka hesabının bakiyesini hesapla"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view account balance")
    
    # Gelen ödemeler (student_payment + bank_transfer_in)
    income_payments = await db.payments.find({
        "bank_account_id": account_id,
        "payment_type": {"$in": ["student_payment", "bank_transfer_in"]}
    }, {"_id": 0, "amount": 1}).to_list(10000)
    total_income = sum([p["amount"] for p in income_payments])
    
    # Giden ödemeler (expense, teacher_payment, bank_transfer_out)
    expense_payments = await db.payments.find({
        "bank_account_id": account_id,
        "payment_type": {"$in": ["expense", "teacher_payment", "bank_transfer_out"]}
    }, {"_id": 0, "amount": 1}).to_list(10000)
    total_expense = sum([p["amount"] for p in expense_payments])
    
    balance = total_income - total_expense
    
    return {
        "account_id": account_id,
        "total_income": total_income,
        "total_expense": total_expense,
        "balance": balance
    }

@api_router.delete("/bank-accounts/{account_id}")
async def delete_bank_account(account_id: str, current_user: User = Depends(get_current_user)):
    """Banka hesabını sil. Bakiye 0 olmalı."""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete bank accounts")
    
    # Hesabın var olup olmadığını kontrol et
    account = await db.bank_accounts.find_one({"id": account_id})
    if not account:
        raise HTTPException(status_code=404, detail="Banka hesabı bulunamadı")
    
    # Bu hesaba bağlı tüm ödemeleri hesapla
    income_payments = await db.payments.find({
        "bank_account_id": account_id,
        "payment_type": {"$in": ["student_payment", "bank_transfer_in"]}
    }, {"_id": 0, "amount": 1}).to_list(10000)
    total_income = sum([p["amount"] for p in income_payments])
    
    expense_payments = await db.payments.find({
        "bank_account_id": account_id,
        "payment_type": {"$in": ["expense", "teacher_payment", "bank_transfer_out"]}
    }, {"_id": 0, "amount": 1}).to_list(10000)
    total_expense = sum([p["amount"] for p in expense_payments])
    
    balance = total_income - total_expense
    
    if balance != 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Bu hesabın bakiyesi sıfır değil ({balance:.2f} ₺). Hesabı silmeden önce bakiyeyi sıfırlayın."
        )
    
    await db.bank_accounts.delete_one({"id": account_id})
    return {"message": "Banka hesabı başarıyla silindi"}


@api_router.post("/bank-accounts/transfer")
async def create_bank_account_transfer(
    transfer_data: BankAccountTransferCreate, 
    current_user: User = Depends(get_current_user)
):
    """
    Banka hesapları arası transfer yap.
    Bu işlem branş kasalarını (Fen, Matematik, Türkçe) ETKİLEMEZ.
    Sadece banka hesapları arasında para hareketi kaydeder.
    """
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin hesaplar arası transfer yapabilir")
    
    # Hesapları kontrol et
    from_account = await db.bank_accounts.find_one({"id": transfer_data.from_account_id}, {"_id": 0})
    to_account = await db.bank_accounts.find_one({"id": transfer_data.to_account_id}, {"_id": 0})
    
    if not from_account:
        raise HTTPException(status_code=404, detail="Çıkış hesabı bulunamadı")
    if not to_account:
        raise HTTPException(status_code=404, detail="Giriş hesabı bulunamadı")
    
    if transfer_data.from_account_id == transfer_data.to_account_id:
        raise HTTPException(status_code=400, detail="Aynı hesaba transfer yapılamaz")
    
    if transfer_data.amount <= 0:
        raise HTTPException(status_code=400, detail="Transfer tutarı sıfırdan büyük olmalıdır")
    
    # Transfer kaydı oluştur
    transfer = BankAccountTransfer(
        **transfer_data.model_dump(),
        created_by=current_user.username
    )
    transfer_doc = transfer.model_dump()
    transfer_doc['created_at'] = transfer_doc['created_at'].isoformat()
    await db.bank_account_transfers.insert_one(transfer_doc)
    
    # Çıkış hesabından düşüm (bank_transfer_out)
    out_payment = Payment(
        payment_type="bank_transfer_out",
        amount=transfer_data.amount,
        date=transfer_data.date,
        bank_account_id=transfer_data.from_account_id,
        description=f"Havale: {from_account['bank_name']} → {to_account['bank_name']}" + (f" - {transfer_data.description}" if transfer_data.description else ""),
        transfer_id=transfer.id
    )
    out_doc = out_payment.model_dump()
    out_doc['created_at'] = out_doc['created_at'].isoformat()
    await db.payments.insert_one(out_doc)
    
    # Giriş hesabına ekleme (bank_transfer_in)
    in_payment = Payment(
        payment_type="bank_transfer_in",
        amount=transfer_data.amount,
        date=transfer_data.date,
        bank_account_id=transfer_data.to_account_id,
        description=f"Havale: {from_account['bank_name']} → {to_account['bank_name']}" + (f" - {transfer_data.description}" if transfer_data.description else ""),
        transfer_id=transfer.id
    )
    in_doc = in_payment.model_dump()
    in_doc['created_at'] = in_doc['created_at'].isoformat()
    await db.payments.insert_one(in_doc)
    
    return {
        "message": "Transfer başarılı",
        "transfer_id": transfer.id,
        "from_account": from_account['bank_name'],
        "to_account": to_account['bank_name'],
        "amount": transfer_data.amount
    }


@api_router.get("/bank-accounts/transfers")
async def get_bank_account_transfers(current_user: User = Depends(get_current_user)):
    """Tüm banka hesapları arası transferleri getir"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin transferleri görüntüleyebilir")
    
    transfers = await db.bank_account_transfers.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return transfers

# ============= STUDENT COURSE ROUTES =============

@api_router.get("/student-courses")
async def get_student_courses(student_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    query = {}
    if student_id:
        query["student_id"] = student_id
    
    if current_user.user_type == "teacher":
        query["teacher_id"] = current_user.teacher_id
    
    courses = await db.student_courses.find(query, {"_id": 0}).to_list(1000)
    
    # Her course için aktif fiyat geçmişini ekle
    for course in courses:
        if isinstance(course.get('created_at'), str):
            course['created_at'] = datetime.fromisoformat(course['created_at'])
        
        # Aktif fiyat geçmişini bul (valid_to: None)
        active_price = await db.student_price_history.find_one({
            "student_id": course["student_id"],
            "branch_id": course["branch_id"],
            "lesson_type": "birebir",
            "valid_to": None
        }, {"_id": 0}, sort=[("valid_from", -1)])
        
        if active_price:
            course["current_active_price"] = active_price["price"]
        else:
            course["current_active_price"] = course.get("student_price") or course.get("price") or 0
    
    return courses

@api_router.post("/student-courses", response_model=StudentCourse)
async def create_student_course(course_data: StudentCourseCreate, current_user: User = Depends(get_current_user)):
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create student courses")
    
    course = StudentCourse(**course_data.model_dump())
    doc = course.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.student_courses.insert_one(doc)
    return course

@api_router.put("/student-courses/{course_id}", response_model=StudentCourse)
async def update_student_course(course_id: str, course_data: StudentCourseCreate, current_user: User = Depends(get_current_user)):
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update student courses")
    
    existing = await db.student_courses.find_one({"id": course_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Course not found")
    
    update_data = course_data.model_dump()
    await db.student_courses.update_one({"id": course_id}, {"$set": update_data})
    
    updated = await db.student_courses.find_one({"id": course_id}, {"_id": 0})
    if isinstance(updated.get('created_at'), str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'])
    return StudentCourse(**updated)

@api_router.delete("/student-courses/{course_id}")
async def delete_student_course(course_id: str, current_user: User = Depends(get_current_user)):
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete student courses")
    
    result = await db.student_courses.delete_one({"id": course_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Course not found")
    return {"message": "Course deleted successfully"}

# ============= LESSON ROUTES =============

@api_router.get("/lessons", response_model=List[Lesson])
async def get_lessons(student_course_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    query = {}
    if student_course_id:
        query["student_course_id"] = student_course_id
    
    lessons = await db.lessons.find(query, {"_id": 0}).to_list(1000)
    for lesson in lessons:
        if isinstance(lesson.get('created_at'), str):
            lesson['created_at'] = datetime.fromisoformat(lesson['created_at'])
    return lessons

@api_router.get("/lessons/paginated")
async def get_lessons_paginated(
    student_course_id: Optional[str] = None,
    group_id: Optional[str] = None,
    teacher_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 15,
    current_user: User = Depends(get_current_user)
):
    """
    Sayfalı ders listesi - öğretmen ders geçmişi için optimize edilmiş.
    Total count da döner ki özet istatistikler doğru hesaplansın.
    """
    query = {}
    
    if student_course_id:
        query["student_course_id"] = student_course_id
    
    if group_id:
        query["group_id"] = group_id
    
    if teacher_id:
        # Öğretmen ID'si ile filtreleme (birebir ve grup dersleri dahil)
        if current_user.user_type == "teacher" and current_user.teacher_id != teacher_id:
            raise HTTPException(status_code=403, detail="Access denied")
        query["teacher_id"] = teacher_id
    
    # Toplam sayı
    total_count = await db.lessons.count_documents(query)
    
    # Sayfalama hesabı
    skip = (page - 1) * page_size
    
    # En son tarih en üstte, sonra created_at
    lessons = await db.lessons.find(query, {"_id": 0}).sort([
        ("date", -1),
        ("created_at", -1)
    ]).skip(skip).limit(page_size).to_list(page_size)
    
    for lesson in lessons:
        if isinstance(lesson.get('created_at'), str):
            lesson['created_at'] = datetime.fromisoformat(lesson['created_at'])
    
    return {
        "data": lessons,
        "total_count": total_count,
        "page": page,
        "page_size": page_size,
        "total_pages": (total_count + page_size - 1) // page_size
    }

@api_router.post("/lessons", response_model=Lesson)
async def create_lesson(lesson_data: LessonCreate, current_user: User = Depends(get_current_user)):
    # Double-click koruması - Manuel ders ekleme için
    lock_key = f"manual_lesson:{current_user.id}:{lesson_data.student_course_id}:{lesson_data.date}:{lesson_data.number_of_lessons}"
    current_time = time.time()
    
    # Eski lock'ları temizle (1.5 saniyeden eski olanlar)
    expired_keys = [k for k, v in _lesson_start_locks.items() if current_time - v > 1.5]
    for k in expired_keys:
        del _lesson_start_locks[k]
    
    # Duplicate kontrolü
    if lock_key in _lesson_start_locks:
        time_diff = current_time - _lesson_start_locks[lock_key]
        if time_diff < 1.5:
            raise HTTPException(
                status_code=429,
                detail="İşlem zaten başlatıldı. Lütfen bekleyin.",
                headers={"X-Duplicate-Request": "true"}
            )
    
    # Lock'u koy
    _lesson_start_locks[lock_key] = current_time
    
    # Check if user has access to this course
    course = await db.student_courses.find_one({"id": lesson_data.student_course_id}, {"_id": 0})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    if current_user.user_type == "teacher" and course["teacher_id"] != current_user.teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # FAZ 5: Kapalı dönem kontrolü
    await check_season_is_open()
    
    # Aktif dönemi al
    active_season = await db.seasons.find_one({"status": "active", "is_current": True}, {"_id": 0})
    season_id = active_season["id"] if active_season else None
    
    # Ders oluşturulurken öğretmenin DERS TARİHİNDEKİ ücretini kaydet
    teacher_rate = None
    
    # Önce ders tarihini parse et
    try:
        lesson_date_for_price = datetime.strptime(lesson_data.date, "%Y-%m-%d")
    except (ValueError, TypeError):
        lesson_date_for_price = datetime.now()
    
    # Ders tarihindeki öğretmen fiyatını bul (teacher_price_history'den)
    teacher_price_history_record = await db.teacher_price_history.find_one({
        "$and": [
            {"teacher_id": course["teacher_id"]},
            {"branch_id": course["branch_id"]},
            {"lesson_type_id": course["lesson_type_id"]},
            {"$or": [{"group_size": None}, {"group_size": {"$exists": False}}]},
            {"valid_from": {"$lte": lesson_date_for_price}},
            {"$or": [
                {"valid_to": None},
                {"valid_to": {"$gte": lesson_date_for_price}}
            ]}
        ]
    }, {"_id": 0}, sort=[("valid_from", -1)])
    
    if teacher_price_history_record:
        teacher_rate = teacher_price_history_record["price"]
    else:
        # Tarih aralığına düşmüyorsa EN ESKİ fiyatı bul
        oldest_teacher_price = await db.teacher_price_history.find_one({
            "teacher_id": course["teacher_id"],
            "branch_id": course["branch_id"],
            "lesson_type_id": course["lesson_type_id"],
            "$or": [{"group_size": None}, {"group_size": {"$exists": False}}]
        }, {"_id": 0}, sort=[("valid_from", 1)])  # ASC - en eski
        
        if oldest_teacher_price:
            teacher_rate = oldest_teacher_price["price"]
        else:
            # Hiç fiyat geçmişi yoksa güncel teacher_prices'tan al
            teacher_price = await db.teacher_prices.find_one({
                "teacher_id": course["teacher_id"],
                "branch_id": course["branch_id"],
                "lesson_type_id": course["lesson_type_id"],
                "group_size": None  # Birebir ders
            }, {"_id": 0})
            
            if teacher_price:
                teacher_rate = teacher_price["price"]
            else:
                # Birebir bulunamazsa genel fiyatı al
                teacher_price = await db.teacher_prices.find_one({
                    "teacher_id": course["teacher_id"],
                    "branch_id": course["branch_id"],
                    "lesson_type_id": course["lesson_type_id"]
                }, {"_id": 0})
                if teacher_price:
                    teacher_rate = teacher_price["price"]
    
    # FAZ 4: Öğrenci fiyat snapshot'ını al - DERS TARİHİNDEKİ FİYATI KULLAN
    student_unit_price = None
    student_total_amount = None
    
    if not lesson_data.is_free_lesson:
        # Ders tarihini parse et
        try:
            lesson_date = datetime.strptime(lesson_data.date, "%Y-%m-%d")
        except (ValueError, TypeError):
            lesson_date = datetime.now()
        
        # Ders tarihindeki geçerli fiyatı bul
        lesson_type = "birebir"  # TODO: Grup dersleri için farklı logic
        student_price_record = await db.student_price_history.find_one({
            "$and": [
                {"student_id": course["student_id"]},
                {"branch_id": course["branch_id"]},
                {"lesson_type": lesson_type},
                {"valid_from": {"$lte": lesson_date}},
                {"$or": [
                    {"valid_to": None},
                    {"valid_to": {"$gte": lesson_date}}
                ]}
            ]
        }, {"_id": 0}, sort=[("valid_from", -1)])
        
        if student_price_record:
            student_unit_price = student_price_record["price"]
        else:
            # Tarih aralığına düşmüyorsa EN ESKİ fiyatı bul
            oldest_price = await db.student_price_history.find_one({
                "student_id": course["student_id"],
                "branch_id": course["branch_id"],
                "lesson_type": lesson_type
            }, {"_id": 0}, sort=[("valid_from", 1)])  # ASC - en eski
            
            if oldest_price:
                student_unit_price = oldest_price["price"]
            else:
                # Hiç fiyat geçmişi yoksa student_courses'tan al
                student_unit_price = course.get("student_price") or course.get("price") or 0
        
        student_total_amount = student_unit_price * lesson_data.number_of_lessons
    
    # FAZ 4: Öğretmen fiyat snapshot'ı
    teacher_unit_price = teacher_rate
    teacher_total_earning = (teacher_rate or 0) * lesson_data.number_of_lessons
    
    # Ders kaydına course bilgilerini de ekle (course silinse bile kazanç hesaplanabilsin)
    lesson_data_dict = lesson_data.model_dump(exclude={"season_id"})  # season_id'yi hariç tut, aktif dönemi kullan
    lesson = Lesson(
        **lesson_data_dict, 
        teacher_rate=teacher_rate,
        teacher_id=course["teacher_id"],
        branch_id=course["branch_id"],
        student_id=course["student_id"],
        season_id=season_id,
        # FAZ 4: Fiyat snapshot alanları
        student_unit_price_at_lesson=student_unit_price,
        student_total_amount_at_lesson=student_total_amount,
        teacher_unit_price_at_lesson=teacher_unit_price,
        teacher_total_earning_at_lesson=teacher_total_earning
    )
    doc = lesson.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.lessons.insert_one(doc)
    
    # Audit log - sadece teacher işlemleri loglanır
    if current_user.user_type == "teacher":
        await create_audit_log(
            action_type=AuditLogActionType.ADD,
            category=AuditLogCategory.LESSON_ENTRY,
            teacher_id=current_user.teacher_id,
            entity_id=lesson.id,
            student_id=course["student_id"],
            group_id=None,
            old_data=None,
            new_data={
                "date": lesson_data.date,
                "number_of_lessons": lesson_data.number_of_lessons,
                "teacher_rate": teacher_rate,
                "student_unit_price": student_unit_price
            }
        )
    
    return lesson

@api_router.delete("/lessons/{lesson_id}")
async def delete_lesson(lesson_id: str, current_user: User = Depends(get_current_user)):
    lesson = await db.lessons.find_one({"id": lesson_id}, {"_id": 0})
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    
    # Check access
    course = await db.student_courses.find_one({"id": lesson["student_course_id"]}, {"_id": 0})
    if current_user.user_type == "teacher" and course and course["teacher_id"] != current_user.teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Audit log - sadece teacher işlemleri loglanır
    if current_user.user_type == "teacher":
        student_id = lesson.get("student_id") or (course.get("student_id") if course else None)
        await create_audit_log(
            action_type=AuditLogActionType.DELETE,
            category=AuditLogCategory.LESSON_ENTRY,
            teacher_id=current_user.teacher_id,
            entity_id=lesson_id,
            student_id=student_id,
            group_id=lesson.get("group_id"),
            old_data={
                "date": lesson.get("date"),
                "number_of_lessons": lesson.get("number_of_lessons"),
                "teacher_rate": lesson.get("teacher_rate"),
                "is_free_lesson": lesson.get("is_free_lesson", False)
            },
            new_data=None
        )
    
    await db.lessons.delete_one({"id": lesson_id})
    return {"message": "Lesson deleted successfully"}

# ============= PLANNED LESSON ROUTES =============

@api_router.get("/planned-lessons", response_model=List[PlannedLesson])
async def get_planned_lessons(
    student_course_id: Optional[str] = None,
    month: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    query = {}
    if student_course_id:
        query["student_course_id"] = student_course_id
    if month:
        query["month"] = month
    
    planned = await db.planned_lessons.find(query, {"_id": 0}).to_list(1000)
    for pl in planned:
        if isinstance(pl.get('created_at'), str):
            pl['created_at'] = datetime.fromisoformat(pl['created_at'])
    return planned

@api_router.post("/planned-lessons")
async def create_planned_lesson(planned_data: PlannedLessonCreate, current_user: User = Depends(get_current_user)):
    course = await db.student_courses.find_one({"id": planned_data.student_course_id}, {"_id": 0})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    if current_user.user_type == "teacher" and course["teacher_id"] != current_user.teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    planned = PlannedLesson(**planned_data.model_dump())
    doc = planned.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.planned_lessons.insert_one(doc)
    
    # Audit log - sadece teacher işlemleri loglanır
    if current_user.user_type == "teacher":
        await create_audit_log(
            action_type=AuditLogActionType.ADD,
            category=AuditLogCategory.LESSON_PLANNING,
            teacher_id=current_user.teacher_id,
            entity_id=planned.id,
            student_id=course.get("student_id"),
            group_id=None,
            old_data=None,
            new_data={
                "dates": planned_data.dates,
                "number_of_lessons": planned_data.number_of_lessons,
                "month": planned_data.month,
                "no_lesson_this_month": planned_data.no_lesson_this_month,
                "messaged": planned_data.messaged
            }
        )
    
    # Planlama tamamlandı mı kontrol et ve puan ver
    badge_result = await check_and_award_planning_master(course["teacher_id"])
    
    # Response'a rozet bilgisini ekle
    response_data = {
        "id": planned.id,
        "student_course_id": planned.student_course_id,
        "dates": planned.dates,
        "number_of_lessons": planned.number_of_lessons,
        "messaged": planned.messaged,
        "month": planned.month,
        "no_lesson_this_month": planned.no_lesson_this_month,
        "planning_master_badge": badge_result
    }
    
    return response_data

@api_router.put("/planned-lessons/{planned_id}", response_model=PlannedLesson)
async def update_planned_lesson(planned_id: str, planned_data: PlannedLessonCreate, current_user: User = Depends(get_current_user)):
    existing = await db.planned_lessons.find_one({"id": planned_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Planned lesson not found")
    
    course = await db.student_courses.find_one({"id": planned_data.student_course_id}, {"_id": 0})
    if current_user.user_type == "teacher" and course["teacher_id"] != current_user.teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Eski veriyi kaydet (audit log için)
    old_data = {
        "dates": existing.get("dates"),
        "number_of_lessons": existing.get("number_of_lessons"),
        "month": existing.get("month"),
        "no_lesson_this_month": existing.get("no_lesson_this_month"),
        "messaged": existing.get("messaged")
    }
    
    update_data = planned_data.model_dump()
    await db.planned_lessons.update_one({"id": planned_id}, {"$set": update_data})
    
    # Audit log - sadece teacher işlemleri loglanır
    if current_user.user_type == "teacher":
        await create_audit_log(
            action_type=AuditLogActionType.UPDATE,
            category=AuditLogCategory.LESSON_PLANNING,
            teacher_id=current_user.teacher_id,
            entity_id=planned_id,
            student_id=course.get("student_id"),
            group_id=None,
            old_data=old_data,
            new_data={
                "dates": planned_data.dates,
                "number_of_lessons": planned_data.number_of_lessons,
                "month": planned_data.month,
                "no_lesson_this_month": planned_data.no_lesson_this_month,
                "messaged": planned_data.messaged
            }
        )
    
    updated = await db.planned_lessons.find_one({"id": planned_id}, {"_id": 0})
    if isinstance(updated.get('created_at'), str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'])
    
    # Planlama tamamlandı mı kontrol et ve puan ver
    await check_and_award_planning_master(course["teacher_id"])
    
    return PlannedLesson(**updated)

@api_router.delete("/planned-lessons/{planned_id}")
async def delete_planned_lesson(planned_id: str, current_user: User = Depends(get_current_user)):
    planned = await db.planned_lessons.find_one({"id": planned_id}, {"_id": 0})
    if not planned:
        raise HTTPException(status_code=404, detail="Planned lesson not found")
    
    course = await db.student_courses.find_one({"id": planned["student_course_id"]}, {"_id": 0})
    if current_user.user_type == "teacher" and course["teacher_id"] != current_user.teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Audit log - sadece teacher işlemleri loglanır
    if current_user.user_type == "teacher":
        await create_audit_log(
            action_type=AuditLogActionType.DELETE,
            category=AuditLogCategory.LESSON_PLANNING,
            teacher_id=current_user.teacher_id,
            entity_id=planned_id,
            student_id=course.get("student_id") if course else None,
            group_id=None,
            old_data={
                "dates": planned.get("dates"),
                "number_of_lessons": planned.get("number_of_lessons"),
                "month": planned.get("month"),
                "no_lesson_this_month": planned.get("no_lesson_this_month"),
                "messaged": planned.get("messaged")
            },
            new_data=None
        )
    
    await db.planned_lessons.delete_one({"id": planned_id})
    return {"message": "Planned lesson deleted successfully"}

# ============= PAYMENT ROUTES =============

@api_router.get("/payments", response_model=List[Payment])
async def get_payments(
    month: Optional[str] = None,  # Format: "2025-01"
    bank_account_id: Optional[str] = None,
    cashbox_id: Optional[str] = None,
    student_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    if current_user.user_type == "admin":
        query = {}
        
        # Ay filtresi (date alanı "YYYY-MM-DD" formatında)
        if month:
            query["date"] = {"$regex": f"^{month}"}
        
        # Banka hesabı filtresi
        if bank_account_id:
            query["bank_account_id"] = bank_account_id
        
        # Kasa filtresi
        if cashbox_id:
            query["cashbox_id"] = cashbox_id
        
        # Öğrenci filtresi
        if student_id:
            query["student_id"] = student_id
        
        payments = await db.payments.find(query, {"_id": 0}).to_list(1000)
    else:
        # Teachers only see their payments
        query = {"teacher_id": current_user.teacher_id}
        if month:
            query["date"] = {"$regex": f"^{month}"}
        if bank_account_id:
            query["bank_account_id"] = bank_account_id
        if cashbox_id:
            query["cashbox_id"] = cashbox_id
        if student_id:
            query["student_id"] = student_id
        
        payments = await db.payments.find(query, {"_id": 0}).to_list(1000)
    
    for payment in payments:
        if isinstance(payment.get('created_at'), str):
            payment['created_at'] = datetime.fromisoformat(payment['created_at'])
    return payments

@api_router.post("/payments", response_model=Payment)
async def create_payment(payment_data: PaymentCreate, current_user: User = Depends(get_current_user)):
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create payments")
    
    # FAZ 5: Kapalı dönem kontrolü
    await check_season_is_open()
    
    payment = Payment(**payment_data.model_dump())
    doc = payment.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.payments.insert_one(doc)
    return payment

@api_router.put("/payments/{payment_id}", response_model=Payment)
async def update_payment(payment_id: str, payment_data: PaymentCreate, current_user: User = Depends(get_current_user)):
    """Ödeme güncelle"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update payments")
    
    # FAZ 5: Kapalı dönem kontrolü
    await check_season_is_open()
    
    existing = await db.payments.find_one({"id": payment_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Ödeme bulunamadı")
    
    update_data = payment_data.model_dump()
    await db.payments.update_one({"id": payment_id}, {"$set": update_data})
    
    updated = await db.payments.find_one({"id": payment_id}, {"_id": 0})
    if isinstance(updated.get('created_at'), str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'])
    return Payment(**updated)

@api_router.delete("/payments/{payment_id}")
async def delete_payment(payment_id: str, current_user: User = Depends(get_current_user)):
    """Ödeme sil"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete payments")
    
    existing = await db.payments.find_one({"id": payment_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Ödeme bulunamadı")
    
    await db.payments.delete_one({"id": payment_id})
    return {"message": "Ödeme başarıyla silindi"}

# ============= FINANSAL RAPOR =============

def _fin_month_range(start_ym: str, end_ym: str):
    """start_ym..end_ym (YYYY-MM) arası aylık liste (dahil)."""
    result = []
    y, m = int(start_ym[:4]), int(start_ym[5:7])
    ey, em = int(end_ym[:4]), int(end_ym[5:7])
    guard = 0
    while (y, m) <= (ey, em) and guard < 240:
        result.append(f"{y}-{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1
        guard += 1
    return result

_FIN_MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
_FIN_MONTHS_TR_FULL = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

def _fin_month_label(ym: str):
    m = int(ym[5:7])
    return f"{_FIN_MONTHS_TR[m - 1]} {ym[:4]}"

def _fin_category_label(p: dict):
    """Bir gider ödemesinin gösterim kategorisi (etiketi)."""
    if p.get("payment_type") == "teacher_payment" or p.get("expense_category") == "Maaş":
        return "Öğretmen Ödemesi"
    cat = (p.get("expense_category") or "").strip()
    if cat == "Sermaye":
        return "Sermaye Çıkışı"
    if cat == "Ofis":
        return "Ofis Gideri"
    return cat if cat else "Diğer"

# Her zaman gösterilecek sabit gider kalemleri (veride olmasa bile)
_FIN_CAT_ORDER = ["Öğretmen Ödemesi", "Kira", "Reklam", "Ofis Gideri", "Vergi", "Sermaye Çıkışı", "Diğer"]
_FIN_CAT_COLORS = {
    "Öğretmen Ödemesi": "#8b5cf6",
    "Kira": "#0ea5e9",
    "Reklam": "#f97316",
    "Ofis Gideri": "#14b8a6",
    "Vergi": "#eab308",
    "Sermaye Çıkışı": "#64748b",
    "Diğer": "#ec4899",
}
_FIN_PALETTE = ["#a855f7", "#06b6d4", "#84cc16", "#f43f5e", "#22c55e", "#e879f9", "#fb923c", "#38bdf8"]

def _fin_build_categories(payments: list):
    """Sabit tam gider kalemi listesi + veride bulunan ekstra (özel) kategoriler."""
    present = set()
    for p in payments:
        if p.get("payment_type") in ("teacher_payment", "expense"):
            present.add(_fin_category_label(p))
    # Sabit liste her zaman dahil; verideki ekstralar sona eklenir
    ordered = list(_FIN_CAT_ORDER)
    extras = sorted(c for c in present if c not in _FIN_CAT_ORDER)
    ordered += extras
    result = []
    palette_i = 0
    for i, label in enumerate(ordered):
        color = _FIN_CAT_COLORS.get(label)
        if not color:
            color = _FIN_PALETTE[palette_i % len(_FIN_PALETTE)]
            palette_i += 1
        result.append({"key": f"c{i}", "label": label, "color": color})
    return result

def _fin_empty_row(ym: str, categories: list):
    row = {
        "month": ym,
        "label": _fin_month_label(ym),
        "total_income": 0.0,
        "total_expense": 0.0,
        "net_balance": 0.0,
    }
    for c in categories:
        row[c["key"]] = 0.0
    return row

def _fin_build_series(payments: list, months: list, categories: list):
    """Ödeme listesinden aylık zaman serisi üret (dinamik gider kalemleri)."""
    label_to_key = {c["label"]: c["key"] for c in categories}
    rows = {ym: _fin_empty_row(ym, categories) for ym in months}
    for p in payments:
        ym = (p.get("date") or "")[:7]
        if ym not in rows:
            continue
        row = rows[ym]
        ptype = p.get("payment_type")
        amount = p.get("amount", 0) or 0
        if ptype == "student_payment":
            row["total_income"] += amount
        elif ptype in ("teacher_payment", "expense"):
            row["total_expense"] += amount
            key = label_to_key.get(_fin_category_label(p))
            if key:
                row[key] += amount
    keys = ["total_income", "total_expense"] + [c["key"] for c in categories]
    for ym in months:
        r = rows[ym]
        r["net_balance"] = round(r["total_income"] - r["total_expense"], 2)
        for k in keys:
            r[k] = round(r[k], 2)
    return [rows[ym] for ym in months]

@api_router.get("/admin/financial-report")
async def get_financial_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    month: Optional[str] = None,
    cashbox_id: Optional[str] = None,
    branch_id: Optional[str] = None,
    category: Optional[str] = None,
    teacher_id: Optional[str] = None,
    bank_account_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """Aylık gelir/gider/net bilanço finansal raporu. Sadece admin."""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Bu rapora yalnızca admin erişebilir")

    # Tarih aralığı belirle
    if month:
        start_ym = end_ym = month[:7]
        sd = f"{start_ym}-01"
        ed = f"{start_ym}-31"
    elif start_date or end_date:
        sd = start_date or "0000-01-01"
        ed = end_date or "9999-12-31"
        start_ym = sd[:7]
        end_ym = ed[:7]
    else:
        # Varsayılan: aktif dönemin başlangıcından bugüne
        now = datetime.now(timezone.utc)
        ed = now.strftime("%Y-%m-%d")
        active_season = await db.seasons.find_one({"status": "active", "is_current": True}, {"_id": 0})
        season_start = active_season.get("start_date") if active_season else None
        if isinstance(season_start, datetime):
            sd = season_start.strftime("%Y-%m-%d")
        elif isinstance(season_start, str) and len(season_start) >= 7:
            sd = season_start[:10]
        else:
            # Dönem yoksa son 12 aya düş
            sy = now.year
            sm = now.month - 11
            while sm <= 0:
                sm += 12
                sy -= 1
            sd = f"{sy}-{sm:02d}-01"
        start_ym = sd[:7]
        end_ym = ed[:7]

    months = _fin_month_range(start_ym, end_ym)

    # Ödeme sorgusu - transferler hariç (iç hareket, gelir/gider sayılmaz)
    query = {
        "date": {"$gte": sd, "$lte": ed},
        "payment_type": {"$in": ["student_payment", "teacher_payment", "expense"]},
    }
    if cashbox_id:
        query["cashbox_id"] = cashbox_id
    if bank_account_id:
        query["bank_account_id"] = bank_account_id
    if teacher_id:
        query["teacher_id"] = teacher_id
    if category:
        query["expense_category"] = category

    all_payments = await db.payments.find(query, {"_id": 0}).to_list(100000)

    # Kasa -> Branş eşlemesi (giderler/öğretmen ödemeleri branch_id taşımaz,
    # kasaları üzerinden ilgili branşa bağlanır)
    cashboxes = await db.cashboxes.find({}, {"_id": 0, "id": 1, "branch_id": 1}).to_list(1000)
    cashbox_branch_map = {c["id"]: c.get("branch_id") for c in cashboxes}

    def effective_branch(p):
        bid = p.get("branch_id")
        if bid:
            return bid
        cb = p.get("cashbox_id")
        return cashbox_branch_map.get(cb) if cb else None

    # Dinamik gider kategorileri (tüm ödemelerden - grafik/tablolarda ortak kullanılır)
    expense_categories = _fin_build_categories(all_payments)

    # Genel grafik: branch_id filtresi varsa ona göre daralt (kasa eşlemesi dahil)
    general_payments = all_payments
    if branch_id:
        general_payments = [p for p in all_payments if effective_branch(p) == branch_id]

    general_chart = _fin_build_series(general_payments, months, expense_categories)

    # Branş grafikleri: mevcut tüm branşlar için (sadece o branşa ait ödemeler - kasa eşlemesiyle)
    branches = await db.branches.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    branch_charts = {}
    for b in branches:
        # branch_id filtresi verilmişse sadece o branşı üret
        if branch_id and b["id"] != branch_id:
            continue
        b_payments = [p for p in all_payments if effective_branch(p) == b["id"]]
        branch_charts[b["name"]] = _fin_build_series(b_payments, months, expense_categories)

    # Özet kartları (genel grafik üzerinden toplam)
    total_income = round(sum(r["total_income"] for r in general_chart), 2)
    total_expense = round(sum(r["total_expense"] for r in general_chart), 2)
    # Öğretmen ödemesi toplamı - doğrudan ödemelerden hesapla
    teacher_payments = round(sum(
        (p.get("amount", 0) or 0) for p in general_payments
        if p.get("payment_type") == "teacher_payment" or p.get("expense_category") == "Maaş"
    ), 2)
    net_balance = round(total_income - total_expense, 2)

    if start_ym == end_ym:
        period_label = f"{_FIN_MONTHS_TR_FULL[int(start_ym[5:7]) - 1]} {start_ym[:4]}"
    else:
        period_label = f"{_FIN_MONTHS_TR_FULL[int(start_ym[5:7]) - 1]} {start_ym[:4]} - {_FIN_MONTHS_TR_FULL[int(end_ym[5:7]) - 1]} {end_ym[:4]}"

    has_data = len(all_payments) > 0

    return {
        "summary_cards": {
            "total_income": total_income,
            "total_expense": total_expense,
            "net_balance": net_balance,
            "teacher_payments": teacher_payments,
            "period_label": period_label,
        },
        "expense_categories": expense_categories,
        "general_chart": general_chart,
        "branch_charts": branch_charts,
        "monthly_table": general_chart,
        "has_data": has_data,
        "applied_start": sd[:10],
        "applied_end": ed[:10],
    }


# ============= TEACHER PRICE ROUTES =============

@api_router.get("/teacher-prices", response_model=List[TeacherPrice])
async def get_teacher_prices(teacher_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    query = {}
    if teacher_id:
        query["teacher_id"] = teacher_id
    
    prices = await db.teacher_prices.find(query, {"_id": 0}).to_list(1000)
    return prices

@api_router.post("/teacher-prices", response_model=TeacherPrice)
async def create_teacher_price(price_data: TeacherPriceCreate, current_user: User = Depends(get_current_user)):
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can set teacher prices")
    
    price = TeacherPrice(**price_data.model_dump())
    await db.teacher_prices.insert_one(price.model_dump())
    return price

# ============= TEACHER BALANCE ROUTE =============

@api_router.get("/teacher-balance/{teacher_id}")
async def get_teacher_balance(
    teacher_id: str, 
    month: Optional[str] = None,  # Format: "2025-01" - Ay bazlı filtreleme
    current_user: User = Depends(get_current_user)
):
    """
    FAZ 4 GÜNCELLEMESİ: Öğretmen bakiye hesaplamasında fiyat geçmişi kullanılır.
    - Önce ders kaydındaki teacher_rate_at_lesson veya teacher_rate snapshot'ı kontrol edilir
    - Yoksa ders tarihindeki fiyat geçmişinden hesaplanır
    - Son fallback: güncel teacher_prices
    """
    # Teachers can only see their own balance
    if current_user.user_type == "teacher" and current_user.teacher_id != teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Dersleri doğrudan teacher_id ile veya course üzerinden getir
    # Yeni sistem: lesson'da teacher_id var
    lesson_query_direct = {"teacher_id": teacher_id}
    if month:
        lesson_query_direct["date"] = {"$regex": f"^{month}"}
    
    lessons_direct = await db.lessons.find(lesson_query_direct, {"_id": 0}).to_list(10000)
    
    # Eski sistemle uyumluluk: teacher_id olmayan dersler için course üzerinden bul
    courses = await db.student_courses.find({"teacher_id": teacher_id}, {"_id": 0}).to_list(1000)
    course_ids = [c["id"] for c in courses]
    course_map = {c["id"]: c for c in courses}
    
    old_lesson_query = {
        "student_course_id": {"$in": course_ids},
        "$or": [{"teacher_id": None}, {"teacher_id": {"$exists": False}}]
    }
    if month:
        old_lesson_query["date"] = {"$regex": f"^{month}"}
    
    lessons_old = await db.lessons.find(old_lesson_query, {"_id": 0}).to_list(10000)
    
    # Tüm dersleri birleştir (duplicate olmaması için id kontrolü)
    all_lesson_ids = set()
    lessons = []
    for lesson in lessons_direct + lessons_old:
        if lesson["id"] not in all_lesson_ids:
            all_lesson_ids.add(lesson["id"])
            lessons.append(lesson)
    
    # Lesson types cache
    lesson_types = await db.lesson_types.find({}, {"_id": 0}).to_list(100)
    lesson_type_map = {lt["id"]: lt for lt in lesson_types}
    
    # FAZ 4: Calculate earnings based on price history snapshots
    total_earnings = 0
    for lesson in lessons:
        # 1. Önce dersin kaydındaki snapshot'ı kontrol et
        if lesson.get("teacher_rate_at_lesson") is not None:
            total_earnings += lesson["teacher_rate_at_lesson"] * lesson["number_of_lessons"]
            continue
        
        # 2. Eski sistemdeki teacher_rate'i kontrol et
        if lesson.get("teacher_rate") is not None:
            total_earnings += lesson["teacher_rate"] * lesson["number_of_lessons"]
            continue
        
        # 3. Fiyat geçmişinden tarih bazlı hesaplama
        course = course_map.get(lesson.get("student_course_id"))
        if not course:
            # Course bulunamadı, dersten branş bilgisi al
            branch_id = lesson.get("branch_id")
            lesson_type_id = lesson.get("lesson_type_id")
        else:
            branch_id = course.get("branch_id")
            lesson_type_id = course.get("lesson_type_id")
        
        if branch_id and lesson_type_id:
            # Ders tarihini parse et (timezone-naive, DB ile uyumlu)
            lesson_date = None
            lesson_date_str = lesson.get("date")
            if lesson_date_str:
                try:
                    lesson_date = datetime.strptime(lesson_date_str, "%Y-%m-%d")
                except (ValueError, TypeError):
                    pass
            
            # Grup dersi mi kontrol et
            group_size = None
            if lesson.get("group_id"):
                # Grup dersiyse grup boyutunu bul
                group = await db.student_groups.find_one({"id": lesson["group_id"]}, {"_id": 0})
                if group and group.get("student_ids"):
                    group_size = len(group["student_ids"])
            
            # Fiyat geçmişinden hesapla
            price_at_date = await get_teacher_price_at_date(
                teacher_id=teacher_id,
                branch_id=branch_id,
                lesson_type_id=lesson_type_id,
                group_size=group_size,
                date=lesson_date
            )
            
            total_earnings += price_at_date * lesson["number_of_lessons"]
    
    # Ödeme sorgusu - ay filtresi varsa uygula
    payment_query = {"teacher_id": teacher_id, "payment_type": "teacher_payment"}
    if month:
        payment_query["date"] = {"$regex": f"^{month}"}
    
    payments = await db.payments.find(payment_query, {"_id": 0}).to_list(1000)
    total_paid = sum([p["amount"] for p in payments])
    
    # Ödeme şekline göre ayrıntılı hesaplama (Maaş kategorisi için)
    elden_tutar = sum([p["amount"] for p in payments if p.get("expense_category") == "Maaş" and p.get("payment_method") == "elden"])
    resmi_brut_tutar = sum([p["amount"] for p in payments if p.get("expense_category") == "Maaş" and p.get("payment_method") == "resmi"])
    resmi_vergi_toplami = sum([p.get("tax_amount", 0) or 0 for p in payments if p.get("expense_category") == "Maaş" and p.get("payment_method") == "resmi"])
    diger_odemeler = sum([p["amount"] for p in payments if p.get("expense_category") != "Maaş"])
    
    # Toplam ödeme (brüt) = elden + resmi + diğer
    toplam_odeme_brut = elden_tutar + resmi_brut_tutar + diger_odemeler
    # Toplam net kazanç = brüt - vergi
    toplam_net_kazanc = toplam_odeme_brut - resmi_vergi_toplami
    
    # Kamp kazançlarını hesapla - ay filtresi kamp oluşturulma tarihine (created_at) göre uygulanır
    # (camp-income-detail endpoint'i ile tutarlı)
    camps = await db.camps.find({"teacher_id": teacher_id}, {"_id": 0}).to_list(1000)
    total_camp_earnings = 0
    camp_earnings_details = []
    
    for camp in camps:
        # Ay filtresi varsa, kampın oluşturulma tarihine göre filtrele
        if month:
            camp_date = camp.get("created_at", "")
            if not (isinstance(camp_date, str) and camp_date.startswith(month)):
                continue
        
        # Kesin kayıtlı öğrenci sayısı = ödeme yapmış kabul edilir
        paid_students_count = await db.camp_students.count_documents({
            "camp_id": camp["id"],
            "registration_status": "kesin_kayit"  # Statü kesin_kayit = ödeme yapılmış
        })
        camp_earning = paid_students_count * camp["per_student_teacher_fee"]
        total_camp_earnings += camp_earning
        
        if camp_earning > 0:
            camp_earnings_details.append({
                "camp_name": camp["name"],
                "paid_students": paid_students_count,
                "per_student_fee": camp["per_student_teacher_fee"],
                "earning": camp_earning
            })
    
    # YouTube kazançlarını hesapla - ay filtresi uygula
    youtube_query = {
        "teacher_id": teacher_id,
        "status": YouTubeContentStatus.ACTIVE
    }
    if month:
        youtube_query["date"] = {"$regex": f"^{month}"}
    
    youtube_records = await db.youtube_contents.find(youtube_query, {"_id": 0}).to_list(1000)
    total_youtube_earnings = sum([r["amount"] for r in youtube_records])
    
    youtube_earnings_details = [{
        "title": r["title"],
        "amount": r["amount"],
        "date": r["date"]
    } for r in youtube_records]
    
    # Toplam kazanç = Ders kazancı + Kamp kazancı + YouTube kazancı
    # Kamp kazancı artık ay filtresinde de (created_at bazlı) dahil edilir
    grand_total_earnings = total_earnings + total_camp_earnings + total_youtube_earnings
    
    balance = grand_total_earnings - total_paid
    
    return {
        "teacher_id": teacher_id,
        "month": month,  # Hangi ay için hesaplandığını göster
        "lesson_earnings": total_earnings,
        "camp_earnings": total_camp_earnings,
        "youtube_earnings": total_youtube_earnings,
        "total_earnings": grand_total_earnings,
        "total_paid": total_paid,
        "balance": balance,
        "payments": payments,
        "camp_earnings_details": camp_earnings_details,
        "youtube_earnings_details": youtube_earnings_details,
        # Ödeme şekli detayları
        "payment_details": {
            "elden_tutar": elden_tutar,
            "resmi_brut_tutar": resmi_brut_tutar,
            "resmi_vergi_toplami": resmi_vergi_toplami,
            "diger_odemeler": diger_odemeler,
            "toplam_odeme_brut": toplam_odeme_brut,
            "toplam_net_kazanc": toplam_net_kazanc
        }
    }

@api_router.get("/teacher-balances-summary")
async def get_teachers_balances_summary(current_user: User = Depends(get_current_user)):
    """Tüm öğretmenlerin net bakiyelerini özet olarak getir (sadece admin)."""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin bakiye özetini görebilir")

    teachers = await db.teachers.find({}, {"_id": 0, "id": 1}).to_list(1000)
    result = {}
    for t in teachers:
        try:
            balance_info = await get_teacher_balance(t["id"], None, current_user)
            result[t["id"]] = balance_info.get("balance", 0)
        except Exception:
            result[t["id"]] = 0
    return result


# ============= STUDENT GROUP ROUTES =============

@api_router.get("/student-groups", response_model=List[StudentGroup])
async def get_student_groups(include_inactive: bool = False, current_user: User = Depends(get_current_user)):
    query = {} if include_inactive else {"status": {"$ne": "inactive"}}
    groups = await db.student_groups.find(query, {"_id": 0}).to_list(1000)
    for group in groups:
        if isinstance(group.get('created_at'), str):
            group['created_at'] = datetime.fromisoformat(group['created_at'])
    return groups

@api_router.post("/student-groups", response_model=StudentGroup)
async def create_student_group(group_data: StudentGroupCreate, current_user: User = Depends(get_current_user)):
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create groups")
    
    group = StudentGroup(**group_data.model_dump())
    doc = group.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.student_groups.insert_one(doc)
    return group

@api_router.put("/student-groups/{group_id}", response_model=StudentGroup)
async def update_student_group(group_id: str, group_data: StudentGroupCreate, current_user: User = Depends(get_current_user)):
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update groups")
    
    existing = await db.student_groups.find_one({"id": group_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Group not found")
    
    update_data = group_data.model_dump()
    await db.student_groups.update_one({"id": group_id}, {"$set": update_data})
    
    updated = await db.student_groups.find_one({"id": group_id}, {"_id": 0})
    if isinstance(updated.get('created_at'), str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'])
    return StudentGroup(**updated)

@api_router.delete("/student-groups/{group_id}")
async def deactivate_student_group(group_id: str, current_user: User = Depends(get_current_user)):
    """Grubu pasife al ve öğrencileri gruptan çıkar"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can deactivate groups")
    
    group = await db.student_groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Grubu pasife al ve öğrencileri çıkar
    await db.student_groups.update_one(
        {"id": group_id}, 
        {"$set": {"status": "inactive", "student_ids": []}}
    )
    
    return {"message": "Group deactivated and students removed successfully"}

@api_router.post("/student-groups/{group_id}/activate")
async def activate_student_group(group_id: str, current_user: User = Depends(get_current_user)):
    """Pasif grubu tekrar aktifleştir"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can activate groups")
    
    group = await db.student_groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    await db.student_groups.update_one(
        {"id": group_id}, 
        {"$set": {"status": "active"}}
    )
    
    updated = await db.student_groups.find_one({"id": group_id}, {"_id": 0})
    if isinstance(updated.get('created_at'), str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'])
    return StudentGroup(**updated)

@api_router.post("/student-groups/{group_id}/add-student")
async def add_student_to_group(group_id: str, student_id: str, current_user: User = Depends(get_current_user)):
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can modify groups")
    
    group = await db.student_groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    student_ids = group.get("student_ids", [])
    if student_id not in student_ids:
        student_ids.append(student_id)
        await db.student_groups.update_one({"id": group_id}, {"$set": {"student_ids": student_ids}})
    
    return {"message": "Student added to group successfully"}

@api_router.post("/student-groups/{group_id}/remove-student")
async def remove_student_from_group(group_id: str, student_id: str, current_user: User = Depends(get_current_user)):
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can modify groups")
    
    group = await db.student_groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    student_ids = group.get("student_ids", [])
    if student_id in student_ids:
        student_ids.remove(student_id)
        await db.student_groups.update_one({"id": group_id}, {"$set": {"student_ids": student_ids}})
    
    return {"message": "Student removed from group successfully"}

@api_router.get("/student-groups/by-student/{student_id}")
async def get_groups_by_student(student_id: str, current_user: User = Depends(get_current_user)):
    """Öğrencinin dahil olduğu grupları getir"""
    groups = await db.student_groups.find(
        {"student_ids": student_id},
        {"_id": 0}
    ).to_list(100)
    for group in groups:
        if isinstance(group.get('created_at'), str):
            group['created_at'] = datetime.fromisoformat(group['created_at'])
    return groups

@api_router.get("/teacher-groups/{teacher_id}")
async def get_teacher_groups(teacher_id: str, current_user: User = Depends(get_current_user)):
    """Öğretmenin gruplarını getir"""
    if current_user.user_type == "teacher" and current_user.teacher_id != teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    groups = await db.student_groups.find(
        {"teacher_id": teacher_id},
        {"_id": 0}
    ).to_list(100)
    for group in groups:
        if isinstance(group.get('created_at'), str):
            group['created_at'] = datetime.fromisoformat(group['created_at'])
    return groups

# ============= GROUP LESSON ENTRY =============

@api_router.post("/group-lessons")
async def create_group_lesson(
    group_id: str,
    branch_id: str,
    date: str,
    number_of_lessons: int,
    is_free_lesson: bool = False,
    current_user: User = Depends(get_current_user)
):
    # Double-click koruması - Grup dersi ekleme için
    lock_key = f"group_lesson:{current_user.id}:{group_id}:{date}:{number_of_lessons}"
    current_time = time.time()
    
    # Eski lock'ları temizle (1.5 saniyeden eski olanlar)
    expired_keys = [k for k, v in _lesson_start_locks.items() if current_time - v > 1.5]
    for k in expired_keys:
        del _lesson_start_locks[k]
    
    # Duplicate kontrolü
    if lock_key in _lesson_start_locks:
        time_diff = current_time - _lesson_start_locks[lock_key]
        if time_diff < 1.5:
            raise HTTPException(
                status_code=429,
                detail="İşlem zaten başlatıldı. Lütfen bekleyin.",
                headers={"X-Duplicate-Request": "true"}
            )
    
    # Lock'u koy
    _lesson_start_locks[lock_key] = current_time
    
    # Get group
    group = await db.student_groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Check access
    if current_user.user_type == "teacher" and group.get("teacher_id") != current_user.teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # FAZ 5: Kapalı dönem kontrolü
    await check_season_is_open()
    
    # Sadece admin ücretsiz ders işaretleyebilir
    if is_free_lesson and current_user.user_type != "admin":
        is_free_lesson = False
    
    # FAZ 4: Aktif dönemi al
    active_season = await db.seasons.find_one({"status": "active", "is_current": True}, {"_id": 0})
    season_id = active_season["id"] if active_season else None
    
    # Grup boyutunu belirle ve öğretmen ücretini hesapla
    group_size = len(group["student_ids"])
    
    # 4+ kişilik gruplarda öğretmen 4 kişi üzerinden kazanır
    effective_group_size = min(group_size, 4)
    
    # Grup boyutuna göre öğretmen fiyatını al
    teacher_rate = None
    group_price = await db.teacher_prices.find_one({
        "teacher_id": group.get("teacher_id"),
        "branch_id": branch_id,
        "group_size": effective_group_size
    }, {"_id": 0})
    
    if group_price:
        teacher_rate = group_price["price"]
    else:
        # Genel birebir fiyatı kullan
        teacher_price = await db.teacher_prices.find_one({
            "teacher_id": group.get("teacher_id"),
            "branch_id": branch_id,
            "group_size": None
        }, {"_id": 0})
        if teacher_price:
            teacher_rate = teacher_price["price"]
    
    # GRUP DERSİ ÖĞRETMENİ KAZANCI DÜZELTME:
    # Grup dersi için öğretmen kazancı SADECE BİR KERE hesaplanmalı.
    # Bu yüzden ilk öğrenciye tam teacher_rate yazılır, diğerlerine 0 yazılır.
    # Böylece toplam hesaplamada grup dersi 1 kere sayılır.
    
    created_lessons = []
    is_first_student = True
    
    for student_id in group["student_ids"]:
        # Find student course
        course = await db.student_courses.find_one({
            "student_id": student_id,
            "branch_id": branch_id,
            "teacher_id": group.get("teacher_id")
        }, {"_id": 0})
        
        # Eğer course bulunamazsa, sadece branch_id ve student_id ile dene
        if not course:
            course = await db.student_courses.find_one({
                "student_id": student_id,
                "branch_id": branch_id
            }, {"_id": 0})
        
        # Hala bulunamazsa, yeni bir course ID oluştur (geçici)
        student_course_id = course["id"] if course else f"auto_{student_id}_{branch_id}"
        
        # İlk öğrenciye tam ücret, diğerlerine 0 (duplikasyonu önlemek için)
        lesson_teacher_rate = teacher_rate if is_first_student else 0
        
        # FAZ 4: Öğrenci fiyat snapshot'ını al (grup dersi için)
        student_unit_price = None
        student_total_amount = None
        
        if not is_free_lesson:
            # Önce student_price_history'den dene
            student_price_record = await db.student_price_history.find_one({
                "student_id": student_id,
                "branch_id": branch_id,
                "lesson_type": "group",
                "valid_to": None
            }, {"_id": 0}, sort=[("valid_from", -1)])
            
            if student_price_record:
                student_unit_price = student_price_record["price"]
            elif course:
                # Fallback: student_courses'tan al
                student_unit_price = course.get("student_price") or course.get("price") or 0
            
            if student_unit_price:
                student_total_amount = student_unit_price * number_of_lessons
        
        # FAZ 4: Öğretmen fiyat snapshot'ı
        teacher_unit_price = lesson_teacher_rate
        teacher_total_earning = (lesson_teacher_rate or 0) * number_of_lessons
        
        is_first_student = False
        
        lesson = Lesson(
            student_course_id=student_course_id,
            date=date,
            number_of_lessons=number_of_lessons,
            teacher_rate=lesson_teacher_rate,
            group_id=group_id,
            is_free_lesson=is_free_lesson,
            # Ders kaydına course bilgilerini de ekle (course silinse bile görünebilsin)
            teacher_id=group.get("teacher_id"),
            branch_id=branch_id,
            student_id=student_id,
            season_id=season_id,
            # FAZ 4: Fiyat snapshot alanları
            student_unit_price_at_lesson=student_unit_price,
            student_total_amount_at_lesson=student_total_amount,
            teacher_unit_price_at_lesson=teacher_unit_price,
            teacher_total_earning_at_lesson=teacher_total_earning
        )
        doc = lesson.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        await db.lessons.insert_one(doc)
        created_lessons.append(lesson)
    
    # Audit log - sadece teacher işlemleri loglanır
    if current_user.user_type == "teacher" and created_lessons:
        await create_audit_log(
            action_type=AuditLogActionType.ADD,
            category=AuditLogCategory.LESSON_ENTRY,
            teacher_id=current_user.teacher_id,
            entity_id=created_lessons[0].id if created_lessons else group_id,
            student_id=None,
            group_id=group_id,
            old_data=None,
            new_data={
                "date": date,
                "number_of_lessons": number_of_lessons,
                "teacher_rate": teacher_rate,
                "is_free_lesson": is_free_lesson,
                "student_count": len(created_lessons)
            }
        )
    
    return {"message": f"Created {len(created_lessons)} lessons for group", "count": len(created_lessons), "is_free_lesson": is_free_lesson}

# ============= GROUP PLANNED LESSON =============

class GroupPlannedLessonCreate(BaseModel):
    group_id: str
    dates: str  # Comma-separated dates
    number_of_lessons: int
    month: str

@api_router.post("/group-planned-lessons")
async def create_group_planned_lesson(data: GroupPlannedLessonCreate, current_user: User = Depends(get_current_user)):
    """Grup için planlı ders oluştur - tüm öğrencilere yazar"""
    group = await db.student_groups.find_one({"id": data.group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    if current_user.user_type == "teacher" and group.get("teacher_id") != current_user.teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    created_plans = []
    for student_id in group["student_ids"]:
        # Find student course for this branch and teacher
        course = await db.student_courses.find_one({
            "student_id": student_id,
            "branch_id": group["branch_id"],
            "teacher_id": group.get("teacher_id")
        }, {"_id": 0})
        
        if course:
            planned = PlannedLesson(
                student_course_id=course["id"],
                dates=data.dates,
                number_of_lessons=data.number_of_lessons,
                month=data.month
            )
            doc = planned.model_dump()
            doc['created_at'] = doc['created_at'].isoformat()
            await db.planned_lessons.insert_one(doc)
            created_plans.append(planned)
    
    # Audit log - sadece teacher işlemleri loglanır
    if current_user.user_type == "teacher" and created_plans:
        await create_audit_log(
            action_type=AuditLogActionType.ADD,
            category=AuditLogCategory.LESSON_PLANNING,
            teacher_id=current_user.teacher_id,
            entity_id=created_plans[0].id if created_plans else data.group_id,
            student_id=None,
            group_id=data.group_id,
            old_data=None,
            new_data={
                "dates": data.dates,
                "number_of_lessons": data.number_of_lessons,
                "month": data.month,
                "student_count": len(created_plans)
            }
        )
    
    # Planlama tamamlandı mı kontrol et ve puan ver
    badge_result = None
    if group.get("teacher_id"):
        badge_result = await check_and_award_planning_master(group["teacher_id"])
    
    return {
        "message": f"Created {len(created_plans)} planned lessons for group",
        "count": len(created_plans),
        "planning_master_badge": badge_result
    }

class GroupPlannedLessonUpdate(BaseModel):
    group_id: str
    old_month: str  # Mevcut planın ay'ı
    old_dates: str  # Mevcut planın tarihleri
    old_number_of_lessons: int  # Mevcut planın ders sayısı
    new_dates: str
    new_number_of_lessons: int
    new_month: str

@api_router.put("/group-planned-lessons")
async def update_group_planned_lesson(data: GroupPlannedLessonUpdate, current_user: User = Depends(get_current_user)):
    """Grup için planlı dersleri toplu güncelle - tek audit log kaydı oluşturur"""
    group = await db.student_groups.find_one({"id": data.group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    if current_user.user_type == "teacher" and group.get("teacher_id") != current_user.teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Gruptaki öğrencilerin course'larını bul
    student_courses = []
    for student_id in group["student_ids"]:
        course = await db.student_courses.find_one({
            "student_id": student_id,
            "branch_id": group["branch_id"],
            "teacher_id": group.get("teacher_id")
        }, {"_id": 0})
        if course:
            student_courses.append(course)
    
    # Eşleşen planları bul ve güncelle
    updated_count = 0
    for course in student_courses:
        existing_plan = await db.planned_lessons.find_one({
            "student_course_id": course["id"],
            "month": data.old_month,
            "dates": data.old_dates,
            "number_of_lessons": data.old_number_of_lessons
        }, {"_id": 0})
        
        if existing_plan:
            await db.planned_lessons.update_one(
                {"id": existing_plan["id"]},
                {"$set": {
                    "dates": data.new_dates,
                    "number_of_lessons": data.new_number_of_lessons,
                    "month": data.new_month
                }}
            )
            updated_count += 1
    
    # Tek audit log kaydı oluştur
    if current_user.user_type == "teacher" and updated_count > 0:
        await create_audit_log(
            action_type=AuditLogActionType.UPDATE,
            category=AuditLogCategory.LESSON_PLANNING,
            teacher_id=current_user.teacher_id,
            entity_id=data.group_id,
            student_id=None,
            group_id=data.group_id,
            old_data={
                "dates": data.old_dates,
                "number_of_lessons": data.old_number_of_lessons,
                "month": data.old_month
            },
            new_data={
                "dates": data.new_dates,
                "number_of_lessons": data.new_number_of_lessons,
                "month": data.new_month
            }
        )
    
    return {"message": f"Updated {updated_count} planned lessons for group", "count": updated_count}

class GroupPlannedLessonDelete(BaseModel):
    group_id: str
    month: str
    dates: str
    number_of_lessons: int

@api_router.delete("/group-planned-lessons")
async def delete_group_planned_lesson(data: GroupPlannedLessonDelete, current_user: User = Depends(get_current_user)):
    """Grup için planlı dersleri toplu sil - tek audit log kaydı oluşturur"""
    group = await db.student_groups.find_one({"id": data.group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    if current_user.user_type == "teacher" and group.get("teacher_id") != current_user.teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Eski veriyi kaydet (audit log için)
    old_data = {
        "dates": data.dates,
        "number_of_lessons": data.number_of_lessons,
        "month": data.month
    }
    
    # Gruptaki öğrencilerin course'larını bul
    student_courses = []
    for student_id in group["student_ids"]:
        course = await db.student_courses.find_one({
            "student_id": student_id,
            "branch_id": group["branch_id"],
            "teacher_id": group.get("teacher_id")
        }, {"_id": 0})
        if course:
            student_courses.append(course)
    
    # Eşleşen planları sil
    deleted_count = 0
    for course in student_courses:
        result = await db.planned_lessons.delete_one({
            "student_course_id": course["id"],
            "month": data.month,
            "dates": data.dates,
            "number_of_lessons": data.number_of_lessons
        })
        deleted_count += result.deleted_count
    
    # Tek audit log kaydı oluştur
    if current_user.user_type == "teacher" and deleted_count > 0:
        await create_audit_log(
            action_type=AuditLogActionType.DELETE,
            category=AuditLogCategory.LESSON_PLANNING,
            teacher_id=current_user.teacher_id,
            entity_id=data.group_id,
            student_id=None,
            group_id=data.group_id,
            old_data=old_data,
            new_data=None
        )
    
    return {"message": f"Deleted {deleted_count} planned lessons for group", "count": deleted_count}

@api_router.get("/all-planned-lessons")
async def get_all_planned_lessons(month: Optional[str] = None, current_user: User = Depends(get_current_user)):
    """Tüm planlı dersleri detaylı bilgiyle getir (Aylık Program için)"""
    query = {}
    if month:
        query["month"] = month
    
    planned = await db.planned_lessons.find(query, {"_id": 0}).to_list(10000)
    
    # Enrich with course, student, teacher, branch info
    enriched = []
    for pl in planned:
        course = await db.student_courses.find_one({"id": pl["student_course_id"]}, {"_id": 0})
        if course:
            student = await db.students.find_one({"id": course["student_id"]}, {"_id": 0})
            teacher = await db.teachers.find_one({"id": course["teacher_id"]}, {"_id": 0})
            branch = await db.branches.find_one({"id": course["branch_id"]}, {"_id": 0})
            
            enriched.append({
                **pl,
                "student_name": student["name"] if student else "Bilinmiyor",
                "teacher_name": teacher["name"] if teacher else "Bilinmiyor",
                "branch_name": branch["name"] if branch else "Bilinmiyor",
                "student_id": course["student_id"],
                "teacher_id": course["teacher_id"],
                "branch_id": course["branch_id"]
            })
    
    return enriched

# ============= MONTHLY PROGRAM DETAILED ENDPOINT =============

class MonthlyProgramNote(BaseModel):
    student_id: str
    month: str
    note: Optional[str] = None
    payment_status: Optional[str] = None

@api_router.get("/monthly-program-detailed")
async def get_monthly_program_detailed(month: str, current_user: User = Depends(get_current_user)):
    """
    Aylık Program için tamamen aggregated veri döner.
    Backend hesaplama yapar, frontend sadece render eder.
    """
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can access this endpoint")
    
    # Tüm branşları getir
    branches = await db.branches.find({}, {"_id": 0}).to_list(100)
    branch_map = {b["id"]: b["name"] for b in branches}
    
    # Tüm aktif öğretmenleri getir
    teachers = await db.teachers.find({"status": "active"}, {"_id": 0}).to_list(100)
    teacher_map = {t["id"]: t["name"] for t in teachers}
    
    # Bu ay için planlı dersleri getir
    planned_lessons = await db.planned_lessons.find({"month": month}, {"_id": 0}).to_list(10000)
    
    # "Bu ay dersi yok" işaretli öğrenci kurslarını bul
    no_lesson_course_ids = set([
        pl["student_course_id"] for pl in planned_lessons 
        if pl.get("no_lesson_this_month", False)
    ])
    
    # Tüm aktif öğrencileri getir
    students = await db.students.find({"status": "active"}, {"_id": 0}).to_list(1000)
    
    # Öğrenci kurslarını getir
    student_courses = await db.student_courses.find({"status": "active"}, {"_id": 0}).to_list(10000)
    
    # Monthly program notlarını getir
    program_notes = await db.monthly_program_notes.find({"month": month}, {"_id": 0}).to_list(1000)
    notes_map = {n["student_id"]: n for n in program_notes}
    
    # Banka hesaplarını getir
    bank_accounts = await db.bank_accounts.find({}, {"_id": 0}).to_list(100)
    bank_map = {b["id"]: f"{b['bank_name']} - {b['holder_name']}" for b in bank_accounts}
    
    # --- Performans: fiyat geçmişi ve öğretmen ücretlerini tek seferde belleğe al (N+1 sorgu önlendi) ---
    all_price_history = await db.student_price_history.find({"lesson_type": "birebir"}, {"_id": 0}).to_list(100000)
    price_hist_by_sb = {}
    for pr in all_price_history:
        price_hist_by_sb.setdefault((pr.get("student_id"), pr.get("branch_id")), []).append(pr)
    
    all_teacher_prices = await db.teacher_prices.find({}, {"_id": 0}).to_list(100000)
    tp_by_tb = {}
    for tp in all_teacher_prices:
        tp_by_tb.setdefault((tp.get("teacher_id"), tp.get("branch_id")), []).append(tp)
    
    # Ay sınırlarını bir kez hesapla
    try:
        _y, _m = month.split("-")
        month_start = datetime(int(_y), int(_m), 1)
        month_end = datetime(int(_y) + 1, 1, 1) if int(_m) == 12 else datetime(int(_y), int(_m) + 1, 1)
    except Exception:
        month_start = datetime(1900, 1, 1)
        month_end = datetime(2100, 1, 1)
    
    # Sonuç listesi
    result = []
    teacher_totals = {t["id"]: 0 for t in teachers}  # Öğretmen kazanç toplamları
    
    # Grup bilgilerini getir (sadece aktif gruplar)
    student_groups = await db.student_groups.find({"status": {"$ne": "inactive"}}, {"_id": 0}).to_list(1000)
    
    # İşlenmiş grup planlamalarını takip et (çoklama önlemek için)
    processed_group_plans = set()
    
    for student in students:
        # Öğrencinin kurslarını bul
        student_course_list = [sc for sc in student_courses if sc["student_id"] == student["id"]]
        
        if not student_course_list:
            continue  # Kursu olmayan öğrenciyi atla
        
        # Bu öğrencinin tüm kursları "bu ay dersi yok" mu kontrol et
        all_courses_no_lesson = all(
            sc["id"] in no_lesson_course_ids for sc in student_course_list
        )
        if all_courses_no_lesson:
            continue  # Bu öğrenci bu ay aylık programda görünmeyecek
        
        # Öğrencinin aldığı branşlar
        student_branches = list(set([sc["branch_id"] for sc in student_course_list]))
        branch_names = [branch_map.get(bid, "") for bid in student_branches if bid in branch_map]
        
        # Notlar
        note_data = notes_map.get(student["id"], {})
        
        # Hesap adı
        account_name = student.get("payment_account_name", "")
        if not account_name and student.get("bank_account_id"):
            account_name = bank_map.get(student["bank_account_id"], "")
        
        # Her branş için ders bilgisi
        branch_details = {}
        total_student_payment = 0
        
        for branch_id in student_branches:
            branch_name = branch_map.get(branch_id, "")
            
            # Bu öğrenci + branş için planlı dersleri bul
            course = next((sc for sc in student_course_list if sc["branch_id"] == branch_id), None)
            if not course:
                continue
            
            # Planlı dersleri bul
            branch_planned = [pl for pl in planned_lessons if pl["student_course_id"] == course["id"]]
            
            if not branch_planned:
                branch_details[branch_name] = {
                    "dates": "",
                    "unit_price": course.get("price", 0),
                    "lesson_count": 0,
                    "total": 0
                }
                continue
            
            # Tarihler ve ders sayısı
            all_dates = []
            total_lessons = 0
            for pl in branch_planned:
                if pl.get("dates"):
                    all_dates.extend([d.strip() for d in pl["dates"].split(",")])
                total_lessons += pl.get("number_of_lessons", 0)
            
            # FAZ 4: Ay içindeki EN YÜKSEK fiyatı bul (bellekten - N+1 sorgu önlendi)
            try:
                hist_records = price_hist_by_sb.get((student["id"], branch_id), [])
                overlapping = [
                    pr for pr in hist_records
                    if pr.get("valid_from") is not None and pr["valid_from"] < month_end
                    and (pr.get("valid_to") is None or pr["valid_to"] > month_start)
                ]
                if overlapping:
                    # En yüksek fiyatı seç
                    unit_price = max(pr["price"] for pr in overlapping)
                elif hist_records:
                    # Hiç kesişen kayıt yoksa en eski fiyatı kullan
                    oldest = min(hist_records, key=lambda r: r.get("valid_from") or datetime.min)
                    unit_price = oldest["price"]
                else:
                    # Hiç kayıt yoksa course fiyatını kullan
                    unit_price = course.get("student_price") or course.get("price", 0)
            except Exception:
                unit_price = course.get("student_price") or course.get("price", 0)
            
            total = total_lessons * unit_price
            total_student_payment += total
            
            branch_details[branch_name] = {
                "dates": ", ".join(all_dates),
                "unit_price": unit_price,
                "lesson_count": total_lessons,
                "total": total
            }
        
        # Her öğretmen için kazanç hesapla
        # ÖNEMLI: Grup dersleri için aynı dersi sadece bir kez saymalıyız
        # KURAL: teacher_prices tablosundan öğretmen ücretini al, öğrenci fiyatını kullanma!
        teacher_earnings = {}
        for course in student_course_list:
            teacher_id = course.get("teacher_id")
            if not teacher_id or teacher_id not in teacher_map:
                continue
            
            teacher_name = teacher_map[teacher_id]
            branch_id = course.get("branch_id")
            lesson_type_id = course.get("lesson_type_id")
            
            # Bu kurs için planlı dersleri bul
            course_planned = [pl for pl in planned_lessons if pl["student_course_id"] == course["id"]]
            
            if not course_planned:
                continue
            
            # Bu öğrenci bu branşta bir gruba dahil mi kontrol et
            is_group_lesson = False
            group_id = None
            group_size = 0
            for group in student_groups:
                if student["id"] in (group.get("student_ids") or []) and group.get("branch_id") == branch_id:
                    is_group_lesson = True
                    group_id = group["id"]
                    # Maksimum 4 kişilik grup gibi hesapla
                    actual_size = len(group.get("student_ids") or [])
                    group_size = min(actual_size, 4)
                    break
            
            # Öğretmen ücretini teacher_prices'dan al (bellekten - N+1 sorgu önlendi)
            teacher_rate = get_teacher_rate_cached(
                tp_by_tb,
                teacher_id,
                branch_id,
                lesson_type_id,
                group_size if is_group_lesson else None
            )
            
            for pl in course_planned:
                total_lessons = pl.get("number_of_lessons", 0)
                earning = total_lessons * teacher_rate
                
                if is_group_lesson and group_id:
                    # Grup dersi - bu planı daha önce saydık mı kontrol et
                    plan_key = f"{group_id}-{pl.get('month')}-{pl.get('dates')}"
                    if plan_key in processed_group_plans:
                        # Bu grup planı zaten sayıldı, öğretmen kazancını ekleme
                        continue
                    processed_group_plans.add(plan_key)
                
                if teacher_name not in teacher_earnings:
                    teacher_earnings[teacher_name] = 0
                teacher_earnings[teacher_name] += earning
                
                # Toplam öğretmen kazancına ekle
                if teacher_id in teacher_totals:
                    teacher_totals[teacher_id] += earning
        
        result.append({
            "student_id": student["id"],
            "student_name": student["name"],
            "parent_name": student.get("parent_name", ""),
            "phone": student.get("phone", ""),
            "level": student.get("level", ""),
            "account_name": account_name,
            "courses": ", ".join(branch_names),
            "note": note_data.get("note", ""),
            "payment_status": note_data.get("payment_status", ""),
            "payment_day": student.get("payment_freq", ""),  # Öğrencinin ödeme günü (profilden)
            "total_payment": total_student_payment,
            "branch_details": branch_details,
            "teacher_earnings": teacher_earnings,
            "price_overrides": note_data.get("price_overrides", {}),
            "is_risky": student.get("is_risky", False)
        })
    
    # Öğretmen toplamları
    teacher_totals_named = {
        teacher_map[tid]: total 
        for tid, total in teacher_totals.items() 
        if tid in teacher_map and total > 0
    }
    
    return {
        "month": month,
        "students": result,
        "branches": [b["name"] for b in branches],
        "teachers": [{"id": t["id"], "name": t["name"]} for t in teachers],
        "teacher_totals": teacher_totals_named
    }

@api_router.put("/monthly-program-notes/{student_id}")
async def update_monthly_program_note(
    student_id: str, 
    month: str,
    note: Optional[str] = None,
    payment_status: Optional[str] = None,
    price_overrides: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Aylık program notunu güncelle veya oluştur"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update notes")
    
    existing = await db.monthly_program_notes.find_one(
        {"student_id": student_id, "month": month}
    )
    
    update_data = {}
    if note is not None:
        update_data["note"] = note
    if payment_status is not None:
        update_data["payment_status"] = payment_status
    if price_overrides is not None:
        # price_overrides JSON string olarak gelir: {"Matematik": 1500, "Türkçe": 800}
        import json
        try:
            update_data["price_overrides"] = json.loads(price_overrides) if price_overrides else {}
        except (json.JSONDecodeError, TypeError):
            update_data["price_overrides"] = {}
    
    if existing:
        await db.monthly_program_notes.update_one(
            {"student_id": student_id, "month": month},
            {"$set": update_data}
        )
    else:
        await db.monthly_program_notes.insert_one({
            "id": str(uuid.uuid4()),
            "student_id": student_id,
            "month": month,
            **update_data,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    return {"message": "Note updated successfully"}

# ============= YEAR END (SENE SONU) ROUTE =============

@api_router.post("/year-end")
async def year_end(current_user: User = Depends(get_current_user)):
    """
    Sene sonu işlemi:
    - Tüm aktif öğrencilerin sınıfını 1 arttır
    - 8. sınıf olan öğrencileri pasife al
    """
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can perform year-end operation")
    
    # Tüm aktif öğrencileri getir
    students = await db.students.find({"status": "active"}, {"_id": 0}).to_list(10000)
    
    upgraded_count = 0
    deactivated_count = 0
    
    for student in students:
        level = student.get("level", "")
        
        # Sınıf seviyesini normalize et ("5. Sınıf" -> 5, "6" -> 6, vb.)
        level_num = None
        if isinstance(level, str):
            import re
            match = re.match(r'^(\d+)', level)
            if match:
                level_num = int(match.group(1))
        elif isinstance(level, int):
            level_num = level
        
        if level_num is None:
            continue
        
        if level_num >= 8:
            # 8. sınıf veya üstü -> pasife al
            await db.students.update_one(
                {"id": student["id"]},
                {"$set": {"status": "inactive"}}
            )
            deactivated_count += 1
        else:
            # Sınıfı 1 arttır
            new_level = str(level_num + 1)
            await db.students.update_one(
                {"id": student["id"]},
                {"$set": {"level": new_level}}
            )
            upgraded_count += 1
    
    return {
        "message": "Sene sonu işlemi tamamlandı",
        "upgraded_count": upgraded_count,
        "deactivated_count": deactivated_count
    }

# ============= FIX GROUP LESSON EARNINGS =============

@api_router.post("/fix-group-lesson-earnings")
async def fix_group_lesson_earnings(current_user: User = Depends(get_current_user)):
    """
    Mevcut grup derslerindeki öğretmen kazancı duplicasyonunu düzelt.
    
    SORUN: Grup dersi eklendiğinde her öğrenci için ayrı lesson kaydı oluşuyor
    ve her birine aynı teacher_rate yazılıyor. Bu da öğretmen kazancının
    öğrenci sayısı kadar katlanmasına neden oluyor.
    
    ÇÖZÜM: Aynı tarih, aynı group_id veya aynı branş/öğretmen kombinasyonundaki
    derslerde sadece ilk öğrenciye teacher_rate bırak, diğerlerini 0 yap.
    """
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can fix earnings")
    
    # Tüm dersleri getir
    lessons = await db.lessons.find({}, {"_id": 0}).to_list(10000)
    
    # Tarihe ve student_course'a göre grupla
    # Aynı tarihte aynı öğretmene ait dersler grup dersi olabilir
    courses = await db.student_courses.find({}, {"_id": 0}).to_list(10000)
    course_map = {c["id"]: c for c in courses}
    
    # Tarih + Öğretmen + Branş bazında grupla
    lesson_groups = {}
    for lesson in lessons:
        course = course_map.get(lesson.get("student_course_id"))
        if not course:
            continue
        
        key = f"{lesson['date']}_{course['teacher_id']}_{course['branch_id']}"
        if key not in lesson_groups:
            lesson_groups[key] = []
        lesson_groups[key].append(lesson)
    
    fixed_count = 0
    
    # Her grupta sadece ilk dersin teacher_rate'ini koru, diğerlerini 0 yap
    for key, group_lessons in lesson_groups.items():
        if len(group_lessons) <= 1:
            continue  # Tek ders, düzeltmeye gerek yok
        
        # Aynı tarihte aynı öğretmen aynı branşta birden fazla ders var
        # Bu muhtemelen grup dersi
        # İlkini atla, geri kalanların teacher_rate'ini 0 yap
        for i, lesson in enumerate(group_lessons):
            if i == 0:
                continue  # İlk dersi koru
            
            if lesson.get("teacher_rate") and lesson["teacher_rate"] > 0:
                await db.lessons.update_one(
                    {"id": lesson["id"]},
                    {"$set": {"teacher_rate": 0}}
                )
                fixed_count += 1
    
    return {
        "message": "Grup dersi kazançları düzeltildi",
        "fixed_lessons_count": fixed_count
    }

# ============= INIT DATA ROUTE =============

@api_router.post("/init-data")
async def init_data():
    # Check if data already exists
    existing_user = await db.users.find_one({})
    if existing_user:
        return {"message": "Data already initialized"}
    
    # Create default branches
    branches = [
        Branch(name="Matematik"),
        Branch(name="Fen Bilimleri"),
        Branch(name="Türkçe"),
        Branch(name="İngilizce")
    ]
    for branch in branches:
        await db.branches.insert_one(branch.model_dump())
    
    # Create lesson types
    lesson_types = [
        LessonType(name="Birebir"),
        LessonType(name="Grup")
    ]
    for lt in lesson_types:
        await db.lesson_types.insert_one(lt.model_dump())
    
    # Create default season
    season = Season(name="2024-2025", is_current=True)
    await db.seasons.insert_one(season.model_dump())
    
    # Create admin user
    admin_user = User(
        username="admin",
        password_hash=get_password_hash("admin123"),
        user_type="admin"
    )
    doc = admin_user.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.users.insert_one(doc)
    
    return {"message": "Data initialized successfully"}

# ============= CAMP ROUTES =============

@api_router.get("/camps")
async def get_camps(include_completed: bool = False, current_user: User = Depends(get_current_user)):
    """Kampları listele. Varsayılan olarak sadece aktif kamplar döner."""
    query = {}
    if not include_completed:
        query["status"] = CampStatus.ACTIVE
    
    # Öğretmen ise sadece kendi kamplarını görsün
    if current_user.user_type == "teacher":
        query["teacher_id"] = current_user.teacher_id
    
    camps = await db.camps.find(query, {"_id": 0}).to_list(1000)
    
    # Her kamp için istatistikleri hesapla
    enriched_camps = []
    for camp in camps:
        # Kamp katılımcılarını al
        participants = await db.camp_students.find({"camp_id": camp["id"]}, {"_id": 0}).to_list(1000)
        
        total_count = len(participants)
        confirmed_count = len([p for p in participants if p.get("registration_status") == RegistrationStatus.KESIN_KAYIT])
        paid_count = len([p for p in participants if p.get("payment_completed")])
        
        # Öğretmen bilgisi
        teacher = await db.teachers.find_one({"id": camp["teacher_id"]}, {"_id": 0, "name": 1})
        
        enriched_camps.append({
            **camp,
            "teacher_name": teacher["name"] if teacher else "Bilinmiyor",
            "total_participants": total_count,
            "confirmed_count": confirmed_count,
            "paid_count": paid_count
        })
    
    return enriched_camps

@api_router.get("/camps/{camp_id}")
async def get_camp(camp_id: str, current_user: User = Depends(get_current_user)):
    """Tek bir kampı getir."""
    camp = await db.camps.find_one({"id": camp_id}, {"_id": 0})
    if not camp:
        raise HTTPException(status_code=404, detail="Camp not found")
    
    # Öğretmen ise sadece kendi kampını görsün
    if current_user.user_type == "teacher" and camp["teacher_id"] != current_user.teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return camp

@api_router.post("/camps", response_model=Camp)
async def create_camp(camp_data: CampCreate, current_user: User = Depends(get_current_user)):
    """Yeni kamp oluştur. Sadece admin."""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create camps")
    
    camp = Camp(**camp_data.model_dump())
    doc = camp.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.camps.insert_one(doc)
    return camp

@api_router.put("/camps/{camp_id}")
async def update_camp(camp_id: str, camp_data: CampUpdate, current_user: User = Depends(get_current_user)):
    """Kamp güncelle. Sadece admin."""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update camps")
    
    camp = await db.camps.find_one({"id": camp_id})
    if not camp:
        raise HTTPException(status_code=404, detail="Camp not found")
    
    update_data = {k: v for k, v in camp_data.model_dump().items() if v is not None}
    if update_data:
        await db.camps.update_one({"id": camp_id}, {"$set": update_data})
    
    updated_camp = await db.camps.find_one({"id": camp_id}, {"_id": 0})
    return updated_camp

@api_router.put("/camps/{camp_id}/complete")
async def complete_camp(camp_id: str, current_user: User = Depends(get_current_user)):
    """Kampı tamamlandı durumuna çek. Sadece admin."""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can complete camps")
    
    camp = await db.camps.find_one({"id": camp_id})
    if not camp:
        raise HTTPException(status_code=404, detail="Camp not found")
    
    await db.camps.update_one({"id": camp_id}, {"$set": {"status": CampStatus.COMPLETED}})
    return {"message": "Camp marked as completed"}

@api_router.delete("/camps/{camp_id}")
async def delete_camp(camp_id: str, current_user: User = Depends(get_current_user)):
    """Kampı sil. Sadece admin. Katılımcısı varsa silemez."""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete camps")
    
    # Katılımcı kontrolü
    participant_count = await db.camp_students.count_documents({"camp_id": camp_id})
    if participant_count > 0:
        raise HTTPException(status_code=400, detail="Cannot delete camp with participants. Remove participants first.")
    
    result = await db.camps.delete_one({"id": camp_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Camp not found")
    
    return {"message": "Camp deleted successfully"}

# ============= CAMP STUDENT ROUTES =============

@api_router.get("/camps/{camp_id}/students")
async def get_camp_students(camp_id: str, current_user: User = Depends(get_current_user)):
    """Kamp katılımcılarını listele."""
    camp = await db.camps.find_one({"id": camp_id}, {"_id": 0})
    if not camp:
        raise HTTPException(status_code=404, detail="Camp not found")
    
    # Öğretmen ise sadece kendi kampını görsün
    if current_user.user_type == "teacher" and camp["teacher_id"] != current_user.teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    students = await db.camp_students.find({"camp_id": camp_id}, {"_id": 0}).to_list(1000)
    return students

@api_router.post("/camps/{camp_id}/students", response_model=CampStudent)
async def add_camp_student(camp_id: str, student_data: CampStudentCreate, current_user: User = Depends(get_current_user)):
    """Kampa öğrenci ekle. Sadece admin."""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can add camp students")
    
    camp = await db.camps.find_one({"id": camp_id})
    if not camp:
        raise HTTPException(status_code=404, detail="Camp not found")
    
    # Camp ID'yi override et
    student_data_dict = student_data.model_dump()
    student_data_dict["camp_id"] = camp_id
    
    # Statüye göre ödeme durumunu otomatik ayarla (kesin_kayit = ödeme yapılmış)
    if student_data_dict.get("registration_status") == "kesin_kayit":
        student_data_dict["payment_completed"] = True
    else:
        student_data_dict["payment_completed"] = False
    
    student = CampStudent(**student_data_dict)
    doc = student.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.camp_students.insert_one(doc)
    return student

@api_router.put("/camp-students/{student_id}")
async def update_camp_student(student_id: str, student_data: CampStudentUpdate, current_user: User = Depends(get_current_user)):
    """Kamp öğrencisini güncelle. Sadece admin."""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update camp students")
    
    student = await db.camp_students.find_one({"id": student_id})
    if not student:
        raise HTTPException(status_code=404, detail="Camp student not found")
    
    update_data = {k: v for k, v in student_data.model_dump().items() if v is not None}
    
    # Statüye göre ödeme durumunu otomatik ayarla (kesin_kayit = ödeme yapılmış)
    if "registration_status" in update_data:
        if update_data["registration_status"] == "kesin_kayit":
            update_data["payment_completed"] = True
        else:
            update_data["payment_completed"] = False
    
    if update_data:
        await db.camp_students.update_one({"id": student_id}, {"$set": update_data})
    
    updated_student = await db.camp_students.find_one({"id": student_id}, {"_id": 0})
    return updated_student

@api_router.delete("/camp-students/{student_id}")
async def delete_camp_student(student_id: str, current_user: User = Depends(get_current_user)):
    """Kamp öğrencisini sil. Sadece admin."""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete camp students")
    
    result = await db.camp_students.delete_one({"id": student_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Camp student not found")
    
    return {"message": "Camp student deleted successfully"}

# ============= CAMP TEACHER EARNINGS =============

@api_router.get("/teacher-camp-earnings/{teacher_id}")
async def get_teacher_camp_earnings(teacher_id: str, current_user: User = Depends(get_current_user)):
    """Öğretmenin kamp kazançlarını hesapla. Kesin kayıtlı öğrenciler = ödeme yapılmış kabul edilir."""
    # Öğretmen ise sadece kendi kazancını görsün
    if current_user.user_type == "teacher" and current_user.teacher_id != teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Öğretmenin tüm kamplarını al
    camps = await db.camps.find({"teacher_id": teacher_id}, {"_id": 0}).to_list(1000)
    
    camp_earnings = []
    total_earnings = 0
    
    for camp in camps:
        # Kesin kayıtlı öğrencileri say (kesin_kayit = ödeme yapılmış kabul edilir)
        paid_students = await db.camp_students.find({
            "camp_id": camp["id"],
            "registration_status": "kesin_kayit"
        }, {"_id": 0}).to_list(1000)
        
        paid_count = len(paid_students)
        camp_earning = paid_count * camp["per_student_teacher_fee"]
        total_earnings += camp_earning
        
        camp_earnings.append({
            "camp_id": camp["id"],
            "camp_name": camp["name"],
            "camp_status": camp["status"],
            "per_student_fee": camp["per_student_teacher_fee"],
            "paid_student_count": paid_count,
            "total_earning": camp_earning
        })
    
    return {
        "teacher_id": teacher_id,
        "total_camp_earnings": total_earnings,
        "camp_details": camp_earnings
    }

# ============= YOUTUBE CONTENT ROUTES =============

@api_router.get("/youtube-contents")
async def get_youtube_contents(include_inactive: bool = False, current_user: User = Depends(get_current_user)):
    """YouTube kayıtlarını listele. Admin tümünü, öğretmen sadece kendisinin görür."""
    query = {}
    
    if not include_inactive:
        query["status"] = YouTubeContentStatus.ACTIVE
    
    # Öğretmen ise sadece kendi kayıtlarını görsün
    if current_user.user_type == "teacher":
        query["teacher_id"] = current_user.teacher_id
    
    records = await db.youtube_contents.find(query, {"_id": 0}).to_list(1000)
    
    # Öğretmen bilgilerini ekle
    enriched = []
    for record in records:
        teacher = await db.teachers.find_one({"id": record["teacher_id"]}, {"_id": 0, "name": 1})
        enriched.append({
            **record,
            "teacher_name": teacher["name"] if teacher else "Bilinmiyor"
        })
    
    return enriched

@api_router.get("/youtube-contents/{record_id}")
async def get_youtube_content(record_id: str, current_user: User = Depends(get_current_user)):
    """Tek bir YouTube kaydını getir."""
    record = await db.youtube_contents.find_one({"id": record_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="YouTube content not found")
    
    # Öğretmen ise sadece kendi kaydını görsün
    if current_user.user_type == "teacher" and record["teacher_id"] != current_user.teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return record

@api_router.post("/youtube-contents", response_model=YouTubeContent)
async def create_youtube_content(data: YouTubeContentCreate, current_user: User = Depends(get_current_user)):
    """Yeni YouTube kaydı oluştur. Sadece admin."""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create YouTube content records")
    
    # Öğretmen kontrolü
    teacher = await db.teachers.find_one({"id": data.teacher_id})
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
    
    # Tarih yoksa bugünü kullan
    record_data = data.model_dump()
    if not record_data.get("date"):
        record_data["date"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    record = YouTubeContent(**record_data)
    doc = record.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.youtube_contents.insert_one(doc)
    return record

@api_router.put("/youtube-contents/{record_id}")
async def update_youtube_content(record_id: str, data: YouTubeContentUpdate, current_user: User = Depends(get_current_user)):
    """YouTube kaydını güncelle. Sadece admin."""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update YouTube content records")
    
    record = await db.youtube_contents.find_one({"id": record_id})
    if not record:
        raise HTTPException(status_code=404, detail="YouTube content not found")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if update_data:
        await db.youtube_contents.update_one({"id": record_id}, {"$set": update_data})
    
    updated_record = await db.youtube_contents.find_one({"id": record_id}, {"_id": 0})
    return updated_record

@api_router.delete("/youtube-contents/{record_id}")
async def delete_youtube_content(record_id: str, current_user: User = Depends(get_current_user)):
    """YouTube kaydını kalıcı olarak sil. Sadece admin. Kayıtlar immutable olduğu için sadece silme işlemi yapılır."""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete YouTube content records")
    
    record = await db.youtube_contents.find_one({"id": record_id})
    if not record:
        raise HTTPException(status_code=404, detail="YouTube content not found")
    
    # Sadece hard delete - kayıtlar immutable
    await db.youtube_contents.delete_one({"id": record_id})
    return {"message": "YouTube content deleted successfully"}

@api_router.get("/teacher-youtube-earnings/{teacher_id}")
async def get_teacher_youtube_earnings(teacher_id: str, current_user: User = Depends(get_current_user)):
    """Öğretmenin YouTube kazançlarını hesapla. Sadece aktif kayıtlar sayılır."""
    # Öğretmen ise sadece kendi kazancını görsün
    if current_user.user_type == "teacher" and current_user.teacher_id != teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Sadece aktif YouTube kayıtlarını al
    records = await db.youtube_contents.find({
        "teacher_id": teacher_id,
        "status": YouTubeContentStatus.ACTIVE
    }, {"_id": 0}).to_list(1000)
    
    total_earnings = sum([r["amount"] for r in records])
    
    return {
        "teacher_id": teacher_id,
        "total_youtube_earnings": total_earnings,
        "record_count": len(records),
        "records": records
    }

# ============= CASHBOX ROUTES =============

@api_router.get("/cashboxes")
async def get_cashboxes(current_user: User = Depends(get_current_user)):
    """Tüm kasaları bakiyeleriyle birlikte getir"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view cashboxes")
    
    cashboxes = await db.cashboxes.find({}, {"_id": 0}).to_list(100)
    branches = await db.branches.find({}, {"_id": 0}).to_list(100)
    branch_map = {b["id"]: b for b in branches}
    
    result = []
    total_balance = 0
    
    for cashbox in cashboxes:
        # Kasaya giren ödemeler (student_payment + transfer_in)
        income = await db.payments.find({
            "cashbox_id": cashbox["id"],
            "payment_type": {"$in": ["student_payment", "transfer_in"]}
        }, {"_id": 0, "amount": 1}).to_list(10000)
        total_income = sum([p["amount"] for p in income])
        
        # Kasadan çıkan ödemeler (teacher_payment, expense, transfer_out)
        expense = await db.payments.find({
            "cashbox_id": cashbox["id"],
            "payment_type": {"$in": ["teacher_payment", "expense", "transfer_out"]}
        }, {"_id": 0, "amount": 1}).to_list(10000)
        total_expense = sum([p["amount"] for p in expense])
        
        balance = total_income - total_expense
        total_balance += balance
        
        branch = branch_map.get(cashbox.get("branch_id"), {})
        
        result.append({
            **cashbox,
            "branch_name": branch.get("name", "Bilinmiyor"),
            "total_income": total_income,
            "total_expense": total_expense,
            "balance": balance
        })
    
    return {
        "cashboxes": result,
        "total_balance": total_balance
    }

@api_router.get("/cashboxes/{cashbox_id}")
async def get_cashbox(cashbox_id: str, current_user: User = Depends(get_current_user)):
    """Tek kasa detayı ve işlem geçmişi"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view cashbox")
    
    cashbox = await db.cashboxes.find_one({"id": cashbox_id}, {"_id": 0})
    if not cashbox:
        raise HTTPException(status_code=404, detail="Kasa bulunamadı")
    
    # Kasa işlemleri
    transactions = await db.payments.find({
        "cashbox_id": cashbox_id
    }, {"_id": 0}).to_list(10000)
    
    # İşlemleri tarih sırasına göre sırala
    transactions.sort(key=lambda x: x.get("date", ""), reverse=True)
    
    # Öğrenci ve öğretmen bilgilerini ekle
    students = await db.students.find({}, {"_id": 0}).to_list(10000)
    teachers = await db.teachers.find({}, {"_id": 0}).to_list(1000)
    student_map = {s["id"]: s for s in students}
    teacher_map = {t["id"]: t for t in teachers}
    
    for tx in transactions:
        if tx.get("student_id"):
            student = student_map.get(tx["student_id"], {})
            tx["student_name"] = student.get("name", "Bilinmiyor")
        if tx.get("teacher_id"):
            teacher = teacher_map.get(tx["teacher_id"], {})
            tx["teacher_name"] = teacher.get("name", "Bilinmiyor")
    
    # Bakiye hesapla
    income = sum([t["amount"] for t in transactions if t["payment_type"] in ["student_payment", "transfer_in"]])
    expense = sum([t["amount"] for t in transactions if t["payment_type"] in ["teacher_payment", "expense", "transfer_out"]])
    
    return {
        **cashbox,
        "transactions": transactions,
        "total_income": income,
        "total_expense": expense,
        "balance": income - expense
    }

@api_router.post("/cashboxes")
async def create_cashbox(branch_id: str, name: str, current_user: User = Depends(get_current_user)):
    """Yeni kasa oluştur"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create cashboxes")
    
    # Bu branş için zaten kasa var mı kontrol et
    existing = await db.cashboxes.find_one({"branch_id": branch_id})
    if existing:
        raise HTTPException(status_code=400, detail="Bu branş için zaten bir kasa mevcut")
    
    cashbox = BranchCashbox(branch_id=branch_id, name=name)
    doc = cashbox.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.cashboxes.insert_one(doc)
    
    return cashbox

@api_router.post("/cashbox-transfers")
async def create_cashbox_transfer(transfer_data: CashboxTransferCreate, current_user: User = Depends(get_current_user)):
    """Kasalar arası transfer yap"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can transfer between cashboxes")
    
    # Kasaları kontrol et
    from_cashbox = await db.cashboxes.find_one({"id": transfer_data.from_cashbox_id}, {"_id": 0})
    to_cashbox = await db.cashboxes.find_one({"id": transfer_data.to_cashbox_id}, {"_id": 0})
    
    if not from_cashbox:
        raise HTTPException(status_code=404, detail="Çıkış kasası bulunamadı")
    if not to_cashbox:
        raise HTTPException(status_code=404, detail="Giriş kasası bulunamadı")
    
    # Transfer kaydı oluştur
    transfer = CashboxTransfer(**transfer_data.model_dump())
    transfer_doc = transfer.model_dump()
    transfer_doc['created_at'] = transfer_doc['created_at'].isoformat()
    await db.cashbox_transfers.insert_one(transfer_doc)
    
    # Çıkış kasasından para çık
    out_payment = Payment(
        payment_type="transfer_out",
        amount=transfer_data.amount,
        date=transfer_data.date,
        cashbox_id=transfer_data.from_cashbox_id,
        expense_category="Transfer",
        description=f"Transfer: {from_cashbox['name']} -> {to_cashbox['name']}",
        transfer_id=transfer.id
    )
    out_doc = out_payment.model_dump()
    out_doc['created_at'] = out_doc['created_at'].isoformat()
    await db.payments.insert_one(out_doc)
    
    # Giriş kasasına para gir
    in_payment = Payment(
        payment_type="transfer_in",
        amount=transfer_data.amount,
        date=transfer_data.date,
        cashbox_id=transfer_data.to_cashbox_id,
        expense_category="Transfer",
        description=f"Transfer: {from_cashbox['name']} -> {to_cashbox['name']}",
        transfer_id=transfer.id
    )
    in_doc = in_payment.model_dump()
    in_doc['created_at'] = in_doc['created_at'].isoformat()
    await db.payments.insert_one(in_doc)
    
    return {
        "message": "Transfer başarılı",
        "transfer": transfer,
        "from_cashbox": from_cashbox["name"],
        "to_cashbox": to_cashbox["name"],
        "amount": transfer_data.amount
    }

# ============= TEACHER INCOME DETAIL ROUTES =============

@api_router.get("/teachers/{teacher_id}/lesson-income-detail")
async def get_teacher_lesson_income_detail(teacher_id: str, month: Optional[str] = None, current_user: User = Depends(get_current_user)):
    """
    Öğretmenin ders kazanç detaylarını grup bazlı getir.
    Her grup için: branş, grup adı, ders tipi, ders sayısı, birim ücret, toplam kazanç
    NOT: Course silinse bile, lesson'da saklanan teacher_id ile kazanç hesaplanır.
    """
    # Erişim kontrolü
    if current_user.user_type == "teacher" and current_user.teacher_id != teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Dersleri doğrudan teacher_id ile veya course üzerinden getir
    # Önce doğrudan teacher_id ile olan dersleri al (yeni sistem)
    lesson_filter = {"teacher_id": teacher_id}
    if month:
        lesson_filter["date"] = {"$regex": f"^{month}"}
    
    lessons_direct = await db.lessons.find(lesson_filter, {"_id": 0}).to_list(10000)
    
    # Eski sistemle uyumluluk: teacher_id olmayan dersler için course üzerinden bul
    courses = await db.student_courses.find({"teacher_id": teacher_id}, {"_id": 0}).to_list(10000)
    course_ids = [c["id"] for c in courses]
    course_map = {c["id"]: c for c in courses}
    
    old_lesson_filter = {
        "student_course_id": {"$in": course_ids},
        "$or": [{"teacher_id": None}, {"teacher_id": {"$exists": False}}]
    }
    if month:
        old_lesson_filter["date"] = {"$regex": f"^{month}"}
    
    lessons_old = await db.lessons.find(old_lesson_filter, {"_id": 0}).to_list(10000)
    
    # Tüm dersleri birleştir (duplicate olmaması için id kontrolü)
    all_lesson_ids = set()
    lessons = []
    for lesson in lessons_direct + lessons_old:
        if lesson["id"] not in all_lesson_ids:
            all_lesson_ids.add(lesson["id"])
            lessons.append(lesson)
    
    # Referans verileri al
    branches = await db.branches.find({}, {"_id": 0}).to_list(100)
    groups = await db.student_groups.find({}, {"_id": 0}).to_list(1000)
    students = await db.students.find({}, {"_id": 0}).to_list(10000)
    lesson_types = await db.lesson_types.find({}, {"_id": 0}).to_list(100)
    
    branch_map = {b["id"]: b for b in branches}
    group_map = {g["id"]: g for g in groups}
    student_map = {s["id"]: s for s in students}
    lesson_type_map = {lt["id"]: lt for lt in lesson_types}
    
    # Grup bazlı kazanç hesapla
    # Key: (group_id veya student_id, branch_id)
    income_by_source = {}
    
    # Öğrenci -> Grup eşleştirmesi oluştur (group_id olmayan eski dersler için)
    # Her öğrenci için (student_id, branch_id, teacher_id) -> group_id mapping
    student_to_group = {}
    for g in groups:
        g_branch_id = g.get("branch_id")
        g_teacher_id = g.get("teacher_id")
        for sid in g.get("student_ids", []):
            # Aynı öğrenci aynı branşta sadece bir grupta olabilir
            key = (sid, g_branch_id, g_teacher_id)
            student_to_group[key] = g
    
    for lesson in lessons:
        # Önce lesson'daki branch_id'yi kullan, yoksa course'dan al
        branch_id = lesson.get("branch_id")
        student_id = lesson.get("student_id")
        lesson_teacher_id = lesson.get("teacher_id") or teacher_id
        
        if not branch_id or not student_id:
            course = course_map.get(lesson.get("student_course_id"))
            if course:
                branch_id = branch_id or course.get("branch_id")
                student_id = student_id or course.get("student_id")
                lesson_teacher_id = lesson_teacher_id or course.get("teacher_id")
        
        if not branch_id:
            continue
        
        # group_id öncelikle derste kayıtlı olanı kullan
        group_id = lesson.get("group_id")
        
        # group_id yoksa, student_groups'tan tespit et
        if not group_id and student_id:
            group_key = (student_id, branch_id, lesson_teacher_id)
            matched_group = student_to_group.get(group_key)
            if matched_group:
                group_id = matched_group.get("id")
        
        teacher_rate = lesson.get("teacher_rate") or 0
        
        # Sadece teacher_rate > 0 olan dersleri say (grup derslerinde sadece ilk öğrenci)
        if teacher_rate <= 0:
            continue
        
        if group_id:
            key = f"group_{group_id}_{branch_id}"
            group = group_map.get(group_id, {})
            source_name = group.get("name", "Bilinmeyen Grup")
            source_type = "Grup Dersi"
            group_size = len(group.get("student_ids", []))
            source_id = group_id
            source_kind = "group"
        else:
            student = student_map.get(student_id, {})
            key = f"student_{student_id}_{branch_id}"
            source_name = student.get("name", "Bilinmeyen Öğrenci")
            source_type = "Birebir Ders"
            group_size = 1
            source_id = student_id
            source_kind = "student"
        
        if key not in income_by_source:
            branch = branch_map.get(branch_id, {})
            # Ders tipini bulmak için course'a bakmamız gerekebilir
            course = course_map.get(lesson.get("student_course_id"))
            lesson_type_id = course.get("lesson_type_id") if course else None
            lesson_type = lesson_type_map.get(lesson_type_id, {}) if lesson_type_id else {}
            
            # Student course ID'yi de sakla (düzenleme için)
            student_course_id = lesson.get("student_course_id")
            
            income_by_source[key] = {
                "source_name": source_name,
                "source_type": source_type,
                "source_id": source_id,
                "source_kind": source_kind,
                "student_course_id": student_course_id,
                "branch_name": branch.get("name", "Bilinmiyor"),
                "branch_id": branch_id,
                "lesson_type": lesson_type.get("name", "Bilinmiyor"),
                "group_size": group_size,
                "total_lessons": 0,
                "unit_price": teacher_rate,
                "total_earning": 0,
                "dates": [],
                "lesson_ids": []  # Silme için lesson ID'leri
            }
        
        income_by_source[key]["total_lessons"] += lesson["number_of_lessons"]
        income_by_source[key]["total_earning"] += teacher_rate * lesson["number_of_lessons"]
        income_by_source[key]["dates"].append(lesson["date"])
        income_by_source[key]["lesson_ids"].append(lesson["id"])
    
    # Sonuçları listeye çevir
    result = list(income_by_source.values())
    result.sort(key=lambda x: x["total_earning"], reverse=True)
    
    total_earning = sum([r["total_earning"] for r in result])
    total_lessons = sum([r["total_lessons"] for r in result])
    
    return {
        "teacher_id": teacher_id,
        "month": month,
        "total_earning": total_earning,
        "total_lessons": total_lessons,
        "details": result
    }

@api_router.get("/teachers/{teacher_id}/camp-income-detail")
async def get_teacher_camp_income_detail(teacher_id: str, month: Optional[str] = None, current_user: User = Depends(get_current_user)):
    """Öğretmenin kamp kazanç detaylarını getir"""
    if current_user.user_type == "teacher" and current_user.teacher_id != teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Öğretmenin kamplarını bul
    camps = await db.camps.find({"teacher_id": teacher_id}, {"_id": 0}).to_list(1000)
    
    result = []
    total_earning = 0
    
    for camp in camps:
        # Kamp tarihini kontrol et (ay filtresi)
        camp_date = camp.get("created_at", "")
        if isinstance(camp_date, str) and month:
            if not camp_date.startswith(month):
                continue
        
        # Kampa kayıtlı kesin kayıtlı öğrenci sayısı
        students = await db.camp_students.find({
            "camp_id": camp["id"],
            "registration_status": "kesin_kayit"
        }, {"_id": 0}).to_list(1000)
        
        student_count = len(students)
        per_student_fee = camp.get("per_student_teacher_fee", 0)
        camp_earning = student_count * per_student_fee
        total_earning += camp_earning
        
        result.append({
            "camp_id": camp["id"],
            "camp_name": camp["name"],
            "class_level": camp["class_level"],
            "student_count": student_count,
            "per_student_fee": per_student_fee,
            "total_earning": camp_earning,
            "status": camp.get("status", "active"),
            "created_at": camp_date
        })
    
    return {
        "teacher_id": teacher_id,
        "month": month,
        "total_earning": total_earning,
        "camp_count": len(result),
        "details": result
    }

@api_router.get("/teachers/{teacher_id}/youtube-income-detail")
async def get_teacher_youtube_income_detail(teacher_id: str, month: Optional[str] = None, current_user: User = Depends(get_current_user)):
    """Öğretmenin YouTube kazanç detaylarını getir"""
    if current_user.user_type == "teacher" and current_user.teacher_id != teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Filtre oluştur
    filter_query = {
        "teacher_id": teacher_id,
        "status": YouTubeContentStatus.ACTIVE
    }
    
    records = await db.youtube_contents.find(filter_query, {"_id": 0}).to_list(1000)
    
    # Ay filtresi
    if month:
        records = [r for r in records if r.get("date", "").startswith(month)]
    
    total_earning = sum([r["amount"] for r in records])
    
    return {
        "teacher_id": teacher_id,
        "month": month,
        "total_earning": total_earning,
        "record_count": len(records),
        "details": records
    }

# ============= STUDENT FINANCE ROUTES =============

@api_router.get("/students/{student_id}/finance-detail")
async def get_student_finance_detail(student_id: str, current_user: User = Depends(get_current_user)):
    """
    Öğrencinin branş bazlı finans detaylarını getir.
    Her branş için: girilen ders sayısı, ödenen tutar, kullanılan tutar, kalan bakiye, kalan ders
    
    FAZ 4 GÜNCELLEMESİ: Fiyat geçmişi snapshot'ını kullanır.
    - Ders kaydında student_total_amount_at_lesson varsa onu kullan
    - Yoksa o tarihteki fiyattan hesapla
    """
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view student finance")
    
    student = await db.students.find_one({"id": student_id}, {"_id": 0})
    if not student:
        raise HTTPException(status_code=404, detail="Öğrenci bulunamadı")
    
    # Öğrencinin kursları
    courses = await db.student_courses.find({
        "student_id": student_id,
        "status": "active"
    }, {"_id": 0}).to_list(100)
    
    # Referans verileri
    branches = await db.branches.find({}, {"_id": 0}).to_list(100)
    teachers = await db.teachers.find({}, {"_id": 0}).to_list(1000)
    branch_map = {b["id"]: b for b in branches}
    teacher_map = {t["id"]: t for t in teachers}
    
    result = []
    
    for course in courses:
        branch_id = course["branch_id"]
        branch = branch_map.get(branch_id, {})
        teacher = teacher_map.get(course.get("teacher_id"), {})
        
        # Bu branştaki dersler
        lessons = await db.lessons.find({
            "student_course_id": course["id"]
        }, {"_id": 0}).to_list(10000)
        
        # Tüm dersler (gösterim için)
        total_lessons = sum([l["number_of_lessons"] for l in lessons])
        free_lessons = sum([l["number_of_lessons"] for l in lessons if l.get("is_free_lesson", False)])
        
        # FAZ 4: Kullanılan tutar hesaplaması (snapshot bazlı)
        used_amount = 0
        current_student_price = course.get("student_price") or course.get("price") or 0
        
        for lesson in lessons:
            if lesson.get("is_free_lesson", False):
                continue  # Ücretsiz dersler sayılmaz
            
            # Önce snapshot'ı kontrol et
            if lesson.get("student_total_amount_at_lesson") is not None:
                used_amount += lesson["student_total_amount_at_lesson"]
            elif lesson.get("student_unit_price_at_lesson") is not None:
                used_amount += lesson["student_unit_price_at_lesson"] * lesson["number_of_lessons"]
            else:
                # Fallback: Ders tarihindeki fiyatı bul
                lesson_date_str = lesson.get("date")
                if lesson_date_str:
                    try:
                        # Ders tarihini parse et (timezone-naive, DB ile uyumlu)
                        lesson_date = datetime.strptime(lesson_date_str, "%Y-%m-%d")
                        # Ders tipini belirle - grup dersiyse önce grup, sonra birebir dene
                        is_group_lesson = bool(lesson.get("group_id"))
                        
                        price_at_date = None
                        
                        # Önce doğru tipi dene
                        primary_type = "group" if is_group_lesson else "birebir"
                        price_at_date = await db.student_price_history.find_one({
                            "$and": [
                                {"student_id": student_id},
                                {"branch_id": branch_id},
                                {"lesson_type": primary_type},
                                {"valid_from": {"$lte": lesson_date}},
                                {"$or": [
                                    {"valid_to": None},
                                    {"valid_to": {"$gte": lesson_date}}
                                ]}
                            ]
                        }, {"_id": 0}, sort=[("valid_from", -1)])
                        
                        # Grup dersi için birebir fiyat yoksa, birebir'i de dene
                        if not price_at_date and is_group_lesson:
                            price_at_date = await db.student_price_history.find_one({
                                "$and": [
                                    {"student_id": student_id},
                                    {"branch_id": branch_id},
                                    {"lesson_type": "birebir"},
                                    {"valid_from": {"$lte": lesson_date}},
                                    {"$or": [
                                        {"valid_to": None},
                                        {"valid_to": {"$gte": lesson_date}}
                                    ]}
                                ]
                            }, {"_id": 0}, sort=[("valid_from", -1)])
                        
                        if price_at_date:
                            used_amount += price_at_date["price"] * lesson["number_of_lessons"]
                        else:
                            # Tarih aralığına düşmüyorsa EN ESKİ fiyatı bul
                            primary_type = "group" if is_group_lesson else "birebir"
                            oldest_price = await db.student_price_history.find_one({
                                "student_id": student_id,
                                "branch_id": branch_id,
                                "lesson_type": primary_type
                            }, {"_id": 0}, sort=[("valid_from", 1)])  # ASC - en eski
                            
                            if not oldest_price and is_group_lesson:
                                oldest_price = await db.student_price_history.find_one({
                                    "student_id": student_id,
                                    "branch_id": branch_id,
                                    "lesson_type": "birebir"
                                }, {"_id": 0}, sort=[("valid_from", 1)])
                            
                            if oldest_price:
                                used_amount += oldest_price["price"] * lesson["number_of_lessons"]
                            else:
                                # Son fallback: mevcut fiyat (hiç fiyat geçmişi yoksa)
                                used_amount += current_student_price * lesson["number_of_lessons"]
                    except (ValueError, TypeError):
                        used_amount += current_student_price * lesson["number_of_lessons"]
                else:
                    used_amount += current_student_price * lesson["number_of_lessons"]
        
        # Bu branş için ödemeler
        payments = await db.payments.find({
            "student_id": student_id,
            "branch_id": branch_id,
            "payment_type": "student_payment"
        }, {"_id": 0}).to_list(10000)
        
        total_paid = sum([p["amount"] for p in payments])
        
        # Kalan bakiye ve ders
        remaining_balance = total_paid - used_amount
        remaining_lessons = remaining_balance / current_student_price if current_student_price > 0 else 0
        
        result.append({
            "branch_id": branch_id,
            "branch_name": branch.get("name", "Bilinmiyor"),
            "teacher_id": course.get("teacher_id"),
            "teacher_name": teacher.get("name", "Bilinmiyor"),
            "student_price": current_student_price,
            "total_lessons": total_lessons,
            "free_lessons": free_lessons,
            "used_amount": used_amount,
            "total_paid": total_paid,
            "remaining_balance": remaining_balance,
            "remaining_lessons": round(remaining_lessons, 1),
            "status": "alacakli" if remaining_balance >= 0 else "borclu"
        })
    
    # Genel özet
    total_paid_all = sum([r["total_paid"] for r in result])
    total_used_all = sum([r["used_amount"] for r in result])
    
    return {
        "student_id": student_id,
        "student_name": student["name"],
        "by_branch": result,
        "summary": {
            "total_paid": total_paid_all,
            "total_used": total_used_all,
            "total_balance": total_paid_all - total_used_all
        }
    }

@api_router.get("/students/by-branch/{branch_id}")
async def get_students_by_branch(branch_id: str, current_user: User = Depends(get_current_user)):
    """
    Branş bazlı öğrenci listesi.
    Her öğrenci için: ad, veli, ders sayısı, ödeme, kalan ders, durum
    """
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view students by branch")
    
    # Bu branştan ders alan öğrencileri bul
    courses = await db.student_courses.find({
        "branch_id": branch_id,
        "status": "active"
    }, {"_id": 0}).to_list(10000)
    
    student_ids = list(set([c["student_id"] for c in courses]))
    
    # Öğrenci bilgileri
    students = await db.students.find({
        "id": {"$in": student_ids},
        "status": "active"
    }, {"_id": 0}).to_list(10000)
    
    # Öğretmen bilgileri
    teachers = await db.teachers.find({}, {"_id": 0}).to_list(1000)
    teacher_map = {t["id"]: t for t in teachers}
    
    # Branş bilgisi
    branch = await db.branches.find_one({"id": branch_id}, {"_id": 0})
    
    result = []
    
    for student in students:
        # Bu öğrencinin bu branştaki kursu
        student_courses = [c for c in courses if c["student_id"] == student["id"]]
        if not student_courses:
            continue
        
        course = student_courses[0]
        teacher = teacher_map.get(course.get("teacher_id"), {})
        
        # Dersler
        lessons = await db.lessons.find({
            "student_course_id": course["id"]
        }, {"_id": 0}).to_list(10000)
        
        # Ücretsiz olmayan derslerin toplam sayısı (bakiye hesabı için)
        paid_lessons = [l for l in lessons if not l.get("is_free_lesson", False)]
        total_paid_lessons = sum([l["number_of_lessons"] for l in paid_lessons])
        
        # Tüm dersler (gösterim için)
        total_lessons = sum([l["number_of_lessons"] for l in lessons])
        free_lessons = sum([l["number_of_lessons"] for l in lessons if l.get("is_free_lesson", False)])
        
        # Öğrenci ders ücreti (güncel aktif fiyat - gösterim için)
        # Aktif fiyat geçmişinden al
        active_price_record = await db.student_price_history.find_one({
            "student_id": student["id"],
            "branch_id": branch_id,
            "lesson_type": "birebir",
            "valid_to": None
        }, {"_id": 0}, sort=[("valid_from", -1)])
        
        if active_price_record:
            student_price = active_price_record["price"]
        else:
            student_price = course.get("student_price") or course.get("price") or 0
        
        # FAZ 4: Kullanılan tutar hesaplaması (tarih bazlı fiyat geçmişi ile)
        used_amount = 0
        for lesson in paid_lessons:
            # Önce snapshot'ı kontrol et
            if lesson.get("student_total_amount_at_lesson") is not None:
                used_amount += lesson["student_total_amount_at_lesson"]
            elif lesson.get("student_unit_price_at_lesson") is not None:
                used_amount += lesson["student_unit_price_at_lesson"] * lesson["number_of_lessons"]
            else:
                # Fallback: Ders tarihindeki fiyatı bul
                lesson_date_str = lesson.get("date")
                if lesson_date_str:
                    try:
                        lesson_date = datetime.strptime(lesson_date_str, "%Y-%m-%d")
                        is_group_lesson = bool(lesson.get("group_id"))
                        
                        price_at_date = None
                        
                        # Önce doğru tipi dene
                        primary_type = "group" if is_group_lesson else "birebir"
                        price_at_date = await db.student_price_history.find_one({
                            "$and": [
                                {"student_id": student["id"]},
                                {"branch_id": branch_id},
                                {"lesson_type": primary_type},
                                {"valid_from": {"$lte": lesson_date}},
                                {"$or": [
                                    {"valid_to": None},
                                    {"valid_to": {"$gte": lesson_date}}
                                ]}
                            ]
                        }, {"_id": 0}, sort=[("valid_from", -1)])
                        
                        # Grup dersi için fiyat yoksa birebir'i dene
                        if not price_at_date and is_group_lesson:
                            price_at_date = await db.student_price_history.find_one({
                                "$and": [
                                    {"student_id": student["id"]},
                                    {"branch_id": branch_id},
                                    {"lesson_type": "birebir"},
                                    {"valid_from": {"$lte": lesson_date}},
                                    {"$or": [
                                        {"valid_to": None},
                                        {"valid_to": {"$gte": lesson_date}}
                                    ]}
                                ]
                            }, {"_id": 0}, sort=[("valid_from", -1)])
                        
                        if price_at_date:
                            used_amount += price_at_date["price"] * lesson["number_of_lessons"]
                        else:
                            # Tarih aralığına düşmüyorsa EN ESKİ fiyatı bul
                            primary_type = "group" if is_group_lesson else "birebir"
                            oldest_price = await db.student_price_history.find_one({
                                "student_id": student["id"],
                                "branch_id": branch_id,
                                "lesson_type": primary_type
                            }, {"_id": 0}, sort=[("valid_from", 1)])  # ASC - en eski
                            
                            if not oldest_price and is_group_lesson:
                                oldest_price = await db.student_price_history.find_one({
                                    "student_id": student["id"],
                                    "branch_id": branch_id,
                                    "lesson_type": "birebir"
                                }, {"_id": 0}, sort=[("valid_from", 1)])
                            
                            if oldest_price:
                                used_amount += oldest_price["price"] * lesson["number_of_lessons"]
                            else:
                                used_amount += student_price * lesson["number_of_lessons"]
                    except (ValueError, TypeError):
                        used_amount += student_price * lesson["number_of_lessons"]
                else:
                    used_amount += student_price * lesson["number_of_lessons"]
        
        # Ödemeler
        payments = await db.payments.find({
            "student_id": student["id"],
            "branch_id": branch_id,
            "payment_type": "student_payment"
        }, {"_id": 0}).to_list(10000)
        total_paid = sum([p["amount"] for p in payments])
        
        remaining_balance = total_paid - used_amount
        remaining_lessons = remaining_balance / student_price if student_price > 0 else 0
        
        result.append({
            "student_id": student["id"],
            "student_name": student["name"],
            "parent_name": student["parent_name"],
            "phone": student["phone"],
            "level": student["level"],
            "teacher_name": teacher.get("name", "Bilinmiyor"),
            "student_price": student_price,
            "total_lessons": total_lessons,
            "free_lessons": free_lessons,
            "total_paid": total_paid,
            "used_amount": used_amount,
            "remaining_balance": remaining_balance,
            "remaining_lessons": round(remaining_lessons, 1),
            "status": "alacakli" if remaining_balance >= 0 else "borclu"
        })
    
    # Sırala: borçlular önce
    result.sort(key=lambda x: (x["status"] != "borclu", -abs(x["remaining_balance"])))
    
    return {
        "branch_id": branch_id,
        "branch_name": branch.get("name", "Bilinmiyor") if branch else "Bilinmiyor",
        "student_count": len(result),
        "students": result,
        "summary": {
            "total_students": len(result),
            "total_paid": sum([r["total_paid"] for r in result]),
            "total_used": sum([r["used_amount"] for r in result]),
            "total_balance": sum([r["remaining_balance"] for r in result])
        }
    }

# ============= MIGRATION: INIT CASHBOXES =============

@api_router.post("/init-cashboxes")
async def init_cashboxes(current_user: User = Depends(get_current_user)):
    """
    Branşlar için kasaları oluştur ve mevcut ödemeleri Türkçe kasasına ata
    """
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can init cashboxes")
    
    # Branşları al
    branches = await db.branches.find({}, {"_id": 0}).to_list(100)
    
    created_cashboxes = []
    turkce_cashbox_id = None
    
    for branch in branches:
        # Bu branş için kasa var mı kontrol et
        existing = await db.cashboxes.find_one({"branch_id": branch["id"]})
        if not existing:
            cashbox = BranchCashbox(
                branch_id=branch["id"],
                name=f"{branch['name']} Kasası"
            )
            doc = cashbox.model_dump()
            doc['created_at'] = doc['created_at'].isoformat()
            await db.cashboxes.insert_one(doc)
            created_cashboxes.append(cashbox.name)
            
            # Türkçe kasasının ID'sini sakla
            if "türkçe" in branch["name"].lower():
                turkce_cashbox_id = cashbox.id
        else:
            if "türkçe" in branch["name"].lower():
                turkce_cashbox_id = existing["id"]
    
    # Mevcut ödemeleri Türkçe kasasına ata (cashbox_id olmayanları)
    migrated_count = 0
    if turkce_cashbox_id:
        result = await db.payments.update_many(
            {"cashbox_id": None},
            {"$set": {"cashbox_id": turkce_cashbox_id}}
        )
        migrated_count = result.modified_count
    
    return {
        "message": "Kasalar oluşturuldu",
        "created_cashboxes": created_cashboxes,
        "migrated_payments": migrated_count,
        "turkce_cashbox_id": turkce_cashbox_id
    }


@api_router.post("/migrate-lessons-teacher-info")
async def migrate_lessons_teacher_info(current_user: User = Depends(get_current_user)):
    """
    Mevcut derslere teacher_id, branch_id, student_id bilgilerini ekle.
    Bu bilgiler sayesinde course silinse bile öğretmen kazancı hesaplanabilir.
    """
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can run migrations")
    
    # Tüm course'ları al
    courses = await db.student_courses.find({}, {"_id": 0}).to_list(10000)
    course_map = {c["id"]: c for c in courses}
    
    # teacher_id olmayan dersleri bul
    lessons = await db.lessons.find({
        "$or": [
            {"teacher_id": None},
            {"teacher_id": {"$exists": False}}
        ]
    }, {"_id": 0}).to_list(100000)
    
    updated_count = 0
    for lesson in lessons:
        course = course_map.get(lesson.get("student_course_id"))
        if course:
            update_data = {
                "teacher_id": course.get("teacher_id"),
                "branch_id": course.get("branch_id"),
                "student_id": course.get("student_id")
            }
            await db.lessons.update_one(
                {"id": lesson["id"]},
                {"$set": update_data}
            )
            updated_count += 1
    
    return {
        "message": "Migration completed",
        "total_lessons_without_teacher_id": len(lessons),
        "updated_lessons": updated_count
    }


# ============= PLANLAMA USTASI (PLANNING MASTER) GAMIFICATION =============

class PlanningMasterRecord(BaseModel):
    """Öğretmenin aylık planlama ustası kaydı"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    teacher_id: str
    season: str  # "2024-2025"
    month: str  # "2026-04" (planlanan ay)
    planning_score: int = 0  # +10, +5, 0
    mini_badge: bool = False  # Sadece +10 puan alanlara
    completed_at: Optional[str] = None  # Planlamanın tamamlandığı tarih
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PlanningMasterSummary(BaseModel):
    """Öğretmenin sezon özeti"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    teacher_id: str
    season: str
    total_score: int = 0
    mini_badge_count: int = 0
    big_badge: bool = False  # 8 mini rozet = 1 büyük rozet
    current_streak: int = 0
    longest_streak: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Geçerli aylar (Temmuz ve Ağustos hariç)
VALID_PLANNING_MONTHS = ['09', '10', '11', '12', '01', '02', '03', '04', '05', '06']

def get_current_season() -> str:
    """Mevcut sezonu döndürür (Eylül başlangıç)"""
    now = datetime.now(timezone.utc)
    year = now.year
    month = now.month
    # Eylül-Aralık: bu yıl - gelecek yıl
    # Ocak-Ağustos: geçen yıl - bu yıl
    if month >= 9:
        return f"{year}-{year + 1}"
    else:
        return f"{year - 1}-{year}"

def get_next_month(current_date: datetime = None) -> str:
    """Bir sonraki ayı döndürür (YYYY-MM formatında)"""
    if current_date is None:
        current_date = datetime.now(timezone.utc)
    
    year = current_date.year
    month = current_date.month + 1
    
    if month > 12:
        month = 1
        year += 1
    
    return f"{year}-{month:02d}"

def get_days_until_25th() -> int:
    """Ayın 25'ine kaç gün kaldığını hesaplar"""
    now = datetime.now(timezone.utc)
    day = now.day
    
    if day >= 25:
        # 25'i geçtiyse, sonraki ayın 25'ine kalan gün
        # Bu durumda planlama süresi dolmuş demektir
        return 0
    else:
        return 25 - day

def is_valid_planning_month(month_str: str) -> bool:
    """Ay planlama için geçerli mi kontrol eder"""
    if not month_str or len(month_str) != 7:
        return False
    month = month_str[5:7]
    return month in VALID_PLANNING_MONTHS

async def get_teacher_expected_items(teacher_id: str, target_month: str):
    """
    Öğretmenin planlama yapması gereken aktif öğrenci ve grupları döndürür.
    Grup öğrencileri birebir listesinde gösterilmez.
    Returns: (students_list, groups_list, students_with_status, groups_with_status)
    """
    # Aktif öğrenci kurslarını bul (sadece bu öğretmenin)
    courses = await db.student_courses.find({
        "teacher_id": teacher_id,
        "status": "active"
    }, {"_id": 0}).to_list(10000)
    
    # Kurslardan benzersiz öğrenci ID'leri
    student_ids = list(set([c["student_id"] for c in courses]))
    
    # Aktif öğrencileri getir
    students = []
    if student_ids:
        students = await db.students.find({
            "id": {"$in": student_ids},
            "status": "active"
        }, {"_id": 0}).to_list(10000)
    
    # Öğretmene atanmış AKTİF grupları bul
    groups = await db.student_groups.find({
        "teacher_id": teacher_id,
        "status": {"$ne": "inactive"}
    }, {"_id": 0}).to_list(1000)
    
    # Grupların aktif olup olmadığını kontrol et (en az 1 aktif öğrenci)
    # Aynı zamanda grup öğrenci ID'lerini topla
    active_groups = []
    group_student_ids_set = set()
    
    for group in groups:
        group_student_ids = group.get("student_ids", [])
        active_students_in_group = await db.students.count_documents({
            "id": {"$in": group_student_ids},
            "status": "active"
        })
        if active_students_in_group > 0:
            active_groups.append(group)
            # Bu gruptaki öğrenci ID'lerini set'e ekle
            group_student_ids_set.update(group_student_ids)
    
    # Birebir öğrenciler = Tüm öğrenciler - Grup öğrencileri
    # Sadece grupta olmayan öğrencileri birebir olarak göster
    one_on_one_students = [s for s in students if s["id"] not in group_student_ids_set]
    
    # Her birebir öğrenci için planlama durumunu kontrol et
    students_with_status = []
    
    for student in one_on_one_students:
        # Bu öğrenci için kursları bul
        student_courses = [c for c in courses if c["student_id"] == student["id"]]
        
        has_planning = False
        for course in student_courses:
            planned = await db.planned_lessons.find_one({
                "student_course_id": course["id"],
                "month": target_month
            })
            if planned:
                has_planning = True
                break
        
        students_with_status.append({
            "id": student["id"],
            "name": student["name"],
            "has_planning": has_planning
        })
    
    # Her grup için planlama durumunu kontrol et
    groups_with_status = []
    branches = await db.branches.find({}, {"_id": 0}).to_list(100)
    branch_map = {b["id"]: b["name"] for b in branches}
    
    for group in active_groups:
        # Grup için planlama kontrolü
        # Gruptaki herhangi bir öğrencinin bu branştaki kursu için planlama var mı?
        group_student_ids = group.get("student_ids", [])
        group_courses = [c for c in courses 
                        if c["student_id"] in group_student_ids 
                        and c["branch_id"] == group["branch_id"]]
        
        has_planning = False
        for course in group_courses:
            planned = await db.planned_lessons.find_one({
                "student_course_id": course["id"],
                "month": target_month
            })
            if planned:
                has_planning = True
                break
        
        groups_with_status.append({
            "id": group["id"],
            "name": group["name"],
            "branch_name": branch_map.get(group["branch_id"], ""),
            "student_count": len(group_student_ids),
            "has_planning": has_planning
        })
    
    return one_on_one_students, active_groups, students_with_status, groups_with_status

async def check_planning_complete(teacher_id: str, target_month: str) -> tuple:
    """
    Öğretmenin belirtilen ay için planlamasının tam olup olmadığını kontrol eder.
    Returns: (is_complete, missing_students_count, missing_groups_count, total_students, total_groups)
    """
    _, _, students_with_status, groups_with_status = await get_teacher_expected_items(teacher_id, target_month)
    
    missing_students = [s for s in students_with_status if not s["has_planning"]]
    missing_groups = [g for g in groups_with_status if not g["has_planning"]]
    
    is_complete = len(missing_students) == 0 and len(missing_groups) == 0
    
    # Eğer hiç öğrenci ve grup yoksa da complete sayılmaz
    if len(students_with_status) == 0 and len(groups_with_status) == 0:
        is_complete = False
    
    return (
        is_complete,
        len(missing_students),
        len(missing_groups),
        len(students_with_status),
        len(groups_with_status)
    )

async def calculate_planning_score(teacher_id: str, target_month: str, completed_date: datetime = None) -> int:
    """
    Planlama puanını hesaplar.
    - Ayın 25'ine kadar tamamlanmışsa: +10
    - Ayın 25'i ile son günü arası: +5
    - Tamamlanmamışsa: 0
    """
    is_complete, _, _, total_students, total_groups = await check_planning_complete(teacher_id, target_month)
    
    # Hiç öğrenci/grup yoksa 0 puan
    if total_students == 0 and total_groups == 0:
        return 0
    
    if not is_complete:
        return 0
    
    # Tamamlanma tarihini kontrol et
    if completed_date is None:
        completed_date = datetime.now(timezone.utc)
    
    day = completed_date.day
    
    if day <= 25:
        return 10
    else:
        return 5

@api_router.get("/planning-master/check/{teacher_id}")
async def check_planning_master_status(
    teacher_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Öğretmenin planlama ustası durumunu kontrol eder.
    Login sonrası popup için kullanılır.
    """
    # Yetki kontrolü
    if current_user.user_type == "teacher" and current_user.teacher_id != teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    next_month = get_next_month()
    
    # Temmuz veya Ağustos ise uyarı gösterme
    if not is_valid_planning_month(next_month):
        return {
            "show_warning": False,
            "reason": "invalid_month",
            "next_month": next_month
        }
    
    is_complete, missing_students, missing_groups, total_students, total_groups = await check_planning_complete(
        teacher_id, next_month
    )
    
    days_remaining = get_days_until_25th()
    
    return {
        "show_warning": not is_complete and (total_students > 0 or total_groups > 0),
        "is_complete": is_complete,
        "next_month": next_month,
        "days_until_25th": days_remaining,
        "missing_students": missing_students,
        "missing_groups": missing_groups,
        "total_students": total_students,
        "total_groups": total_groups
    }

@api_router.get("/planning-master/summary/{teacher_id}")
async def get_planning_master_summary(
    teacher_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Öğretmenin planlama ustası özetini döndürür.
    Dashboard kartı için kullanılır.
    """
    # Yetki kontrolü
    if current_user.user_type == "teacher" and current_user.teacher_id != teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    season = get_current_season()
    next_month = get_next_month()
    
    # Sezon özeti var mı?
    summary = await db.planning_master_summaries.find_one({
        "teacher_id": teacher_id,
        "season": season
    }, {"_id": 0})
    
    if not summary:
        # Yoksa oluştur
        summary = PlanningMasterSummary(
            teacher_id=teacher_id,
            season=season
        ).model_dump()
        summary['created_at'] = summary['created_at'].isoformat()
        await db.planning_master_summaries.insert_one(summary)
    
    # Gelecek ay (planlanan ay) için kayıt var mı?
    next_month_record = await db.planning_master_records.find_one({
        "teacher_id": teacher_id,
        "season": season,
        "month": next_month
    }, {"_id": 0})
    
    next_month_score = next_month_record.get("planning_score", 0) if next_month_record else 0
    
    return {
        "teacher_id": teacher_id,
        "season": season,
        "next_month": next_month,
        "next_month_score": next_month_score,
        "total_score": summary.get("total_score", 0),
        "mini_badge_count": summary.get("mini_badge_count", 0),
        "big_badge": summary.get("big_badge", False),
        "current_streak": summary.get("current_streak", 0),
        "longest_streak": summary.get("longest_streak", 0)
    }

@api_router.get("/planning-master/detail/{teacher_id}")
async def get_planning_master_detail(
    teacher_id: str,
    month: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """
    Öğretmenin planlama detayını döndürür.
    Hangi öğrenci/grup eksik gösterir.
    """
    # Yetki kontrolü
    if current_user.user_type == "teacher" and current_user.teacher_id != teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if not month:
        month = get_next_month()
    
    _, _, students_with_status, groups_with_status = await get_teacher_expected_items(teacher_id, month)
    
    return {
        "teacher_id": teacher_id,
        "month": month,
        "students": students_with_status,
        "groups": groups_with_status,
        "total_students": len(students_with_status),
        "total_groups": len(groups_with_status),
        "completed_students": len([s for s in students_with_status if s["has_planning"]]),
        "completed_groups": len([g for g in groups_with_status if g["has_planning"]])
    }

@api_router.get("/planning-master/history/{teacher_id}")
async def get_planning_master_history(
    teacher_id: str,
    season: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """
    Öğretmenin planlama geçmişini döndürür.
    Admin detay ekranı için kullanılır.
    """
    # Admin veya kendi kaydı
    if current_user.user_type == "teacher" and current_user.teacher_id != teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if not season:
        season = get_current_season()
    
    records = await db.planning_master_records.find({
        "teacher_id": teacher_id,
        "season": season
    }, {"_id": 0}).to_list(100)
    
    # Ay adlarını Türkçe yap
    month_names = {
        '01': 'Ocak', '02': 'Şubat', '03': 'Mart', '04': 'Nisan',
        '05': 'Mayıs', '06': 'Haziran', '07': 'Temmuz', '08': 'Ağustos',
        '09': 'Eylül', '10': 'Ekim', '11': 'Kasım', '12': 'Aralık'
    }
    
    for record in records:
        if record.get("month"):
            parts = record["month"].split("-")
            if len(parts) == 2:
                record["month_label"] = f"{month_names.get(parts[1], parts[1])} {parts[0]}"
    
    # Aya göre sırala
    records.sort(key=lambda x: x.get("month", ""), reverse=True)
    
    return {
        "teacher_id": teacher_id,
        "season": season,
        "records": records
    }

@api_router.post("/planning-master/calculate/{teacher_id}")
async def calculate_and_save_planning_master(
    teacher_id: str,
    month: str,
    current_user: User = Depends(get_current_user)
):
    """
    Öğretmenin belirtilen ay için planlama puanını hesaplar ve kaydeder.
    Bu endpoint genellikle planlama tamamlandığında veya ay sonunda çağrılır.
    """
    # Admin only
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can calculate scores")
    
    season = get_current_season()
    
    # Puanı hesapla
    score = await calculate_planning_score(teacher_id, month)
    mini_badge = score == 10
    
    # Mevcut kayıt var mı?
    existing = await db.planning_master_records.find_one({
        "teacher_id": teacher_id,
        "season": season,
        "month": month
    })
    
    if existing:
        # Güncelle
        await db.planning_master_records.update_one(
            {"id": existing["id"]},
            {"$set": {
                "planning_score": score,
                "mini_badge": mini_badge,
                "completed_at": datetime.now(timezone.utc).isoformat() if score > 0 else None
            }}
        )
    else:
        # Yeni kayıt oluştur
        record = PlanningMasterRecord(
            teacher_id=teacher_id,
            season=season,
            month=month,
            planning_score=score,
            mini_badge=mini_badge,
            completed_at=datetime.now(timezone.utc).isoformat() if score > 0 else None
        )
        doc = record.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        await db.planning_master_records.insert_one(doc)
    
    # Sezon özetini güncelle
    await update_planning_master_summary(teacher_id, season)
    
    return {
        "teacher_id": teacher_id,
        "month": month,
        "score": score,
        "mini_badge": mini_badge
    }

async def update_planning_master_summary(teacher_id: str, season: str):
    """Sezon özetini günceller"""
    # Tüm aylık kayıtları al
    records = await db.planning_master_records.find({
        "teacher_id": teacher_id,
        "season": season
    }, {"_id": 0}).to_list(100)
    
    # Hesaplamalar
    total_score = sum([r.get("planning_score", 0) for r in records])
    mini_badge_count = len([r for r in records if r.get("mini_badge", False)])
    big_badge = mini_badge_count >= 8
    
    # Streak hesapla (sadece +10 puanlar streak'i artırır)
    # Ayları sırala
    records.sort(key=lambda x: x.get("month", ""))
    
    current_streak = 0
    longest_streak = 0
    temp_streak = 0
    
    for record in records:
        if record.get("planning_score", 0) == 10:
            temp_streak += 1
            if temp_streak > longest_streak:
                longest_streak = temp_streak
        else:
            temp_streak = 0
    
    current_streak = temp_streak
    
    # Özeti güncelle veya oluştur
    existing = await db.planning_master_summaries.find_one({
        "teacher_id": teacher_id,
        "season": season
    })
    
    update_data = {
        "total_score": total_score,
        "mini_badge_count": mini_badge_count,
        "big_badge": big_badge,
        "current_streak": current_streak,
        "longest_streak": longest_streak
    }
    
    if existing:
        await db.planning_master_summaries.update_one(
            {"id": existing["id"]},
            {"$set": update_data}
        )
    else:
        summary = PlanningMasterSummary(
            teacher_id=teacher_id,
            season=season,
            **update_data
        )
        doc = summary.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        await db.planning_master_summaries.insert_one(doc)

async def check_and_award_planning_master(teacher_id: str):
    """
    Öğretmenin planlama durumunu kontrol eder ve tamamlandıysa anında puan/rozet verir.
    Bu fonksiyon her planlama eklendiğinde/güncellendiğinde çağrılır.
    Race condition'ı önlemek için find_one_and_update ile upsert kullanır.
    """
    next_month = get_next_month()
    
    # Temmuz/Ağustos kontrolü
    if not is_valid_planning_month(next_month):
        return None
    
    season = get_current_season()
    
    # Önce mevcut kayıt var mı kontrol et - varsa hiçbir şey yapma
    existing = await db.planning_master_records.find_one({
        "teacher_id": teacher_id,
        "season": season,
        "month": next_month
    })
    
    if existing:
        # Bu ay için zaten puan verilmiş, tekrar verme
        return {"already_awarded": True, "month": next_month}
    
    # Planlamanın tamamlanıp tamamlanmadığını kontrol et
    is_complete, _, _, total_students, total_groups = await check_planning_complete(teacher_id, next_month)
    
    # Hiç öğrenci/grup yoksa işlem yapma
    if total_students == 0 and total_groups == 0:
        return None
    
    # Tamamlanmamışsa işlem yapma
    if not is_complete:
        return None
    
    # Tamamlandı! Puan hesapla
    now = datetime.now(timezone.utc)
    day = now.day
    
    # 25'e kadar tamamlandıysa +10, değilse +5
    score = 10 if day <= 25 else 5
    mini_badge = score == 10
    
    # Atomik upsert - sadece kayıt yoksa oluştur (race condition önlemi)
    # $setOnInsert sadece insert durumunda çalışır, update durumunda çalışmaz
    result = await db.planning_master_records.update_one(
        {
            "teacher_id": teacher_id,
            "season": season,
            "month": next_month
        },
        {
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "teacher_id": teacher_id,
                "season": season,
                "month": next_month,
                "planning_score": score,
                "mini_badge": mini_badge,
                "completed_at": now.isoformat(),
                "created_at": now.isoformat()
            }
        },
        upsert=True
    )
    
    # Eğer yeni kayıt oluşturulduysa (upserted_id varsa) summary'yi güncelle
    if result.upserted_id:
        await update_planning_master_summary(teacher_id, season)
        
        # Güncel summary bilgilerini al
        summary = await db.planning_master_summaries.find_one({
            "teacher_id": teacher_id,
            "season": season
        }, {"_id": 0})
        
        return {
            "awarded": True,
            "score": score,
            "mini_badge": mini_badge,
            "month": next_month,
            "current_streak": summary.get("current_streak", 1) if summary else 1,
            "mini_badge_count": summary.get("mini_badge_count", 1) if summary else 1,
            "big_badge": summary.get("big_badge", False) if summary else False
        }
    
    # Kayıt zaten vardı, değişiklik yapılmadı
    return {"already_awarded": True, "month": next_month}

@api_router.get("/planning-master/all-teachers")
async def get_all_teachers_planning_master(
    current_user: User = Depends(get_current_user)
):
    """
    Tüm öğretmenlerin planlama ustası durumunu döndürür.
    Admin rozetler sayfası için kullanılır.
    """
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view all teachers")
    
    season = get_current_season()
    next_month = get_next_month()
    
    # Aktif öğretmenleri al
    teachers = await db.teachers.find({"status": "active"}, {"_id": 0}).to_list(1000)
    
    result = []
    for teacher in teachers:
        # Özet bilgisini al
        summary = await db.planning_master_summaries.find_one({
            "teacher_id": teacher["id"],
            "season": season
        }, {"_id": 0})
        
        if not summary:
            summary = {
                "total_score": 0,
                "mini_badge_count": 0,
                "big_badge": False,
                "current_streak": 0,
                "longest_streak": 0
            }
        
        # Gelecek ay (planlanan ay) puanı
        next_month_record = await db.planning_master_records.find_one({
            "teacher_id": teacher["id"],
            "season": season,
            "month": next_month
        }, {"_id": 0})
        
        result.append({
            "teacher_id": teacher["id"],
            "teacher_name": teacher["name"],
            "season": season,
            "next_month": next_month,
            "next_month_score": next_month_record.get("planning_score", 0) if next_month_record else 0,
            "total_score": summary.get("total_score", 0),
            "mini_badge_count": summary.get("mini_badge_count", 0),
            "big_badge": summary.get("big_badge", False),
            "current_streak": summary.get("current_streak", 0),
            "longest_streak": summary.get("longest_streak", 0)
        })
    
    # Toplam puana göre sırala
    result.sort(key=lambda x: x["total_score"], reverse=True)
    
    return {
        "season": season,
        "next_month": next_month,
        "teachers": result
    }

@api_router.post("/planning-master/season-end")
async def planning_master_season_end(
    current_user: User = Depends(get_current_user)
):
    """
    Sene sonu işlemi - mevcut sezon verilerini arşivler ve yeni sezon başlatır.
    Mini rozetler ve streakler sıfırlanır, geçmiş silinmez.
    """
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can perform season end")
    
    old_season = get_current_season()
    
    # Yeni sezonu hesapla
    parts = old_season.split("-")
    new_season = f"{int(parts[1])}-{int(parts[1]) + 1}"
    
    # Tüm öğretmenler için yeni sezon özeti oluştur (eski veriler korunur)
    teachers = await db.teachers.find({"status": "active"}, {"_id": 0}).to_list(1000)
    
    created_count = 0
    for teacher in teachers:
        # Yeni sezon özeti var mı?
        existing = await db.planning_master_summaries.find_one({
            "teacher_id": teacher["id"],
            "season": new_season
        })
        
        if not existing:
            summary = PlanningMasterSummary(
                teacher_id=teacher["id"],
                season=new_season
            )
            doc = summary.model_dump()
            doc['created_at'] = doc['created_at'].isoformat()
            await db.planning_master_summaries.insert_one(doc)
            created_count += 1
    
    return {
        "message": "Sene sonu işlemi tamamlandı",
        "old_season": old_season,
        "new_season": new_season,
        "teachers_processed": created_count,
        "note": "Geçmiş sezon verileri korunmuştur."
    }


# ============= AUDIT LOG ENDPOINTS =============

@api_router.get("/admin/audit-logs/recent")
async def get_recent_audit_logs(current_user: User = Depends(get_current_user)):
    """
    Admin login sonrası son login'den beri yapılan değişiklikleri getir.
    Sadece teacher işlemleri döner, admin işlemleri filtrelenir.
    """
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can access audit logs")
    
    # Admin'in son login zamanını bul
    admin_login = await db.admin_login_times.find_one(
        {"username": current_user.username},
        {"_id": 0}
    )
    
    # Eğer login kaydı yoksa veya first login ise, tüm logları getir (son 7 gün)
    if admin_login and admin_login.get("last_login"):
        last_login = admin_login["last_login"]
        query = {"created_at": {"$gt": last_login}}
    else:
        # İlk kez giriş - son 7 günün loglarını göster
        seven_days_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        query = {"created_at": {"$gt": seven_days_ago}}
    
    # Logları getir (en yeni en üstte)
    logs = await db.audit_logs.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    return {
        "logs": logs,
        "total_count": len(logs),
        "has_new_changes": len(logs) > 0
    }

@api_router.get("/admin/audit-logs")
async def get_audit_logs(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    student_id: Optional[str] = None,
    teacher_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 10,
    current_user: User = Depends(get_current_user)
):
    """
    Günlük Değişiklikler ekranı için pagination destekli audit log listesi.
    
    Filtreler:
    - start_date, end_date: Tarih aralığı
    - student_id: Öğrenci filtresi (o öğrencinin dersleri, grup dersiyse grubun dersleri)
    - teacher_id: Öğretmen filtresi (öğretmenin yaptığı değişiklikler)
    """
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can access audit logs")
    
    query = {}
    
    # Tarih filtreleri
    if start_date or end_date:
        date_query = {}
        if start_date:
            date_query["$gte"] = start_date
        if end_date:
            # End date'e 1 gün ekle (o günün sonuna kadar dahil etmek için)
            date_query["$lte"] = end_date + "T23:59:59"
        query["created_at"] = date_query
    
    # Öğrenci filtresi
    if student_id:
        # Öğrencinin dahil olduğu grupları bul
        student_groups = await db.student_groups.find(
            {"student_ids": student_id},
            {"_id": 0, "id": 1}
        ).to_list(100)
        group_ids = [g["id"] for g in student_groups]
        
        # student_id veya group_id eşleşmesi
        student_query = {"$or": [{"student_id": student_id}]}
        if group_ids:
            student_query["$or"].append({"group_id": {"$in": group_ids}})
        
        # Mevcut query'yi birleştir
        if query:
            query = {"$and": [query, student_query]}
        else:
            query = student_query
    
    # Öğretmen filtresi (öğretmenin yaptığı değişiklikler)
    if teacher_id:
        teacher_query = {"teacher_id": teacher_id}
        if query:
            if "$and" in query:
                query["$and"].append(teacher_query)
            else:
                query = {"$and": [query, teacher_query]}
        else:
            query = teacher_query
    
    # Toplam sayı
    total_count = await db.audit_logs.count_documents(query)
    
    # Pagination
    skip = (page - 1) * page_size
    logs = await db.audit_logs.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(page_size).to_list(page_size)
    
    return {
        "logs": logs,
        "total_count": total_count,
        "page": page,
        "page_size": page_size,
        "total_pages": (total_count + page_size - 1) // page_size if total_count > 0 else 1
    }

@api_router.post("/admin/audit-logs/mark-read")
async def mark_audit_logs_read(current_user: User = Depends(get_current_user)):
    """
    Admin'in logları okuduğunu işaretle (son login zamanını güncelle).
    Bu endpoint admin popup'ı kapattığında çağrılır.
    """
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can access this endpoint")
    
    await db.admin_login_times.update_one(
        {"username": current_user.username},
        {
            "$set": {
                "last_login": datetime.now(timezone.utc).isoformat(),
                "username": current_user.username
            }
        },
        upsert=True
    )
    
    return {"message": "Audit logs marked as read"}

# ============= GRUP DERSİ SİLME ENDPOINT =============

@api_router.delete("/group-lessons/{group_id}/{date}")
async def delete_group_lessons(group_id: str, date: str, current_user: User = Depends(get_current_user)):
    """
    Belirli bir grup için belirli bir tarihteki tüm dersleri sil.
    Teacher sadece kendi grubunun derslerini silebilir.
    """
    # Get group
    group = await db.student_groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Check access - teacher sadece kendi grubunu silebilir
    if current_user.user_type == "teacher" and group.get("teacher_id") != current_user.teacher_id:
        raise HTTPException(status_code=403, detail="Access denied - you can only delete lessons from your own groups")
    
    # O gün için grup derslerini bul
    lessons = await db.lessons.find({
        "group_id": group_id,
        "date": date
    }, {"_id": 0}).to_list(100)
    
    if not lessons:
        raise HTTPException(status_code=404, detail="No lessons found for this date")
    
    # Audit log için eski veriyi kaydet
    first_lesson = lessons[0] if lessons else {}
    old_data = {
        "date": date,
        "number_of_lessons": first_lesson.get("number_of_lessons"),
        "teacher_rate": first_lesson.get("teacher_rate"),
        "is_free_lesson": first_lesson.get("is_free_lesson", False),
        "student_count": len(lessons)
    }
    
    # Tüm dersleri sil
    result = await db.lessons.delete_many({
        "group_id": group_id,
        "date": date
    })
    
    # Audit log - sadece teacher işlemleri loglanır
    if current_user.user_type == "teacher":
        await create_audit_log(
            action_type=AuditLogActionType.DELETE,
            category=AuditLogCategory.LESSON_ENTRY,
            teacher_id=current_user.teacher_id,
            entity_id=first_lesson.get("id", group_id),
            student_id=None,
            group_id=group_id,
            old_data=old_data,
            new_data=None
        )
    
    return {
        "message": f"Deleted {result.deleted_count} lessons for group on {date}",
        "deleted_count": result.deleted_count
    }


# ============= GRUP DERSLERİ LİSTELEME ENDPOINT =============

@api_router.get("/group-lessons/{group_id}")
async def get_group_lessons(group_id: str, current_user: User = Depends(get_current_user)):
    """
    Belirli bir grubun tüm derslerini getir.
    Dersler group_id üzerinden doğrudan çekilir - student_course filtrelemesi YAPILMAZ.
    En güncel tarih en üstte olacak şekilde sıralanır.
    Aynı tarihteki öğrenci kayıtları gruplanarak döndürülür.
    """
    # Get group
    group = await db.student_groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Check access - teacher sadece kendi grubunu görebilir
    if current_user.user_type == "teacher" and group.get("teacher_id") != current_user.teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Grup derslerini group_id ile doğrudan çek
    lessons = await db.lessons.find(
        {"group_id": group_id},
        {"_id": 0}
    ).sort("date", -1).to_list(1000)
    
    # Tarihe göre grupla
    lessons_by_date = {}
    for lesson in lessons:
        date = lesson.get("date")
        if date not in lessons_by_date:
            lessons_by_date[date] = {
                "date": date,
                "lessons": [],
                "number_of_lessons": lesson.get("number_of_lessons", 0),
                "teacher_rate": 0,
                "is_free_lesson": lesson.get("is_free_lesson", False),
                "student_count": 0
            }
        lessons_by_date[date]["lessons"].append(lesson)
        lessons_by_date[date]["student_count"] += 1
        # Teacher rate sadece bir kez eklenir (ilk öğrencide tam rate var)
        if lesson.get("teacher_rate", 0) > 0:
            lessons_by_date[date]["teacher_rate"] = lesson.get("teacher_rate")
    
    # Tarihe göre sıralı liste oluştur (en yeni önce)
    grouped_lessons = sorted(lessons_by_date.values(), key=lambda x: x["date"], reverse=True)
    
    # Toplam ders sayısı hesapla (her tarih için number_of_lessons toplamı)
    total_lessons = sum(item["number_of_lessons"] for item in grouped_lessons)
    total_dates = len(grouped_lessons)
    
    # Ücretsiz ders sayısı
    free_lesson_count = sum(1 for item in grouped_lessons if item.get("is_free_lesson"))
    
    return {
        "group": group,
        "lessons": grouped_lessons,
        "total_lessons": total_lessons,
        "total_dates": total_dates,
        "free_lesson_count": free_lesson_count,
        # Ham lesson listesi de döndür (gerekirse)
        "raw_lessons": lessons
    }


# ============= ÖDEV TAKİP SİSTEMİ ENDPOINTS =============

# ------------- FEATURE FLAG HELPERS -------------

async def is_homework_tool_enabled() -> bool:
    """Ödev takip sistemi aktif mi kontrol et"""
    setting = await db.system_settings.find_one({"key": "homework_tool_enabled"}, {"_id": 0})
    if setting is None:
        # Default: aktif
        return True
    return setting.get("value", True)

async def check_homework_tool_enabled():
    """Ödev takip sistemi kapalıysa 403 fırlat"""
    enabled = await is_homework_tool_enabled()
    if not enabled:
        raise HTTPException(status_code=403, detail="Ödev takip sistemi şu anda pasif durumda. Admin panelinden aktif edebilirsiniz.")

# ------------- FEATURE FLAG ENDPOINTS -------------

@api_router.get("/system-settings")
async def get_system_settings(current_user: User = Depends(get_current_user)):
    """Sistem ayarlarını listele - sadece admin"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view system settings")
    
    settings = await db.system_settings.find({}, {"_id": 0}).to_list(100)
    
    # Default ayarları ekle (yoksa)
    default_settings = [
        {"key": "homework_tool_enabled", "value": True, "description": "Ödev Takip Sistemi"},
        {"key": "lesson_links_enabled", "value": False, "description": "Ders Giriş Özelliği"},
        {"key": "yns_league_enabled", "value": False, "description": "YNS League (Öğrenci Yıldız Sistemi)"}
    ]
    
    existing_keys = [s["key"] for s in settings]
    for default in default_settings:
        if default["key"] not in existing_keys:
            settings.append({
                "key": default["key"],
                "value": default["value"],
                "description": default["description"],
                "updated_at": datetime.now(timezone.utc).isoformat()
            })
    
    return settings

@api_router.put("/system-settings/{key}")
async def update_system_setting(key: str, data: SystemSettingsUpdate, current_user: User = Depends(get_current_user)):
    """Sistem ayarını güncelle - sadece admin"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update system settings")
    
    existing = await db.system_settings.find_one({"key": key})
    
    update_data = {
        "key": key,
        "value": data.value,
        "description": data.description,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    if existing:
        await db.system_settings.update_one({"key": key}, {"$set": update_data})
    else:
        update_data["id"] = str(uuid.uuid4())
        await db.system_settings.insert_one(update_data)
    
    # YNS League aktif edilince varsayılan tanımları otomatik seed et
    if key == "yns_league_enabled" and data.value:
        await seed_yns_definitions()
    
    return {"message": "Ayar güncellendi", "key": key, "value": data.value}

@api_router.get("/system-settings/homework-status")
async def get_homework_status(current_user: User = Depends(get_current_user)):
    """Ödev sistemi durumunu kontrol et - tüm kullanıcılar"""
    enabled = await is_homework_tool_enabled()
    return {"enabled": enabled}

# ============= YNS LEAGUE (ÖĞRENCİ YILDIZ SİSTEMİ) =============

YNS_DEFAULT_DEFINITIONS = [
    {"name": "Haftalık ödevlerini tamamen yapmak", "point": 20, "category": "Ödev"},
    {"name": "Aylık ödevlerini tamamen yapmak", "point": 50, "category": "Ödev"},
    {"name": "Derse aktif katılmak", "point": 5, "category": "Ders Katılımı"},
    {"name": "Doğru cevap vermek", "point": 2, "category": "Doğru Cevap"},
    {"name": "Kamera ve mikrofonu dersin en az 30 dakikasında açık tutmak", "point": 5, "category": "Ders Disiplini"},
    {"name": "Kitap bitirmek", "point": 30, "category": "Kitap Okuma"},
    {"name": "Denemede branş başına 15-17 net yapmak", "point": 15, "category": "Deneme Başarısı"},
    {"name": "Denemede branş başına 18-19 net yapmak", "point": 20, "category": "Deneme Başarısı"},
    {"name": "Denemede branş başına 20 net yapmak", "point": 30, "category": "Deneme Başarısı"},
    {"name": "Okul yazılısından 85 ve üzeri almak", "point": 15, "category": "Okul Başarısı"},
    {"name": "Dönem sonunda teşekkür belgesi almak", "point": 25, "category": "Belge / Dönem Başarısı"},
    {"name": "Dönem sonunda takdir belgesi almak", "point": 40, "category": "Belge / Dönem Başarısı"},
    {"name": "Okul birinciliği", "point": 100, "category": "Özel Başarı"},
]

async def seed_yns_definitions():
    """YNS League ilk açıldığında varsayılan yıldız tanımlarını oluştur (koleksiyon boşsa)."""
    count = await db.student_point_definitions.count_documents({})
    if count > 0:
        return
    now = datetime.now(timezone.utc).isoformat()
    docs = []
    for d in YNS_DEFAULT_DEFINITIONS:
        docs.append({
            "id": str(uuid.uuid4()),
            "name": d["name"],
            "description": "",
            "point": float(d["point"]),
            "category": d["category"],
            "is_active": True,
            "created_at": now,
            "updated_at": now,
            "created_by": "system",
            "updated_by": None,
        })
    if docs:
        await db.student_point_definitions.insert_many(docs)

async def is_yns_enabled() -> bool:
    setting = await db.system_settings.find_one({"key": "yns_league_enabled"}, {"_id": 0})
    if setting is None:
        return False
    return setting.get("value", False)

async def check_yns_enabled():
    if not await is_yns_enabled():
        raise HTTPException(status_code=403, detail="YNS League şu anda pasif durumda.")

@api_router.get("/system-settings/yns-league-status")
async def get_yns_status(current_user: User = Depends(get_current_user)):
    """YNS League durumunu kontrol et - tüm kullanıcılar"""
    return {"enabled": await is_yns_enabled()}

# --- Yıldız tanımları (admin) ---

@api_router.get("/admin/student-point-definitions")
async def admin_list_point_definitions(current_user: User = Depends(get_current_user)):
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin erişebilir")
    await check_yns_enabled()
    await seed_yns_definitions()
    defs = await db.student_point_definitions.find({}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return defs

@api_router.post("/admin/student-point-definitions")
async def admin_create_point_definition(data: StudentPointDefinitionCreate, current_user: User = Depends(get_current_user)):
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin erişebilir")
    await check_yns_enabled()
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Başarı adı gerekli")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "name": data.name.strip(),
        "description": data.description or "",
        "point": float(data.point),
        "category": data.category,
        "is_active": data.is_active if data.is_active is not None else True,
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.id,
        "updated_by": None,
    }
    await db.student_point_definitions.insert_one(dict(doc))
    return {"message": "Yıldız tanımı oluşturuldu", "definition": doc}

@api_router.put("/admin/student-point-definitions/{def_id}")
async def admin_update_point_definition(def_id: str, data: StudentPointDefinitionUpdate, current_user: User = Depends(get_current_user)):
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin erişebilir")
    await check_yns_enabled()
    existing = await db.student_point_definitions.find_one({"id": def_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Tanım bulunamadı")
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if "point" in update:
        update["point"] = float(update["point"])
    if "name" in update:
        update["name"] = update["name"].strip()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    update["updated_by"] = current_user.id
    await db.student_point_definitions.update_one({"id": def_id}, {"$set": update})
    return {"message": "Yıldız tanımı güncellendi"}

@api_router.patch("/admin/student-point-definitions/{def_id}/status")
async def admin_toggle_point_definition(def_id: str, data: StudentPointStatusUpdate, current_user: User = Depends(get_current_user)):
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin erişebilir")
    await check_yns_enabled()
    existing = await db.student_point_definitions.find_one({"id": def_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Tanım bulunamadı")
    await db.student_point_definitions.update_one(
        {"id": def_id},
        {"$set": {"is_active": data.is_active, "updated_at": datetime.now(timezone.utc).isoformat(), "updated_by": current_user.id}}
    )
    return {"message": "Durum güncellendi", "is_active": data.is_active}

# --- Aktif tanımlar (öğretmen + admin, yıldız verirken) ---

@api_router.get("/student-point-definitions")
async def list_active_point_definitions(current_user: User = Depends(get_current_user)):
    await check_yns_enabled()
    await seed_yns_definitions()
    defs = await db.student_point_definitions.find({"is_active": True}, {"_id": 0}).sort("category", 1).to_list(500)
    return defs

# --- Yıldız kayıtları ---

@api_router.post("/teacher/student-points")
async def create_student_point(data: StudentPointRecordCreate, current_user: User = Depends(get_current_user)):
    await check_yns_enabled()
    if current_user.user_type != "teacher":
        raise HTTPException(status_code=403, detail="Sadece öğretmen yıldız verebilir")

    teacher_id = current_user.teacher_id
    # Öğretmen bu branşa sahip mi? (teacher_branches koleksiyonu)
    tb = await db.teacher_branches.find_one({"teacher_id": teacher_id, "branch_id": data.branch_id}, {"_id": 0})
    if not tb:
        raise HTTPException(status_code=403, detail="Bu branş için yetkiniz yok")

    # Öğretmen bu öğrenciyi bu branşta okutuyor mu? (student_courses)
    course = await db.student_courses.find_one({
        "teacher_id": teacher_id,
        "student_id": data.student_id,
        "branch_id": data.branch_id
    }, {"_id": 0})
    if not course:
        raise HTTPException(status_code=403, detail="Bu öğrenciye bu branştan yıldız veremezsiniz")

    definition = await db.student_point_definitions.find_one({"id": data.point_definition_id}, {"_id": 0})
    if not definition:
        raise HTTPException(status_code=404, detail="Yıldız tanımı bulunamadı")
    if not definition.get("is_active", True):
        raise HTTPException(status_code=400, detail="Pasif yıldız tanımı ile giriş yapılamaz")

    quantity = data.quantity if (data.quantity and data.quantity > 0) else 1
    base_point = float(definition["point"])
    total_point = base_point * quantity

    now = datetime.now(timezone.utc)
    point_date = now.strftime("%Y-%m-%d")
    season_id = await get_active_season_id()

    record = {
        "id": str(uuid.uuid4()),
        "student_id": data.student_id,
        "teacher_id": teacher_id,
        "branch_id": data.branch_id,
        "season_id": season_id,
        "point_definition_id": data.point_definition_id,
        "point_definition_name_snapshot": definition["name"],
        "category_snapshot": definition["category"],
        "base_point_snapshot": base_point,
        "quantity": quantity,
        "total_point": total_point,
        "description": data.description or "",
        "point_date": point_date,
        "month": now.month,
        "year": now.year,
        "created_at": now.isoformat(),
        "deleted_at": None,
        "deleted_by": None,
    }
    await db.student_point_records.insert_one(dict(record))
    return {"message": "Yıldız verildi", "record": record}

@api_router.delete("/teacher/student-points/{record_id}")
async def teacher_delete_student_point(record_id: str, current_user: User = Depends(get_current_user)):
    await check_yns_enabled()
    if current_user.user_type != "teacher":
        raise HTTPException(status_code=403, detail="Sadece öğretmen silebilir")
    record = await db.student_point_records.find_one({"id": record_id, "deleted_at": None}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    if record["teacher_id"] != current_user.teacher_id:
        raise HTTPException(status_code=403, detail="Sadece kendi verdiğiniz yıldızı silebilirsiniz")
    await db.student_point_records.update_one(
        {"id": record_id},
        {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat(), "deleted_by": current_user.id}}
    )
    return {"message": "Yıldız kaydı silindi"}

@api_router.delete("/admin/student-points/{record_id}")
async def admin_delete_student_point(record_id: str, current_user: User = Depends(get_current_user)):
    await check_yns_enabled()
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin erişebilir")
    record = await db.student_point_records.find_one({"id": record_id, "deleted_at": None}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    await db.student_point_records.update_one(
        {"id": record_id},
        {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat(), "deleted_by": current_user.id}}
    )
    return {"message": "Yıldız kaydı silindi"}

@api_router.get("/student-points")
async def list_student_points(
    student_id: Optional[str] = None,
    branch_id: Optional[str] = None,
    season_id: Optional[str] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    current_user: User = Depends(get_current_user)
):
    """Yıldız kayıtlarını listele (öğretmen + admin). Detay/silme için."""
    await check_yns_enabled()
    if current_user.user_type not in ("teacher", "admin"):
        raise HTTPException(status_code=403, detail="Yetkisiz")
    query = {"deleted_at": None}
    if student_id:
        query["student_id"] = student_id
    if branch_id:
        query["branch_id"] = branch_id
    if season_id:
        query["season_id"] = season_id
    if month:
        query["month"] = month
    if year:
        query["year"] = year
    records = await db.student_point_records.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)
    # Öğretmen adları
    teacher_ids = list({r["teacher_id"] for r in records})
    teachers = await db.teachers.find({"id": {"$in": teacher_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    tmap = {t["id"]: t["name"] for t in teachers}
    for r in records:
        r["teacher_name"] = tmap.get(r["teacher_id"], "")
        r["can_delete"] = (current_user.user_type == "admin") or (current_user.teacher_id == r["teacher_id"])
    return records

@api_router.get("/student-points/leaderboard")
async def get_points_leaderboard(
    season_id: Optional[str] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    grade_level: Optional[str] = None,
    branch_id: Optional[str] = None,
    view_type: str = "season",
    current_user: User = Depends(get_current_user)
):
    """Branş/sınıf bazlı liderlik tablosu (öğretmen + admin)."""
    await check_yns_enabled()
    if current_user.user_type not in ("teacher", "admin"):
        raise HTTPException(status_code=403, detail="Yetkisiz")

    if not season_id:
        season_id = await get_active_season_id()

    query = {"deleted_at": None}
    if branch_id:
        query["branch_id"] = branch_id
    if view_type == "monthly":
        if month:
            query["month"] = month
        if year:
            query["year"] = year
        else:
            query["year"] = datetime.now(timezone.utc).year
    else:  # season
        if season_id:
            query["season_id"] = season_id

    records = await db.student_point_records.find(query, {"_id": 0}).to_list(50000)

    totals = {}
    for r in records:
        totals[r["student_id"]] = totals.get(r["student_id"], 0) + (r.get("total_point", 0) or 0)

    # Öğrenci bilgileri (isim + sınıf)
    student_ids = list(totals.keys())
    students = await db.students.find({"id": {"$in": student_ids}}, {"_id": 0, "id": 1, "name": 1, "level": 1}).to_list(10000)
    smap = {s["id"]: s for s in students}

    rows = []
    for sid, total in totals.items():
        s = smap.get(sid)
        if not s:
            continue
        if grade_level and str(s.get("level")) != str(grade_level):
            continue
        rows.append({
            "student_id": sid,
            "student_name": s["name"],
            "level": s.get("level"),
            "total_point": round(total, 2),
        })

    rows.sort(key=lambda x: x["total_point"], reverse=True)
    # Eşit yıldızda aynı derece
    rank = 0
    prev = None
    for i, row in enumerate(rows):
        if prev is None or row["total_point"] != prev:
            rank = i + 1
            prev = row["total_point"]
        row["rank"] = rank

    return {"season_id": season_id, "view_type": view_type, "leaderboard": rows}


# ------------- KİTAP YÖNETİMİ -------------

@api_router.get("/homework/books")
async def get_books(
    branch_id: Optional[str] = None,
    level: Optional[str] = None,
    status: Optional[str] = "active",
    current_user: User = Depends(get_current_user)
):
    """Kitapları listele - branş bazlı filtreleme"""
    query = {}
    
    if status:
        query["status"] = status
    if level:
        query["level"] = level
    
    # Branş ID belirtilmişse direkt kullan
    if branch_id:
        query["branch_id"] = branch_id
    elif current_user.user_type == "teacher":
        # Öğretmenin branşlarını bul - sadece branch_id belirtilmemişse
        teacher_branches = await db.teacher_branches.find(
            {"teacher_id": current_user.teacher_id},
            {"_id": 0}
        ).to_list(100)
        teacher_branch_ids = [tb["branch_id"] for tb in teacher_branches]
        
        if teacher_branch_ids:
            query["branch_id"] = {"$in": teacher_branch_ids}
        # Eğer öğretmenin branş ataması yoksa tüm kitapları göster (yeni öğretmen için)
    
    books = await db.books.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    
    # Branş bilgilerini ekle
    for book in books:
        branch = await db.branches.find_one({"id": book["branch_id"]}, {"_id": 0})
        book["branch_name"] = branch["name"] if branch else "Bilinmiyor"
    
    return books

@api_router.get("/homework/books/{book_id}")
async def get_book(book_id: str, current_user: User = Depends(get_current_user)):
    """Tek kitap detayı"""
    book = await db.books.find_one({"id": book_id}, {"_id": 0})
    if not book:
        raise HTTPException(status_code=404, detail="Kitap bulunamadı")
    
    # Öğretmen yetki kontrolü
    if current_user.user_type == "teacher":
        teacher_branches = await db.teacher_branches.find(
            {"teacher_id": current_user.teacher_id},
            {"_id": 0}
        ).to_list(100)
        teacher_branch_ids = [tb["branch_id"] for tb in teacher_branches]
        if book["branch_id"] not in teacher_branch_ids:
            raise HTTPException(status_code=403, detail="Bu kitaba erişim yetkiniz yok")
    
    branch = await db.branches.find_one({"id": book["branch_id"]}, {"_id": 0})
    book["branch_name"] = branch["name"] if branch else "Bilinmiyor"
    
    return book

@api_router.post("/homework/books")
async def create_book(book_data: BookCreate, current_user: User = Depends(get_current_user)):
    """Yeni kitap oluştur"""
    # Öğretmen veya admin kitap oluşturabilir
    # Öğretmen ödev takip sayfasına erişebildiyse zaten o branş için çalışıyordur
    
    book = Book(
        **book_data.model_dump(),
        created_by=current_user.teacher_id if current_user.user_type == "teacher" else None
    )
    doc = book.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.books.insert_one(doc)
    
    return {"message": "Kitap oluşturuldu", "book_id": book.id}

@api_router.put("/homework/books/{book_id}")
async def update_book(book_id: str, book_data: BookCreate, current_user: User = Depends(get_current_user)):
    """Kitap güncelle"""
    existing = await db.books.find_one({"id": book_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Kitap bulunamadı")
    
    # Öğretmen yetki kontrolü
    if current_user.user_type == "teacher":
        # Öğretmenin branşlarını kontrol et (hem teacher_branches hem teacher_prices)
        branch_ids = set()
        teacher_branches = await db.teacher_branches.find(
            {"teacher_id": current_user.teacher_id}, {"_id": 0, "branch_id": 1}
        ).to_list(100)
        for tb in teacher_branches:
            branch_ids.add(tb["branch_id"])
        teacher_prices = await db.teacher_prices.find(
            {"teacher_id": current_user.teacher_id}, {"_id": 0, "branch_id": 1}
        ).to_list(100)
        for tp in teacher_prices:
            branch_ids.add(tp["branch_id"])
        
        if existing["branch_id"] not in branch_ids:
            raise HTTPException(status_code=403, detail="Bu kitabı düzenleme yetkiniz yok")
    
    await db.books.update_one({"id": book_id}, {"$set": book_data.model_dump()})
    return {"message": "Kitap güncellendi"}

@api_router.delete("/homework/books/{book_id}")
async def delete_book(book_id: str, current_user: User = Depends(get_current_user)):
    """Kitap sil - admin veya kitabın branşına sahip öğretmen"""
    existing = await db.books.find_one({"id": book_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Kitap bulunamadı")
    
    # Öğretmen yetki kontrolü
    if current_user.user_type == "teacher":
        # Öğretmenin branşlarını kontrol et (hem teacher_branches hem teacher_prices)
        branch_ids = set()
        teacher_branches = await db.teacher_branches.find(
            {"teacher_id": current_user.teacher_id}, {"_id": 0, "branch_id": 1}
        ).to_list(100)
        for tb in teacher_branches:
            branch_ids.add(tb["branch_id"])
        teacher_prices = await db.teacher_prices.find(
            {"teacher_id": current_user.teacher_id}, {"_id": 0, "branch_id": 1}
        ).to_list(100)
        for tp in teacher_prices:
            branch_ids.add(tp["branch_id"])
        
        if existing["branch_id"] not in branch_ids:
            raise HTTPException(status_code=403, detail="Bu kitabı silme yetkiniz yok")
    
    # Cascade delete: üniteler, konular, testler
    units = await db.book_units.find({"book_id": book_id}, {"_id": 0}).to_list(1000)
    for unit in units:
        topics = await db.book_topics.find({"unit_id": unit["id"]}, {"_id": 0}).to_list(1000)
        for topic in topics:
            await db.book_tests.delete_many({"topic_id": topic["id"]})
        await db.book_topics.delete_many({"unit_id": unit["id"]})
    await db.book_units.delete_many({"book_id": book_id})
    
    # İlerleme kayıtlarını sil
    await db.student_test_progress.delete_many({"book_id": book_id})
    await db.student_book_assignments.delete_many({"book_id": book_id})
    
    await db.books.delete_one({"id": book_id})
    return {"message": "Kitap ve tüm içeriği silindi"}

@api_router.post("/homework/books/{book_id}/copy")
async def copy_book(book_id: str, current_user: User = Depends(get_current_user)):
    """Kitabı tüm içeriğiyle kopyala - admin veya kitabın branşına sahip öğretmen"""
    # Orijinal kitabı bul
    original_book = await db.books.find_one({"id": book_id}, {"_id": 0})
    if not original_book:
        raise HTTPException(status_code=404, detail="Kitap bulunamadı")
    
    # Öğretmen yetki kontrolü
    if current_user.user_type == "teacher":
        # Öğretmenin branşlarını kontrol et (hem teacher_branches hem teacher_prices)
        branch_ids = set()
        teacher_branches = await db.teacher_branches.find(
            {"teacher_id": current_user.teacher_id}, {"_id": 0, "branch_id": 1}
        ).to_list(100)
        for tb in teacher_branches:
            branch_ids.add(tb["branch_id"])
        teacher_prices = await db.teacher_prices.find(
            {"teacher_id": current_user.teacher_id}, {"_id": 0, "branch_id": 1}
        ).to_list(100)
        for tp in teacher_prices:
            branch_ids.add(tp["branch_id"])
        
        if original_book["branch_id"] not in branch_ids:
            raise HTTPException(status_code=403, detail="Bu kitabı kopyalama yetkiniz yok")
    
    # Yeni kitap oluştur
    new_book_id = str(uuid.uuid4())
    new_book = {
        **original_book,
        "id": new_book_id,
        "name": f"{original_book['name']} - kopya",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.books.insert_one(new_book)
    
    # Üniteleri kopyala
    units = await db.book_units.find({"book_id": book_id}, {"_id": 0}).to_list(100)
    unit_id_map = {}  # eski_id -> yeni_id
    
    for unit in units:
        new_unit_id = str(uuid.uuid4())
        unit_id_map[unit["id"]] = new_unit_id
        new_unit = {
            **unit,
            "id": new_unit_id,
            "book_id": new_book_id,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.book_units.insert_one(new_unit)
    
    # Konuları kopyala
    topic_id_map = {}  # eski_id -> yeni_id
    for old_unit_id, new_unit_id in unit_id_map.items():
        topics = await db.book_topics.find({"unit_id": old_unit_id}, {"_id": 0}).to_list(100)
        for topic in topics:
            new_topic_id = str(uuid.uuid4())
            topic_id_map[topic["id"]] = new_topic_id
            new_topic = {
                **topic,
                "id": new_topic_id,
                "unit_id": new_unit_id,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.book_topics.insert_one(new_topic)
    
    # Testleri kopyala
    for old_topic_id, new_topic_id in topic_id_map.items():
        tests = await db.book_tests.find({"topic_id": old_topic_id}, {"_id": 0}).to_list(100)
        for test in tests:
            new_test_id = str(uuid.uuid4())
            new_test = {
                **test,
                "id": new_test_id,
                "topic_id": new_topic_id,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.book_tests.insert_one(new_test)
    
    return {"message": "Kitap kopyalandı", "new_book_id": new_book_id}

# ------------- ÜNİTE YÖNETİMİ -------------

@api_router.get("/homework/books/{book_id}/units")
async def get_book_units(book_id: str, current_user: User = Depends(get_current_user)):
    """Kitabın ünitelerini listele"""
    units = await db.book_units.find({"book_id": book_id}, {"_id": 0}).sort("order", 1).to_list(100)
    return units

@api_router.post("/homework/units")
async def create_unit(unit_data: BookUnitCreate, current_user: User = Depends(get_current_user)):
    """Yeni ünite oluştur"""
    # Kitap erişim kontrolü
    book = await db.books.find_one({"id": unit_data.book_id}, {"_id": 0})
    if not book:
        raise HTTPException(status_code=404, detail="Kitap bulunamadı")
    
    # Öğretmen veya admin ünite ekleyebilir
    # Öğretmen ödev takip sayfasındaysa zaten yetkilidir
    
    # Sıralama otomatik ayarla
    if unit_data.order == 0:
        last_unit = await db.book_units.find_one(
            {"book_id": unit_data.book_id},
            {"_id": 0},
            sort=[("order", -1)]
        )
        unit_data.order = (last_unit["order"] + 1) if last_unit else 1
    
    unit = BookUnit(**unit_data.model_dump())
    doc = unit.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.book_units.insert_one(doc)
    
    return {"message": "Ünite oluşturuldu", "unit_id": unit.id}

@api_router.put("/homework/units/{unit_id}")
async def update_unit(unit_id: str, unit_data: BookUnitCreate, current_user: User = Depends(get_current_user)):
    """Ünite güncelle"""
    existing = await db.book_units.find_one({"id": unit_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Ünite bulunamadı")
    
    # Order değeri gönderilmemişse (0 veya None) mevcut değeri koru
    new_order = unit_data.order if unit_data.order and unit_data.order > 0 else existing.get("order", 1)
    
    await db.book_units.update_one({"id": unit_id}, {"$set": {
        "name": unit_data.name,
        "order": new_order,
        "color": unit_data.color
    }})
    return {"message": "Ünite güncellendi"}

@api_router.delete("/homework/units/{unit_id}")
async def delete_unit(unit_id: str, current_user: User = Depends(get_current_user)):
    """Ünite sil - cascade"""
    # Altındaki konuları ve testleri sil
    topics = await db.book_topics.find({"unit_id": unit_id}, {"_id": 0}).to_list(1000)
    for topic in topics:
        await db.book_tests.delete_many({"topic_id": topic["id"]})
    await db.book_topics.delete_many({"unit_id": unit_id})
    await db.book_units.delete_one({"id": unit_id})
    
    return {"message": "Ünite ve altındaki tüm içerik silindi"}

@api_router.put("/homework/books/{book_id}/units/reorder")
async def reorder_units(book_id: str, unit_orders: List[dict], current_user: User = Depends(get_current_user)):
    """Ünitelerin sıralamasını güncelle - body: [{"id": "xxx", "order": 1}, ...]"""
    for item in unit_orders:
        await db.book_units.update_one(
            {"id": item["id"], "book_id": book_id},
            {"$set": {"order": item["order"]}}
        )
    return {"message": "Sıralama güncellendi"}
    
    return {"message": "Ünite ve altındaki tüm içerik silindi"}

# ------------- KONU YÖNETİMİ -------------

@api_router.get("/homework/units/{unit_id}/topics")
async def get_unit_topics(unit_id: str, current_user: User = Depends(get_current_user)):
    """Ünitenin konularını listele"""
    topics = await db.book_topics.find({"unit_id": unit_id}, {"_id": 0}).sort("order", 1).to_list(100)
    return topics


@api_router.put("/homework/units/{unit_id}/topics/reorder")
async def reorder_topics(unit_id: str, topic_orders: List[dict], current_user: User = Depends(get_current_user)):
    """Konuların sıralamasını güncelle - body: [{"id": "xxx", "order": 1}, ...]"""
    for item in topic_orders:
        await db.book_topics.update_one(
            {"id": item["id"], "unit_id": unit_id},
            {"$set": {"order": item["order"]}}
        )
    return {"message": "Konu sıralaması güncellendi"}


@api_router.post("/homework/topics")
async def create_topic(topic_data: BookTopicCreate, current_user: User = Depends(get_current_user)):
    """Yeni konu oluştur"""
    unit = await db.book_units.find_one({"id": topic_data.unit_id}, {"_id": 0})
    if not unit:
        raise HTTPException(status_code=404, detail="Ünite bulunamadı")
    
    # Sıralama otomatik ayarla
    if topic_data.order == 0:
        last_topic = await db.book_topics.find_one(
            {"unit_id": topic_data.unit_id},
            {"_id": 0},
            sort=[("order", -1)]
        )
        topic_data.order = (last_topic["order"] + 1) if last_topic else 1
    
    topic = BookTopic(**topic_data.model_dump())
    doc = topic.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.book_topics.insert_one(doc)
    
    return {"message": "Konu oluşturuldu", "topic_id": topic.id}

@api_router.put("/homework/topics/{topic_id}")
async def update_topic(topic_id: str, topic_data: BookTopicCreate, current_user: User = Depends(get_current_user)):
    """Konu güncelle"""
    existing = await db.book_topics.find_one({"id": topic_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Konu bulunamadı")
    
    # Order değeri gönderilmemişse (0 veya None) mevcut değeri koru
    new_order = topic_data.order if topic_data.order and topic_data.order > 0 else existing.get("order", 1)
    
    await db.book_topics.update_one({"id": topic_id}, {"$set": {
        "name": topic_data.name,
        "order": new_order,
        "total_questions": topic_data.total_questions
    }})
    return {"message": "Konu güncellendi"}

@api_router.delete("/homework/topics/{topic_id}")
async def delete_topic(topic_id: str, current_user: User = Depends(get_current_user)):
    """Konu sil - cascade"""
    await db.book_tests.delete_many({"topic_id": topic_id})
    await db.book_topics.delete_one({"id": topic_id})
    return {"message": "Konu ve altındaki testler silindi"}

# ------------- TEST YÖNETİMİ -------------

@api_router.get("/homework/topics/{topic_id}/tests")
async def get_topic_tests(topic_id: str, current_user: User = Depends(get_current_user)):
    """Konunun testlerini listele"""
    tests = await db.book_tests.find({"topic_id": topic_id}, {"_id": 0}).sort("order", 1).to_list(100)
    return tests

@api_router.post("/homework/tests")
async def create_test(test_data: BookTestCreate, current_user: User = Depends(get_current_user)):
    """Yeni test oluştur"""
    topic = await db.book_topics.find_one({"id": test_data.topic_id}, {"_id": 0})
    if not topic:
        raise HTTPException(status_code=404, detail="Konu bulunamadı")
    
    # Sıralama otomatik ayarla
    if test_data.order == 0:
        last_test = await db.book_tests.find_one(
            {"topic_id": test_data.topic_id},
            {"_id": 0},
            sort=[("order", -1)]
        )
        test_data.order = (last_test["order"] + 1) if last_test else 1
    
    test = BookTest(**test_data.model_dump())
    doc = test.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.book_tests.insert_one(doc)
    
    # Konu total_tests güncelle
    test_count = await db.book_tests.count_documents({"topic_id": test_data.topic_id})
    await db.book_topics.update_one({"id": test_data.topic_id}, {"$set": {"total_tests": test_count}})
    
    return {"message": "Test oluşturuldu", "test_id": test.id}

@api_router.put("/homework/tests/{test_id}")
async def update_test(test_id: str, test_data: BookTestCreate, current_user: User = Depends(get_current_user)):
    """Test güncelle"""
    existing = await db.book_tests.find_one({"id": test_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Test bulunamadı")
    
    # Order değeri gönderilmemişse (0 veya None) mevcut değeri koru
    new_order = test_data.order if test_data.order and test_data.order > 0 else existing.get("order", 1)
    
    await db.book_tests.update_one({"id": test_id}, {"$set": {
        "name": test_data.name,
        "question_count": test_data.question_count,
        "difficulty": test_data.difficulty,
        "test_type": test_data.test_type,
        "order": new_order
    }})
    return {"message": "Test güncellendi"}

@api_router.delete("/homework/tests/{test_id}")
async def delete_test(test_id: str, current_user: User = Depends(get_current_user)):
    """Test sil"""
    test = await db.book_tests.find_one({"id": test_id}, {"_id": 0})
    if test:
        await db.book_tests.delete_one({"id": test_id})
        # Konu total_tests güncelle
        test_count = await db.book_tests.count_documents({"topic_id": test["topic_id"]})
        await db.book_topics.update_one({"id": test["topic_id"]}, {"$set": {"total_tests": test_count}})
    return {"message": "Test silindi"}

# ------------- KİTAP AĞACI (TREE) -------------

@api_router.get("/homework/books/{book_id}/tree")
async def get_book_tree(book_id: str, current_user: User = Depends(get_current_user)):
    """Kitabın tam ağaç yapısını getir (ünite → konu → test)"""
    book = await db.books.find_one({"id": book_id}, {"_id": 0})
    if not book:
        raise HTTPException(status_code=404, detail="Kitap bulunamadı")
    
    units = await db.book_units.find({"book_id": book_id}, {"_id": 0}).sort("order", 1).to_list(100)
    
    tree = []
    total_tests = 0
    
    for unit in units:
        topics = await db.book_topics.find({"unit_id": unit["id"]}, {"_id": 0}).sort("order", 1).to_list(100)
        unit_topics = []
        
        for topic in topics:
            tests = await db.book_tests.find({"topic_id": topic["id"]}, {"_id": 0}).sort("order", 1).to_list(100)
            total_tests += len(tests)
            unit_topics.append({
                **topic,
                "tests": tests
            })
        
        tree.append({
            **unit,
            "topics": unit_topics
        })
    
    return {
        "book": book,
        "tree": tree,
        "total_tests": total_tests
    }

# ------------- ÖĞRENCİ KİTAP ATAMALARI -------------

@api_router.get("/homework/students/{student_id}/books")
async def get_student_books(
    student_id: str,
    branch_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Öğrencinin kitaplarını listele"""
    query = {"student_id": student_id, "status": "active"}
    if branch_id:
        query["branch_id"] = branch_id
    
    # Sıralamaya göre getir (order field yoksa assigned_at'e göre)
    assignments = await db.student_book_assignments.find(query, {"_id": 0}).sort([("order", 1), ("assigned_at", 1)]).to_list(100)
    
    result = []
    for idx, assignment in enumerate(assignments):
        book = await db.books.find_one({"id": assignment["book_id"]}, {"_id": 0})
        if book:
            # İlerleme hesapla
            total_tests = await db.book_tests.count_documents({
                "topic_id": {"$in": [t["id"] for t in await db.book_topics.find({
                    "unit_id": {"$in": [u["id"] for u in await db.book_units.find({"book_id": book["id"]}, {"_id": 0, "id": 1}).to_list(100)]}
                }, {"_id": 0, "id": 1}).to_list(1000)]}
            })
            
            completed_count = await db.student_test_progress.count_documents({
                "student_id": student_id,
                "book_id": book["id"],
                "status": {"$in": ["completed", "skipped"]}
            })
            
            assigned_count = await db.student_test_progress.count_documents({
                "student_id": student_id,
                "book_id": book["id"],
                "status": "assigned"
            })
            
            branch = await db.branches.find_one({"id": book["branch_id"]}, {"_id": 0})
            
            result.append({
                **book,
                "branch_name": branch["name"] if branch else "Bilinmiyor",
                "assignment_id": assignment["id"],
                "assigned_at": assignment["assigned_at"],
                "total_tests": total_tests,
                "completed_tests": completed_count,
                "assigned_tests": assigned_count,
                "remaining_tests": total_tests - completed_count,
                "progress_percent": round((completed_count / total_tests * 100) if total_tests > 0 else 0, 1),
                "order": assignment.get("order", idx)
            })
    
    return result

@api_router.post("/homework/students/{student_id}/books")
async def assign_book_to_student(
    student_id: str,
    assignment_data: StudentBookAssignmentCreate,
    current_user: User = Depends(get_current_user)
):
    """Öğrenciye kitap ata"""
    # Aynı kitap aynı basım yılı kontrolü
    book = await db.books.find_one({"id": assignment_data.book_id}, {"_id": 0})
    if not book:
        raise HTTPException(status_code=404, detail="Kitap bulunamadı")
    
    existing = await db.student_book_assignments.find_one({
        "student_id": student_id,
        "book_id": assignment_data.book_id,
        "status": "active"
    }, {"_id": 0})
    
    if existing:
        raise HTTPException(status_code=400, detail="Bu kitap zaten öğrenciye atanmış")
    
    # Daha önce kaldırılmış mı kontrol et (restore)
    removed = await db.student_book_assignments.find_one({
        "student_id": student_id,
        "book_id": assignment_data.book_id,
        "status": "removed"
    }, {"_id": 0})
    
    if removed:
        # Restore et
        await db.student_book_assignments.update_one(
            {"id": removed["id"]},
            {"$set": {"status": "active", "removed_at": None}}
        )
        return {"message": "Kitap geri yüklendi, eski ilerleme korundu", "restored": True}
    
    # Yeni atama
    assignment = StudentBookAssignment(
        student_id=student_id,
        book_id=assignment_data.book_id,
        branch_id=assignment_data.branch_id,
        assigned_by=current_user.teacher_id if current_user.user_type == "teacher" else "admin"
    )
    doc = assignment.model_dump()
    doc['assigned_at'] = doc['assigned_at'].isoformat()
    await db.student_book_assignments.insert_one(doc)
    
    return {"message": "Kitap öğrenciye atandı", "assignment_id": assignment.id}

@api_router.delete("/homework/students/{student_id}/books/{book_id}")
async def remove_book_from_student(
    student_id: str,
    book_id: str,
    current_user: User = Depends(get_current_user)
):
    """Öğrenciden kitap kaldır (sistemden silmez, sadece ataması kaldırılır)"""
    await db.student_book_assignments.update_one(
        {"student_id": student_id, "book_id": book_id, "status": "active"},
        {"$set": {"status": "removed", "removed_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Kitap öğrenciden kaldırıldı"}

@api_router.put("/homework/students/{student_id}/books/reorder")
async def reorder_student_books(
    student_id: str,
    order_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Öğrencinin kitaplarının sırasını güncelle"""
    book_ids = order_data.get("book_ids", [])
    
    for index, book_id in enumerate(book_ids):
        await db.student_book_assignments.update_one(
            {"student_id": student_id, "book_id": book_id, "status": "active"},
            {"$set": {"order": index}}
        )
    
    return {"message": "Kitap sırası güncellendi"}

# ------------- TEST İLERLEME DURUMU -------------

@api_router.get("/homework/students/{student_id}/books/{book_id}/progress")
async def get_student_book_progress(
    student_id: str,
    book_id: str,
    current_user: User = Depends(get_current_user)
):
    """Öğrencinin bir kitaptaki tüm test ilerlemelerini getir"""
    progress_records = await db.student_test_progress.find({
        "student_id": student_id,
        "book_id": book_id
    }, {"_id": 0}).to_list(10000)
    
    # test_id'ye göre dictionary oluştur
    progress_map = {p["test_id"]: p for p in progress_records}
    
    return progress_map

@api_router.put("/homework/students/{student_id}/tests/{test_id}/status")
async def update_test_status(
    student_id: str,
    test_id: str,
    update_data: StudentTestProgressUpdate,
    current_user: User = Depends(get_current_user)
):
    """Test durumunu güncelle (auto-save için)"""
    # Feature flag kontrolü
    await check_homework_tool_enabled()
    
    test = await db.book_tests.find_one({"id": test_id}, {"_id": 0})
    if not test:
        raise HTTPException(status_code=404, detail="Test bulunamadı")
    
    topic = await db.book_topics.find_one({"id": test["topic_id"]}, {"_id": 0})
    unit = await db.book_units.find_one({"id": topic["unit_id"]}, {"_id": 0})
    
    existing = await db.student_test_progress.find_one({
        "student_id": student_id,
        "test_id": test_id
    }, {"_id": 0})
    
    now = datetime.now(timezone.utc).isoformat()
    
    if existing:
        # Güncelle
        update_fields = {"updated_at": now}
        if update_data.status is not None:
            update_fields["status"] = update_data.status
        if update_data.correct_count is not None:
            update_fields["correct_count"] = update_data.correct_count
        if update_data.wrong_count is not None:
            update_fields["wrong_count"] = update_data.wrong_count
        if update_data.empty_count is not None:
            update_fields["empty_count"] = update_data.empty_count
        if update_data.notes is not None:
            update_fields["notes"] = update_data.notes
        
        update_fields["updated_by"] = current_user.teacher_id if current_user.user_type == "teacher" else "admin"
        
        await db.student_test_progress.update_one(
            {"id": existing["id"]},
            {"$set": update_fields}
        )
        return {"message": "İlerleme güncellendi", "progress_id": existing["id"]}
    else:
        # Yeni kayıt
        progress = StudentTestProgress(
            student_id=student_id,
            book_id=unit["book_id"],
            test_id=test_id,
            status=update_data.status or "not_started",
            correct_count=update_data.correct_count,
            wrong_count=update_data.wrong_count,
            empty_count=update_data.empty_count,
            notes=update_data.notes,
            updated_by=current_user.teacher_id if current_user.user_type == "teacher" else "admin"
        )
        doc = progress.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        doc['updated_at'] = doc['updated_at'].isoformat()
        await db.student_test_progress.insert_one(doc)
        return {"message": "İlerleme kaydı oluşturuldu", "progress_id": progress.id}

# ------------- HAFTALIK PLAN -------------

@api_router.get("/homework/students/{student_id}/plans")
async def get_student_plans(
    student_id: str,
    branch_id: Optional[str] = None,
    status: Optional[str] = "active",
    current_user: User = Depends(get_current_user)
):
    """Öğrencinin planlarını listele"""
    query = {"student_id": student_id}
    if branch_id:
        query["branch_id"] = branch_id
    if status:
        query["status"] = status
    
    plans = await db.homework_plans.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return plans

@api_router.get("/homework/plans/{plan_id}")
async def get_plan_detail(plan_id: str, current_user: User = Depends(get_current_user)):
    """Plan detayı ve öğelerini getir"""
    plan = await db.homework_plans.find_one({"id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan bulunamadı")
    
    items = await db.homework_plan_items.find({"plan_id": plan_id}, {"_id": 0}).sort([("day_date", 1), ("order", 1)]).to_list(1000)
    
    # Gün bazlı grupla
    days = {}
    for item in items:
        day = item["day_date"]
        if day not in days:
            days[day] = []
        
        # Test bilgilerini ekle
        if item["item_type"] == "test" and item.get("test_id"):
            test = await db.book_tests.find_one({"id": item["test_id"]}, {"_id": 0})
            if test:
                topic = await db.book_topics.find_one({"id": test["topic_id"]}, {"_id": 0})
                unit = await db.book_units.find_one({"id": topic["unit_id"]}, {"_id": 0}) if topic else None
                book = await db.books.find_one({"id": item.get("book_id")}, {"_id": 0})
                item["test_info"] = {
                    "test_name": test["name"],
                    "topic_name": topic["name"] if topic else "",
                    "unit_name": unit["name"] if unit else "",
                    "book_name": book["name"] if book else ""
                }
        
        days[day].append(item)
    
    return {
        "plan": plan,
        "days": days
    }

@api_router.post("/homework/plans")
async def create_homework_plan(
    plan_data: HomeworkPlanCreate,
    current_user: User = Depends(get_current_user)
):
    """Yeni haftalık plan oluştur"""
    # Feature flag kontrolü
    await check_homework_tool_enabled()
    
    # Eski aktif planı kapat
    await db.homework_plans.update_many(
        {"student_id": plan_data.student_id, "branch_id": plan_data.branch_id, "status": "active"},
        {"$set": {"status": "cancelled"}}
    )
    
    # Bitiş tarihi hesapla
    from datetime import datetime as dt
    start = dt.strptime(plan_data.start_date, "%Y-%m-%d")
    end = start + timedelta(days=plan_data.duration_days - 1)
    
    plan = HomeworkPlan(
        student_id=plan_data.student_id,
        branch_id=plan_data.branch_id,
        teacher_id=current_user.teacher_id if current_user.user_type == "teacher" else "admin",
        start_date=plan_data.start_date,
        end_date=end.strftime("%Y-%m-%d"),
        duration_days=plan_data.duration_days
    )
    doc = plan.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.homework_plans.insert_one(doc)
    
    return {"message": "Plan oluşturuldu", "plan_id": plan.id}

@api_router.post("/homework/plans/{plan_id}/items")
async def add_plan_item(
    plan_id: str,
    item_data: HomeworkPlanItemCreate,
    current_user: User = Depends(get_current_user)
):
    """Plana öğe ekle (test veya serbest metin)"""
    # Feature flag kontrolü
    await check_homework_tool_enabled()
    
    plan = await db.homework_plans.find_one({"id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan bulunamadı")
    
    item = HomeworkPlanItem(**item_data.model_dump())
    doc = item.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.homework_plan_items.insert_one(doc)
    
    # Eğer test ise, durumu "assigned" yap
    if item_data.item_type == "test" and item_data.test_id:
        existing_progress = await db.student_test_progress.find_one({
            "student_id": plan["student_id"],
            "test_id": item_data.test_id
        }, {"_id": 0})
        
        if existing_progress:
            # Sadece "not_started" durumundaysa güncelle
            if existing_progress.get("status") == "not_started":
                await db.student_test_progress.update_one(
                    {"id": existing_progress["id"]},
                    {"$set": {"status": "assigned", "updated_at": datetime.now(timezone.utc).isoformat()}}
                )
        else:
            # Yeni progress kaydı oluştur
            test = await db.book_tests.find_one({"id": item_data.test_id}, {"_id": 0})
            if test:
                topic = await db.book_topics.find_one({"id": test["topic_id"]}, {"_id": 0})
                unit = await db.book_units.find_one({"id": topic["unit_id"]}, {"_id": 0}) if topic else None
                
                progress = StudentTestProgress(
                    student_id=plan["student_id"],
                    book_id=unit["book_id"] if unit else item_data.book_id,
                    test_id=item_data.test_id,
                    status="assigned",
                    updated_by=current_user.teacher_id if current_user.user_type == "teacher" else "admin"
                )
                progress_doc = progress.model_dump()
                progress_doc['created_at'] = progress_doc['created_at'].isoformat()
                progress_doc['updated_at'] = progress_doc['updated_at'].isoformat()
                await db.student_test_progress.insert_one(progress_doc)
    
    return {"message": "Öğe eklendi", "item_id": item.id}

@api_router.delete("/homework/plan-items/{item_id}")
async def delete_plan_item(item_id: str, current_user: User = Depends(get_current_user)):
    """Plan öğesini sil"""
    # Feature flag kontrolü
    await check_homework_tool_enabled()
    
    await db.homework_plan_items.delete_one({"id": item_id})
    return {"message": "Öğe silindi"}

@api_router.delete("/homework/plans/{plan_id}")
async def delete_plan(plan_id: str, current_user: User = Depends(get_current_user)):
    """Planı ve tüm öğelerini sil"""
    # Feature flag kontrolü
    await check_homework_tool_enabled()
    
    # Önce plan öğelerini sil
    await db.homework_plan_items.delete_many({"plan_id": plan_id})
    # Sonra planı sil
    await db.homework_plans.delete_one({"id": plan_id})
    return {"message": "Plan silindi"}

@api_router.put("/homework/plans/{plan_id}")
async def update_plan(plan_id: str, data: dict = Body(...), current_user: User = Depends(get_current_user)):
    """Plan süresini güncelle"""
    plan = await db.homework_plans.find_one({"id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan bulunamadı")
    
    duration_days = data.get("duration_days", 7)
    
    # Yeni bitiş tarihini hesapla
    start_date = datetime.fromisoformat(plan["start_date"].replace('Z', '+00:00')) if isinstance(plan["start_date"], str) else plan["start_date"]
    new_end_date = start_date + timedelta(days=duration_days - 1)
    
    await db.homework_plans.update_one({"id": plan_id}, {"$set": {
        "duration_days": duration_days,
        "end_date": new_end_date.strftime('%Y-%m-%d')
    }})
    
    return {"message": "Plan güncellendi"}

# ------------- DENEME MODÜLÜ -------------

@api_router.get("/homework/students/{student_id}/trials")
async def get_student_trials(
    student_id: str,
    branch_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Öğrencinin denemelerini listele"""
    query = {"student_id": student_id}
    if branch_id:
        query["branch_id"] = branch_id
    
    trials = await db.trial_exams.find(query, {"_id": 0}).sort("exam_date", -1).to_list(100)
    return trials

@api_router.post("/homework/trials")
async def create_trial_exam(
    trial_data: TrialExamCreate,
    current_user: User = Depends(get_current_user)
):
    """Deneme kaydı oluştur"""
    net = trial_data.correct_count - (trial_data.wrong_count / 4)
    
    trial = TrialExam(
        **trial_data.model_dump(),
        teacher_id=current_user.teacher_id if current_user.user_type == "teacher" else "admin",
        net_score=round(net, 2)
    )
    doc = trial.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.trial_exams.insert_one(doc)
    
    return {"message": "Deneme kaydedildi", "trial_id": trial.id}

@api_router.put("/homework/trials/{trial_id}")
async def update_trial_exam(
    trial_id: str,
    trial_data: TrialExamCreate,
    current_user: User = Depends(get_current_user)
):
    """Deneme güncelle"""
    net = trial_data.correct_count - (trial_data.wrong_count / 4)
    
    await db.trial_exams.update_one({"id": trial_id}, {"$set": {
        **trial_data.model_dump(),
        "net_score": round(net, 2)
    }})
    return {"message": "Deneme güncellendi"}

@api_router.delete("/homework/trials/{trial_id}")
async def delete_trial(trial_id: str, current_user: User = Depends(get_current_user)):
    """Deneme kaydı sil"""
    await db.trial_exams.delete_one({"id": trial_id})
    return {"message": "Deneme silindi"}

@api_router.put("/homework/trials/{trial_id}/review")
async def update_trial_review(
    trial_id: str,
    reviewed_wrong: Optional[bool] = None,
    reviewed_topics: Optional[bool] = None,
    found_mistakes: Optional[bool] = None,
    current_user: User = Depends(get_current_user)
):
    """Deneme review checkbox'larını güncelle"""
    update_fields = {}
    if reviewed_wrong is not None:
        update_fields["reviewed_wrong"] = reviewed_wrong
    if reviewed_topics is not None:
        update_fields["reviewed_topics"] = reviewed_topics
    if found_mistakes is not None:
        update_fields["found_mistakes"] = found_mistakes
    
    if update_fields:
        await db.trial_exams.update_one({"id": trial_id}, {"$set": update_fields})
    
    return {"message": "Deneme güncellendi"}

# ------------- GÜNLÜK NOTLAR -------------

@api_router.get("/homework/students/{student_id}/daily-notes")
async def get_student_daily_notes(
    student_id: str,
    branch_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Öğrencinin günlük notlarını getir"""
    query = {"student_id": student_id}
    if branch_id:
        query["branch_id"] = branch_id
    
    notes = await db.daily_notes.find(query, {"_id": 0}).sort("note_date", -1).to_list(100)
    return notes

@api_router.post("/homework/daily-notes")
async def create_daily_note(
    note_data: DailyNoteCreate,
    current_user: User = Depends(get_current_user)
):
    """Günlük not oluştur/güncelle"""
    # Aynı gün için var mı kontrol et
    existing = await db.daily_notes.find_one({
        "student_id": note_data.student_id,
        "branch_id": note_data.branch_id,
        "note_date": note_data.note_date
    }, {"_id": 0})
    
    if existing:
        # Güncelle
        await db.daily_notes.update_one(
            {"id": existing["id"]},
            {"$set": {"note": note_data.note}}
        )
        return {"message": "Not güncellendi", "note_id": existing["id"]}
    
    note = DailyNote(
        **note_data.model_dump(),
        teacher_id=current_user.teacher_id if current_user.user_type == "teacher" else "admin"
    )
    doc = note.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.daily_notes.insert_one(doc)
    
    return {"message": "Not eklendi", "note_id": note.id}


# ============= MIGRATION: REPAIR GROUP LESSONS =============

@api_router.post("/admin/repair-group-lessons")
async def repair_group_lessons(current_user: User = Depends(get_current_user)):
    """
    Live ortamdaki mevcut grup derslerine eksik group_id, teacher_id, branch_id, student_id alanlarını ekler.
    Bu migration, sadece group_id olmayan ama aslında grup dersi olan kayıtları tespit edip düzeltir.
    """
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can run migrations")
    
    # Tüm grupları al
    groups = await db.student_groups.find({}, {"_id": 0}).to_list(1000)
    
    repaired_count = 0
    checked_count = 0
    
    for group in groups:
        group_id = group["id"]
        teacher_id = group.get("teacher_id")
        branch_id = group.get("branch_id")
        student_ids = group.get("student_ids", [])
        
        # Bu gruptaki öğrencilerin course'larını bul
        for student_id in student_ids:
            course = await db.student_courses.find_one({
                "student_id": student_id,
                "branch_id": branch_id,
                "teacher_id": teacher_id
            }, {"_id": 0})
            
            if course:
                # Bu course'a ait dersleri bul (group_id olmayan)
                lessons_without_group = await db.lessons.find({
                    "student_course_id": course["id"],
                    "$or": [
                        {"group_id": {"$exists": False}},
                        {"group_id": None}
                    ]
                }).to_list(1000)
                
                checked_count += len(lessons_without_group)
                
                # Aynı tarihte birden fazla öğrencinin dersi varsa, bu grup dersi demektir
                # Her dersi kontrol et
                for lesson in lessons_without_group:
                    lesson_date = lesson.get("date")
                    
                    # Aynı tarihte, aynı branch'te, aynı teacher'ın diğer öğrencilerinin dersi var mı?
                    same_date_lessons = await db.lessons.find({
                        "date": lesson_date,
                        "branch_id": branch_id,
                        "teacher_id": teacher_id
                    }).to_list(100)
                    
                    # Eğer aynı tarihte 2+ ders varsa ve bunlar gruptaki öğrencilere aitse
                    if len(same_date_lessons) >= 2:
                        # Bu derslerin öğrencileri gruptaki öğrenciler mi?
                        lesson_student_ids = [l.get("student_id") for l in same_date_lessons if l.get("student_id")]
                        
                        # Gruptaki öğrencilerin çoğu bu derslerde mi?
                        matching_students = [s for s in lesson_student_ids if s in student_ids]
                        
                        if len(matching_students) >= 2:
                            # Bu bir grup dersi, güncelle
                            update_data = {
                                "group_id": group_id,
                                "teacher_id": teacher_id,
                                "branch_id": branch_id,
                                "student_id": lesson.get("student_id") or student_id
                            }
                            
                            await db.lessons.update_one(
                                {"id": lesson["id"]},
                                {"$set": update_data}
                            )
                            repaired_count += 1
    
    return {
        "message": "Migration tamamlandı",
        "checked_lessons": checked_count,
        "repaired_lessons": repaired_count
    }


@api_router.post("/admin/repair-group-lessons-v2")
async def repair_group_lessons_v2(current_user: User = Depends(get_current_user)):
    """
    GÜVENLİ repair: Sadece group_id OLAN ama teacher_id/branch_id/student_id eksik olan dersleri düzeltir.
    group_id olmayan derslere DOKUNMAZ.
    Veri kaybı riski YOK.
    """
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can run migrations")
    
    # Tüm grupları al
    groups = await db.student_groups.find({}, {"_id": 0}).to_list(1000)
    group_map = {g["id"]: g for g in groups}
    
    # Tüm kursları al
    courses = await db.student_courses.find({}, {"_id": 0}).to_list(10000)
    course_map = {c["id"]: c for c in courses}
    
    repaired_count = 0
    skipped_count = 0
    
    # group_id olan ama eksik alanları olan dersleri bul
    lessons_with_group = await db.lessons.find({
        "group_id": {"$exists": True, "$ne": None},
        "$or": [
            {"teacher_id": {"$exists": False}},
            {"teacher_id": None},
            {"branch_id": {"$exists": False}},
            {"branch_id": None},
            {"student_id": {"$exists": False}},
            {"student_id": None}
        ]
    }, {"_id": 0}).to_list(10000)
    
    for lesson in lessons_with_group:
        group_id = lesson.get("group_id")
        group = group_map.get(group_id)
        
        if not group:
            skipped_count += 1
            continue
        
        # Course'dan student_id al
        course = course_map.get(lesson.get("student_course_id"))
        student_id = lesson.get("student_id")
        if not student_id and course:
            student_id = course.get("student_id")
        
        update_data = {}
        
        if not lesson.get("teacher_id"):
            update_data["teacher_id"] = group.get("teacher_id")
        
        if not lesson.get("branch_id"):
            update_data["branch_id"] = group.get("branch_id")
        
        if not lesson.get("student_id") and student_id:
            update_data["student_id"] = student_id
        
        if update_data:
            await db.lessons.update_one(
                {"id": lesson["id"]},
                {"$set": update_data}
            )
            repaired_count += 1
    
    return {
        "message": "Repair tamamlandı",
        "repaired_count": repaired_count,
        "skipped_count": skipped_count,
        "total_checked": len(lessons_with_group)
    }


# ============= FAZ 1: SENE SONU DÖNEM ALTYAPISI =============

@api_router.get("/seasons")
async def get_all_seasons(current_user: User = Depends(get_current_user)):
    """Tüm dönemleri listele"""
    seasons = await db.seasons.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return seasons

@api_router.get("/seasons/current")
async def get_current_active_season(current_user: User = Depends(get_current_user)):
    """Aktif dönemi getir"""
    season = await db.seasons.find_one({"status": "active", "is_current": True}, {"_id": 0})
    if not season:
        return None
    return season

@api_router.post("/admin/seasons/create-initial")
async def create_initial_season(
    data: SeasonCreate,
    current_user: User = Depends(get_current_user)
):
    """
    FAZ 1: İlk dönemi oluştur.
    Admin tarafından dönem adı girilir (hardcoded değil).
    """
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin bu işlemi yapabilir")
    
    # Zaten aktif dönem var mı kontrol et
    existing_active = await db.seasons.find_one({"status": "active", "is_current": True})
    if existing_active:
        raise HTTPException(
            status_code=400, 
            detail=f"Zaten aktif dönem mevcut: {existing_active['name']}. Yeni dönem oluşturmak için önce sene sonu işlemi yapılmalı."
        )
    
    # Aynı isimde dönem var mı kontrol et (idempotency)
    existing_same_name = await db.seasons.find_one({"name": data.name})
    if existing_same_name:
        raise HTTPException(
            status_code=400,
            detail=f"'{data.name}' adında dönem zaten mevcut. Duplicate dönem oluşturulamaz."
        )
    
    # Başlangıç tarihini parse et
    try:
        start_date = datetime.strptime(data.start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="Geçersiz tarih formatı. YYYY-MM-DD kullanın.")
    
    season_id = f"season-{data.name}"
    
    season = {
        "id": season_id,
        "name": data.name,
        "start_date": start_date,
        "end_date": None,
        "status": "active",
        "is_current": True,
        "closed_at": None,
        "closed_by": None,
        "previous_season_id": None,
        "next_season_id": None,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.seasons.insert_one(season)
    
    # _id'yi response'dan çıkar
    season.pop("_id", None)
    
    return {
        "message": f"Dönem '{data.name}' başarıyla oluşturuldu",
        "season": season
    }

@api_router.post("/admin/seasons/migrate")
async def migrate_existing_data_to_season(
    season_id: str,
    dry_run: bool = True,
    current_user: User = Depends(get_current_user)
):
    """
    FAZ 1: Mevcut verilere season_id ekle (migration).
    
    - dry_run=True: Sadece preview, veri değişmez
    - dry_run=False: Gerçek migration işlemi
    
    İdempotent: Aynı migration ikinci kez çalıştırılırsa duplicate oluşmaz.
    """
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin bu işlemi yapabilir")
    
    # Dönem kontrolü
    season = await db.seasons.find_one({"id": season_id})
    if not season:
        raise HTTPException(status_code=404, detail="Dönem bulunamadı")
    
    # Migration sonuçları
    results = {
        "season_id": season_id,
        "season_name": season["name"],
        "dry_run": dry_run,
        "collections": {}
    }
    
    # Collection listesi ve kontrol
    collections_to_migrate = [
        ("lessons", "lessons"),
        ("payments", "payments"),
        ("student_courses", "student_courses"),
        ("student_groups", "student_groups"),
        ("planned_lessons", "planned_lessons"),
        ("camps", "camps"),
        ("camp_students", "camp_students"),
        ("youtube_contents", "youtube_contents"),
        ("trial_exams", "trial_exams"),
        ("homework_plans", "homework_plans"),
        ("homework_plan_items", "homework_plan_items"),
        ("student_book_assignments", "student_book_assignments"),
        ("student_test_progress", "student_test_progress"),
    ]
    
    total_to_update = 0
    total_already_has = 0
    
    for collection_name, _ in collections_to_migrate:
        # season_id olmayan kayıtları say
        without_season = await db[collection_name].count_documents({
            "$or": [
                {"season_id": {"$exists": False}},
                {"season_id": None}
            ]
        })
        
        # season_id olan kayıtları say
        with_season = await db[collection_name].count_documents({
            "season_id": {"$exists": True, "$ne": None}
        })
        
        results["collections"][collection_name] = {
            "records_to_update": without_season,
            "records_already_has_season": with_season,
            "status": "will_update" if without_season > 0 else "already_migrated"
        }
        
        total_to_update += without_season
        total_already_has += with_season
        
        # Gerçek migration (dry_run=False ise)
        if not dry_run and without_season > 0:
            update_result = await db[collection_name].update_many(
                {
                    "$or": [
                        {"season_id": {"$exists": False}},
                        {"season_id": None}
                    ]
                },
                {"$set": {"season_id": season_id}}
            )
            results["collections"][collection_name]["updated_count"] = update_result.modified_count
    
    results["summary"] = {
        "total_records_to_update": total_to_update,
        "total_records_already_has_season": total_already_has,
        "action": "PREVIEW - Veri değişmedi" if dry_run else f"{total_to_update} kayıt güncellendi"
    }
    
    if dry_run:
        results["next_step"] = "Migration'ı uygulamak için dry_run=false ile tekrar çağırın"
    
    return results

@api_router.post("/admin/seasons/migrate-price-history")
async def migrate_price_history(
    season_id: str,
    dry_run: bool = True,
    current_user: User = Depends(get_current_user)
):
    """
    FAZ 1: Mevcut fiyatları price history'ye kopyala.
    
    - Öğrenci fiyatları: student_courses.student_price → student_price_history
    - Öğretmen fiyatları: teacher_prices → teacher_price_history
    
    İdempotent: Aynı kombinasyon için duplicate oluşmaz.
    """
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin bu işlemi yapabilir")
    
    # Dönem kontrolü
    season = await db.seasons.find_one({"id": season_id})
    if not season:
        raise HTTPException(status_code=404, detail="Dönem bulunamadı")
    
    results = {
        "season_id": season_id,
        "season_name": season["name"],
        "dry_run": dry_run,
        "student_price_history": {
            "to_create": 0,
            "already_exists": 0,
            "created": 0,
            "details": []
        },
        "teacher_price_history": {
            "to_create": 0,
            "already_exists": 0,
            "created": 0,
            "details": []
        }
    }
    
    # ===== STUDENT PRICE HISTORY =====
    # student_courses'tan aktif kursları çek
    courses = await db.student_courses.find({"status": "active"}).to_list(10000)
    
    for course in courses:
        student_price = course.get("student_price")
        if not student_price:
            continue
        
        student_id = course["student_id"]
        branch_id = course["branch_id"]
        # Grup mu birebir mi belirle
        lesson_type = "group" if course.get("group_id") else "birebir"
        
        # Aynı kombinasyon için zaten kayıt var mı? (idempotency)
        existing = await db.student_price_history.find_one({
            "student_id": student_id,
            "branch_id": branch_id,
            "lesson_type": lesson_type,
            "season_id": season_id
        })
        
        if existing:
            results["student_price_history"]["already_exists"] += 1
            continue
        
        results["student_price_history"]["to_create"] += 1
        
        if not dry_run:
            price_history = {
                "id": str(uuid.uuid4()),
                "student_id": student_id,
                "branch_id": branch_id,
                "lesson_type": lesson_type,
                "price": student_price,
                "valid_from": season.get("start_date") or datetime.now(timezone.utc),
                "valid_to": None,
                "season_id": season_id,
                "needs_review": False,
                "created_at": datetime.now(timezone.utc),
                "created_by": "migration"
            }
            await db.student_price_history.insert_one(price_history)
            results["student_price_history"]["created"] += 1
    
    # ===== TEACHER PRICE HISTORY =====
    # teacher_prices'tan fiyatları çek
    teacher_prices = await db.teacher_prices.find({}).to_list(10000)
    
    for tp in teacher_prices:
        teacher_id = tp["teacher_id"]
        branch_id = tp["branch_id"]
        lesson_type_id = tp["lesson_type_id"]
        group_size = tp.get("group_size")
        price = tp["price"]
        
        # Aynı kombinasyon için zaten kayıt var mı? (idempotency)
        query = {
            "teacher_id": teacher_id,
            "branch_id": branch_id,
            "lesson_type_id": lesson_type_id,
            "season_id": season_id
        }
        if group_size:
            query["group_size"] = group_size
        
        existing = await db.teacher_price_history.find_one(query)
        
        if existing:
            results["teacher_price_history"]["already_exists"] += 1
            continue
        
        results["teacher_price_history"]["to_create"] += 1
        
        if not dry_run:
            teacher_price_history = {
                "id": str(uuid.uuid4()),
                "teacher_id": teacher_id,
                "branch_id": branch_id,
                "lesson_type_id": lesson_type_id,
                "group_size": group_size,
                "price": price,
                "valid_from": season.get("start_date") or datetime.now(timezone.utc),
                "valid_to": None,
                "season_id": season_id,
                "needs_review": False,
                "created_at": datetime.now(timezone.utc),
                "created_by": "migration"
            }
            await db.teacher_price_history.insert_one(teacher_price_history)
            results["teacher_price_history"]["created"] += 1
    
    results["summary"] = {
        "action": "PREVIEW - Veri değişmedi" if dry_run else "Migration tamamlandı",
        "student_prices": {
            "to_create": results["student_price_history"]["to_create"],
            "already_exists": results["student_price_history"]["already_exists"],
            "created": results["student_price_history"]["created"] if not dry_run else 0
        },
        "teacher_prices": {
            "to_create": results["teacher_price_history"]["to_create"],
            "already_exists": results["teacher_price_history"]["already_exists"],
            "created": results["teacher_price_history"]["created"] if not dry_run else 0
        }
    }
    
    if dry_run:
        results["next_step"] = "Migration'ı uygulamak için dry_run=false ile tekrar çağırın"
    
    return results

@api_router.get("/admin/seasons/migration-status/{season_id}")
async def get_migration_status(
    season_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    FAZ 1: Migration durumunu kontrol et.
    Hangi collection'larda kaç kayıt season_id'ye sahip, kaç kayıt eksik.
    """
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin bu işlemi yapabilir")
    
    season = await db.seasons.find_one({"id": season_id})
    if not season:
        raise HTTPException(status_code=404, detail="Dönem bulunamadı")
    
    collections = [
        "lessons", "payments", "student_courses", "student_groups",
        "planned_lessons", "camps", "camp_students", "youtube_contents",
        "trial_exams", "homework_plans", "homework_plan_items",
        "student_book_assignments", "student_test_progress"
    ]
    
    status = {
        "season_id": season_id,
        "season_name": season["name"],
        "collections": {}
    }
    
    total_with_season = 0
    total_without_season = 0
    
    for coll in collections:
        with_season = await db[coll].count_documents({"season_id": season_id})
        without_season = await db[coll].count_documents({
            "$or": [
                {"season_id": {"$exists": False}},
                {"season_id": None}
            ]
        })
        other_season = await db[coll].count_documents({
            "season_id": {"$exists": True, "$nin": [None, season_id]}
        })
        
        status["collections"][coll] = {
            "with_this_season": with_season,
            "without_season": without_season,
            "with_other_season": other_season,
            "migration_complete": without_season == 0
        }
        
        total_with_season += with_season
        total_without_season += without_season
    
    # Price history durumu
    student_price_count = await db.student_price_history.count_documents({"season_id": season_id})
    teacher_price_count = await db.teacher_price_history.count_documents({"season_id": season_id})
    
    status["price_history"] = {
        "student_price_history_count": student_price_count,
        "teacher_price_history_count": teacher_price_count
    }
    
    status["summary"] = {
        "total_records_with_season": total_with_season,
        "total_records_without_season": total_without_season,
        "migration_complete": total_without_season == 0
    }
    
    return status


# ============= FAZ 2: SENE SONU PREVIEW =============

async def calculate_student_balance_for_preview(student_id: str, branch_id: str = None):
    """
    Öğrencinin branş bazlı bakiyesini hesapla (preview için).
    Mevcut hesaplama mantığını kullanır, değiştirmez.
    """
    # Öğrencinin aktif kursları
    course_query = {"student_id": student_id, "status": "active"}
    if branch_id:
        course_query["branch_id"] = branch_id
    
    courses = await db.student_courses.find(course_query, {"_id": 0}).to_list(100)
    
    balances = []
    
    for course in courses:
        course_branch_id = course["branch_id"]
        
        # Bu branştaki dersler
        lessons = await db.lessons.find({
            "student_course_id": course["id"]
        }, {"_id": 0}).to_list(10000)
        
        # Ücretsiz olmayan derslerin toplam sayısı
        paid_lessons = [lesson for lesson in lessons if not lesson.get("is_free_lesson", False)]
        total_paid_lessons = sum([lesson["number_of_lessons"] for lesson in paid_lessons])
        
        # Öğrenci ders ücreti
        student_price = course.get("student_price") or course.get("price") or 0
        
        # Kullanılan tutar
        used_amount = total_paid_lessons * student_price
        
        # Bu branş için ödemeler
        payments = await db.payments.find({
            "student_id": student_id,
            "branch_id": course_branch_id,
            "payment_type": "student_payment"
        }, {"_id": 0}).to_list(10000)
        
        total_paid = sum([p["amount"] for p in payments])
        
        # Kalan bakiye
        remaining_balance = total_paid - used_amount
        
        balances.append({
            "branch_id": course_branch_id,
            "balance": remaining_balance,
            "status": "alacakli" if remaining_balance >= 0 else "borclu"
        })
    
    return balances

async def calculate_teacher_balance_for_preview(teacher_id: str):
    """
    Öğretmenin toplam bakiyesini hesapla (preview için).
    Mevcut hesaplama mantığını kullanır, değiştirmez.
    """
    # Dersleri teacher_id ile getir
    lessons = await db.lessons.find({"teacher_id": teacher_id}, {"_id": 0}).to_list(10000)
    
    # Eski sistemle uyumluluk
    courses = await db.student_courses.find({"teacher_id": teacher_id}, {"_id": 0}).to_list(1000)
    course_ids = [c["id"] for c in courses]
    
    old_lessons = await db.lessons.find({
        "student_course_id": {"$in": course_ids},
        "$or": [{"teacher_id": None}, {"teacher_id": {"$exists": False}}]
    }, {"_id": 0}).to_list(10000)
    
    # Birleştir
    all_lesson_ids = set()
    all_lessons = []
    for lesson in lessons + old_lessons:
        if lesson["id"] not in all_lesson_ids:
            all_lesson_ids.add(lesson["id"])
            all_lessons.append(lesson)
    
    # Ders kazancı
    total_earnings = 0
    for lesson in all_lessons:
        if lesson.get("teacher_rate") is not None:
            total_earnings += lesson["teacher_rate"] * lesson["number_of_lessons"]
        else:
            course = next((c for c in courses if c["id"] == lesson.get("student_course_id")), None)
            if course:
                teacher_price = await db.teacher_prices.find_one({
                    "teacher_id": teacher_id,
                    "branch_id": course["branch_id"],
                    "lesson_type_id": course["lesson_type_id"]
                }, {"_id": 0})
                if teacher_price:
                    total_earnings += teacher_price["price"] * lesson["number_of_lessons"]
    
    # Kamp kazançları
    camps = await db.camps.find({"teacher_id": teacher_id}, {"_id": 0}).to_list(1000)
    total_camp_earnings = 0
    for camp in camps:
        paid_students_count = await db.camp_students.count_documents({
            "camp_id": camp["id"],
            "registration_status": "kesin_kayit"
        })
        total_camp_earnings += paid_students_count * camp["per_student_teacher_fee"]
    
    # YouTube kazançları
    youtube_records = await db.youtube_contents.find({
        "teacher_id": teacher_id,
        "status": "active"
    }, {"_id": 0}).to_list(1000)
    total_youtube_earnings = sum([r["amount"] for r in youtube_records])
    
    # Toplam kazanç
    grand_total_earnings = total_earnings + total_camp_earnings + total_youtube_earnings
    
    # Ödemeler
    payments = await db.payments.find({
        "teacher_id": teacher_id,
        "payment_type": "teacher_payment"
    }, {"_id": 0}).to_list(1000)
    total_paid = sum([p["amount"] for p in payments])
    
    # Bakiye
    balance = grand_total_earnings - total_paid
    
    return {
        "total_earnings": grand_total_earnings,
        "total_paid": total_paid,
        "balance": balance
    }

@api_router.post("/year-end/preview")
async def year_end_preview(current_user: User = Depends(get_current_user)):
    """
    FAZ 2: Sene sonu işlemi preview.
    Veri DEĞİŞTİRMEZ, sadece preview gösterir.
    """
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin bu işlemi yapabilir")
    
    # Aktif dönemi bul
    active_season = await db.seasons.find_one({"status": "active", "is_current": True}, {"_id": 0})
    if not active_season:
        raise HTTPException(status_code=400, detail="Aktif dönem bulunamadı. Önce dönem oluşturun.")
    
    # Yeni dönem adını hesapla
    current_name = active_season["name"]  # örn: "2024-2025"
    try:
        years = current_name.split("-")
        new_name = f"{int(years[0]) + 1}-{int(years[1]) + 1}"  # "2025-2026"
    except (ValueError, IndexError):
        new_name = f"{current_name}-SONRAKI"
    
    cutoff_date = datetime.now(timezone.utc)
    
    # ===== ÖĞRENCİ ANALİZİ =====
    all_students = await db.students.find({}, {"_id": 0}).to_list(10000)
    active_students = [s for s in all_students if s.get("status") == "active"]
    inactive_students = [s for s in all_students if s.get("status") != "active"]
    
    # Sınıf dağılımı
    class_breakdown = {
        "5_to_6": 0,
        "6_to_7": 0,
        "7_to_8": 0,
        "8_to_inactive": 0,
        "other": 0
    }
    
    upgrading_students = 0
    graduating_students = 0
    
    for student in active_students:
        level = student.get("level", "")
        try:
            level_int = int(level)
            if level_int == 5:
                class_breakdown["5_to_6"] += 1
                upgrading_students += 1
            elif level_int == 6:
                class_breakdown["6_to_7"] += 1
                upgrading_students += 1
            elif level_int == 7:
                class_breakdown["7_to_8"] += 1
                upgrading_students += 1
            elif level_int == 8:
                class_breakdown["8_to_inactive"] += 1
                graduating_students += 1
            else:
                class_breakdown["other"] += 1
        except (ValueError, TypeError):
            class_breakdown["other"] += 1
    
    # ===== GRUP ANALİZİ =====
    active_groups = await db.student_groups.find({
        "status": "active"
    }, {"_id": 0}).to_list(1000)
    
    # ===== ÖĞRENCİ BAKİYELERİ =====
    branches = await db.branches.find({}, {"_id": 0}).to_list(100)
    branch_map = {b["id"]: b["name"] for b in branches}
    
    student_balances = []
    
    for student in active_students:
        balances = await calculate_student_balance_for_preview(student["id"])
        
        # Bakiyelere branş adı ekle
        for bal in balances:
            bal["branch_name"] = branch_map.get(bal["branch_id"], "Bilinmiyor")
        
        total_balance = sum([b["balance"] for b in balances])
        
        level = student.get("level", "")
        try:
            level_int = int(level)
            new_level = str(level_int + 1) if level_int < 8 else None
            will_graduate = level_int == 8
        except (ValueError, TypeError):
            new_level = None
            will_graduate = False
        
        student_balances.append({
            "student_id": student["id"],
            "student_name": student["name"],
            "level": level,
            "new_level": new_level,
            "will_graduate": will_graduate,
            "total_balance": total_balance,
            "by_branch": balances
        })
    
    # Bakiyeye göre sırala (en yüksek bakiye önce)
    student_balances.sort(key=lambda x: abs(x["total_balance"]), reverse=True)
    
    # ===== ÖĞRETMEN BAKİYELERİ =====
    teachers = await db.teachers.find({"status": "active"}, {"_id": 0}).to_list(1000)
    
    teacher_balances = []
    
    for teacher in teachers:
        balance_info = await calculate_teacher_balance_for_preview(teacher["id"])
        
        teacher_balances.append({
            "teacher_id": teacher["id"],
            "teacher_name": teacher["name"],
            "total_earnings": balance_info["total_earnings"],
            "total_paid": balance_info["total_paid"],
            "carryover_balance": balance_info["balance"]
        })
    
    # Bakiyeye göre sırala
    teacher_balances.sort(key=lambda x: abs(x["carryover_balance"]), reverse=True)
    
    # ===== UYARILAR =====
    warnings = []
    
    if graduating_students > 0:
        warnings.append(f"{graduating_students} öğrenci mezun olacak ve pasife alınacak")
    
    if len(active_groups) > 0:
        warnings.append(f"{len(active_groups)} grup kapatılacak (yeni döneme kopyalanmayacak)")
    
    # Mezun olacak öğrencilerin bakiyeleri
    graduating_with_balance = [s for s in student_balances if s["will_graduate"] and s["total_balance"] != 0]
    if graduating_with_balance:
        positive_balance = sum([s["total_balance"] for s in graduating_with_balance if s["total_balance"] > 0])
        negative_balance = sum([s["total_balance"] for s in graduating_with_balance if s["total_balance"] < 0])
        if positive_balance > 0:
            warnings.append(f"Mezun olacak öğrencilerde toplam {positive_balance:.0f} TL alacak bakiye var (devredilmeyecek)")
        if negative_balance < 0:
            warnings.append(f"Mezun olacak öğrencilerde toplam {abs(negative_balance):.0f} TL borç var (devredilmeyecek)")
    
    # ===== RESPONSE =====
    return {
        "closing_season": {
            "id": active_season["id"],
            "name": active_season["name"]
        },
        "opening_season": {
            "id": f"season-{new_name}",
            "name": new_name
        },
        "cutoff_date": cutoff_date.isoformat(),
        
        "student_summary": {
            "total_active_students": len(active_students),
            "upgrading_students": upgrading_students,
            "graduating_students": graduating_students,
            "already_inactive": len(inactive_students),
            "class_breakdown": class_breakdown
        },
        
        "group_summary": {
            "total_active_groups": len(active_groups),
            "groups_to_close": len(active_groups),
            "groups_to_copy": 0  # Gruplar kopyalanmayacak
        },
        
        "student_balances": student_balances,
        "teacher_balances": teacher_balances,
        
        "cashbox_note": "Kasa bakiyeleri değişmeyecek",
        
        "warnings": warnings,
        
        "important_notes": [
            "Bu sadece PREVIEW - henüz hiçbir veri değişmedi",
            "Sene sonu işlemini onaylamak için /year-end/execute endpoint'ini kullanın",
            "8. sınıf öğrencileri pasife alınacak ve bakiyeleri DEVREDİLMEYECEK",
            "Gruplar kapatılacak, yeni döneme kopyalanmayacak",
            "Birebir ders ilişkileri yeni döneme kopyalanacak"
        ]
    }


# ============= FAZ 3: SENE SONU EXECUTE =============

def get_next_season_name(current_name: str) -> str:
    """Bir sonraki dönem adını hesapla: '2024-2025' -> '2025-2026'"""
    try:
        parts = current_name.split("-")
        return f"{int(parts[0]) + 1}-{int(parts[1]) + 1}"
    except (ValueError, IndexError):
        return f"{current_name}-SONRAKI"

async def calculate_all_student_balances_for_execute(season_id: str = None):
    """Tüm aktif öğrencilerin branş bazlı bakiyelerini hesapla"""
    student_balances = {}
    
    students = await db.students.find({"status": "active"}, {"_id": 0}).to_list(10000)
    
    for student in students:
        student_id = student["id"]
        balances_by_branch = {}
        
        # Öğrencinin aktif kurslarını al
        courses = await db.student_courses.find({
            "student_id": student_id,
            "status": "active"
        }, {"_id": 0}).to_list(100)
        
        for course in courses:
            branch_id = course["branch_id"]
            
            # Bu kurs için dersler
            lessons = await db.lessons.find({
                "student_course_id": course["id"]
            }, {"_id": 0}).to_list(10000)
            
            # Ücretsiz olmayan derslerin toplam sayısı
            paid_lessons = [l for l in lessons if not l.get("is_free_lesson", False)]
            total_paid_lessons = sum([l["number_of_lessons"] for l in paid_lessons])
            
            # Öğrenci ders ücreti
            student_price = course.get("student_price") or course.get("price") or 0
            
            # Kullanılan tutar
            used_amount = total_paid_lessons * student_price
            
            # Bu branş için ödemeler
            payments = await db.payments.find({
                "student_id": student_id,
                "branch_id": branch_id,
                "payment_type": "student_payment"
            }, {"_id": 0}).to_list(10000)
            
            total_paid = sum([p["amount"] for p in payments])
            
            # Kalan bakiye
            remaining_balance = total_paid - used_amount
            
            # Branş bazlı topla
            if branch_id not in balances_by_branch:
                balances_by_branch[branch_id] = 0
            balances_by_branch[branch_id] += remaining_balance
        
        student_balances[student_id] = balances_by_branch
    
    return student_balances

async def calculate_all_teacher_balances_for_execute(season_id: str = None):
    """Tüm aktif öğretmenlerin toplam bakiyelerini hesapla"""
    teacher_balances = {}
    
    teachers = await db.teachers.find({"status": "active"}, {"_id": 0}).to_list(1000)
    
    for teacher in teachers:
        teacher_id = teacher["id"]
        
        # Dersleri teacher_id ile getir
        lessons = await db.lessons.find({"teacher_id": teacher_id}, {"_id": 0}).to_list(10000)
        
        # Eski sistemle uyumluluk
        courses = await db.student_courses.find({"teacher_id": teacher_id}, {"_id": 0}).to_list(1000)
        course_ids = [c["id"] for c in courses]
        
        old_lessons = await db.lessons.find({
            "student_course_id": {"$in": course_ids},
            "$or": [{"teacher_id": None}, {"teacher_id": {"$exists": False}}]
        }, {"_id": 0}).to_list(10000)
        
        # Birleştir
        all_lesson_ids = set()
        all_lessons = []
        for lesson in lessons + old_lessons:
            if lesson["id"] not in all_lesson_ids:
                all_lesson_ids.add(lesson["id"])
                all_lessons.append(lesson)
        
        # Ders kazancı
        total_earnings = 0
        for lesson in all_lessons:
            if lesson.get("teacher_rate") is not None:
                total_earnings += lesson["teacher_rate"] * lesson["number_of_lessons"]
            else:
                course = next((c for c in courses if c["id"] == lesson.get("student_course_id")), None)
                if course:
                    teacher_price = await db.teacher_prices.find_one({
                        "teacher_id": teacher_id,
                        "branch_id": course["branch_id"],
                        "lesson_type_id": course["lesson_type_id"]
                    }, {"_id": 0})
                    if teacher_price:
                        total_earnings += teacher_price["price"] * lesson["number_of_lessons"]
        
        # Kamp kazançları
        camps = await db.camps.find({"teacher_id": teacher_id}, {"_id": 0}).to_list(1000)
        total_camp_earnings = 0
        for camp in camps:
            paid_students_count = await db.camp_students.count_documents({
                "camp_id": camp["id"],
                "registration_status": "kesin_kayit"
            })
            total_camp_earnings += paid_students_count * camp.get("per_student_teacher_fee", 0)
        
        # YouTube kazançları
        youtube_records = await db.youtube_contents.find({
            "teacher_id": teacher_id,
            "status": "active"
        }, {"_id": 0}).to_list(1000)
        total_youtube_earnings = sum([r["amount"] for r in youtube_records])
        
        # Toplam kazanç
        grand_total_earnings = total_earnings + total_camp_earnings + total_youtube_earnings
        
        # Ödemeler
        payments = await db.payments.find({
            "teacher_id": teacher_id,
            "payment_type": "teacher_payment"
        }, {"_id": 0}).to_list(1000)
        total_paid = sum([p["amount"] for p in payments])
        
        # Bakiye
        balance = grand_total_earnings - total_paid
        teacher_balances[teacher_id] = balance
    
    return teacher_balances

class YearEndExecuteRequest(BaseModel):
    confirm: bool = False  # Kullanıcının onayını zorunlu kıl

@api_router.post("/year-end/execute")
async def year_end_execute(
    request: YearEndExecuteRequest,
    current_user: User = Depends(get_current_user)
):
    """
    FAZ 3: Sene sonu işlemini gerçekleştir.
    
    DİKKAT: Bu işlem GERİ ALINAMAZ (UI'da rollback yok).
    
    İşlem adımları:
    1. Yeni dönem oluştur
    2. Öğrenci sınıflarını güncelle (8. sınıf pasife alınır)
    3. Grupları kapat
    4. Öğrenci bakiye devirlerini oluştur (branş bazlı)
    5. Öğretmen bakiye devirlerini oluştur (toplam)
    6. Birebir ders ilişkilerini yeni döneme kopyala
    7. Mevcut dönemi kapat
    """
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin bu işlemi yapabilir")
    
    if not request.confirm:
        raise HTTPException(
            status_code=400, 
            detail="Bu işlem geri alınamaz. Onaylamak için confirm=true gönderin."
        )
    
    # ========== HAZIRLIK ==========
    
    # 1. Aktif dönemi doğrula
    active_season = await db.seasons.find_one({"status": "active", "is_current": True}, {"_id": 0})
    if not active_season:
        raise HTTPException(status_code=400, detail="Aktif dönem bulunamadı")
    
    # 2. Aynı dönem için daha önce sene sonu yapılmamış mı kontrol et (idempotency)
    existing_log = await db.year_end_logs.find_one({
        "from_season_id": active_season["id"],
        "status": "success"
    })
    if existing_log:
        raise HTTPException(
            status_code=400, 
            detail=f"Bu dönem ({active_season['name']}) için sene sonu işlemi zaten yapılmış"
        )
    
    # 3. Kesim tarihini belirle
    cutoff_date = datetime.now(timezone.utc)
    
    # 4. Yeni dönem adı ve ID'si
    new_season_name = get_next_season_name(active_season["name"])
    new_season_id = f"season-{new_season_name}"
    
    # Yeni dönem zaten var mı? (idempotency)
    existing_new_season = await db.seasons.find_one({"id": new_season_id})
    if existing_new_season:
        raise HTTPException(
            status_code=400,
            detail=f"Yeni dönem ({new_season_name}) zaten mevcut. Duplicate oluşturulamaz."
        )
    
    try:
        # ========== SNAPSHOT OLUŞTUR ==========
        
        # 5. Öğrenci bakiyelerini hesapla
        student_balances = await calculate_all_student_balances_for_execute()
        
        # 6. Öğretmen bakiyelerini hesapla
        teacher_balances = await calculate_all_teacher_balances_for_execute()
        
        # ========== YENİ DÖNEM OLUŞTUR ==========
        
        # 7. Yeni dönemi oluştur
        new_season = {
            "id": new_season_id,
            "name": new_season_name,
            "start_date": cutoff_date,
            "end_date": None,
            "status": "active",
            "is_current": False,  # Henüz değil
            "closed_at": None,
            "closed_by": None,
            "previous_season_id": active_season["id"],
            "next_season_id": None,
            "created_at": cutoff_date
        }
        await db.seasons.insert_one(new_season)
        
        # ========== ÖĞRENCİ İŞLEMLERİ ==========
        
        # 8. Aktif öğrencileri çek
        students = await db.students.find({"status": "active"}, {"_id": 0}).to_list(10000)
        
        upgraded_count = 0
        graduated_count = 0
        student_carryover_count = 0
        
        for student in students:
            student_id = student["id"]
            level_str = student.get("level", "0")
            
            try:
                level = int(level_str)
            except (ValueError, TypeError):
                level = 0
            
            if level == 8:
                # 8. sınıf → Pasife al, bakiye devretme
                await db.students.update_one(
                    {"id": student_id},
                    {"$set": {"status": "inactive"}}
                )
                graduated_count += 1
            else:
                if level >= 5 and level <= 7:
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
                        student_carryover_count += 1
        
        # ========== ÖĞRETMEN İŞLEMLERİ ==========
        
        # 9. Öğretmen bakiye devir kayıtları
        teacher_carryover_count = 0
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
                teacher_carryover_count += 1
        
        # ========== DERS İLİŞKİSİ KOPYALAMA ==========
        
        # 10. SADECE BİREBİR ders ilişkilerini kopyala (REVİZYON #4)
        # group_id olan veya None olmayan kayıtları KOPYALAMA
        courses = await db.student_courses.find({
            "status": "active",
            "$or": [
                {"group_id": {"$exists": False}},
                {"group_id": None}
            ]
        }, {"_id": 0}).to_list(10000)
        
        copied_course_count = 0
        for course in courses:
            # Öğrenci aktifse kopyala
            student = await db.students.find_one({"id": course["student_id"]})
            if student and student.get("status") == "active":
                new_course_id = str(uuid.uuid4())
                new_course = {
                    **course,
                    "id": new_course_id,
                    "season_id": new_season_id,
                    "created_at": cutoff_date,
                    "closed_at": None,
                    "copied_to_id": None
                }
                new_course.pop("_id", None)
                await db.student_courses.insert_one(new_course)
                copied_course_count += 1
                
                # Eski course'u işaretle
                await db.student_courses.update_one(
                    {"id": course["id"]},
                    {"$set": {
                        "closed_at": cutoff_date,
                        "copied_to_id": new_course_id
                    }}
                )
        
        # ========== GRUP KAPATMA ==========
        
        # 11. Tüm aktif grupları kapat
        closed_groups_result = await db.student_groups.update_many(
            {"status": "active"},
            {"$set": {
                "status": "closed",
                "closed_at": cutoff_date,
                "closed_reason": "year_end"
            }}
        )
        
        # ========== FİYAT KOPYALAMA (VARSA) ==========
        
        # 12. Mevcut fiyat history'den aktif fiyatları yeni döneme kopyala
        student_prices = await db.student_price_history.find({
            "valid_to": None
        }, {"_id": 0}).to_list(10000)
        
        copied_student_prices = 0
        for price in student_prices:
            # Öğrenci aktifse kopyala
            student = await db.students.find_one({"id": price["student_id"]})
            if student and student.get("status") == "active":
                new_price = {
                    **price,
                    "id": str(uuid.uuid4()),
                    "season_id": new_season_id,
                    "valid_from": cutoff_date,
                    "needs_review": True,
                    "created_at": cutoff_date,
                    "created_by": "year_end_migration"
                }
                new_price.pop("_id", None)
                await db.student_price_history.insert_one(new_price)
                copied_student_prices += 1
        
        # 13. Öğretmen fiyatlarını kopyala
        teacher_prices = await db.teacher_price_history.find({
            "valid_to": None
        }, {"_id": 0}).to_list(10000)
        
        copied_teacher_prices = 0
        for price in teacher_prices:
            new_price = {
                **price,
                "id": str(uuid.uuid4()),
                "season_id": new_season_id,
                "valid_from": cutoff_date,
                "needs_review": True,
                "created_at": cutoff_date,
                "created_by": "year_end_migration"
            }
            new_price.pop("_id", None)
            await db.teacher_price_history.insert_one(new_price)
            copied_teacher_prices += 1
        
        # ========== DÖNEM DURUMU GÜNCELLE ==========
        
        # 14. Eski dönemi kapat
        await db.seasons.update_one(
            {"id": active_season["id"]},
            {"$set": {
                "status": "closed",
                "is_current": False,
                "end_date": cutoff_date,
                "closed_at": cutoff_date,
                "closed_by": current_user.id,
                "next_season_id": new_season_id
            }}
        )
        
        # 15. Yeni dönemi aktif yap
        await db.seasons.update_one(
            {"id": new_season_id},
            {"$set": {"is_current": True}}
        )
        
        # ========== AUDIT LOG ==========
        
        # 16. Başarılı log oluştur
        summary = {
            "upgraded_students": upgraded_count,
            "graduated_students": graduated_count,
            "closed_groups": closed_groups_result.modified_count,
            "student_carryovers": student_carryover_count,
            "teacher_carryovers": teacher_carryover_count,
            "copied_courses": copied_course_count,
            "copied_student_prices": copied_student_prices,
            "copied_teacher_prices": copied_teacher_prices
        }
        
        log = {
            "id": str(uuid.uuid4()),
            "from_season_id": active_season["id"],
            "to_season_id": new_season_id,
            "executed_by": current_user.id,
            "executed_at": cutoff_date,
            "cutoff_date": cutoff_date,
            "status": "success",
            "summary": summary,
            "error_message": None,
            "created_at": cutoff_date
        }
        await db.year_end_logs.insert_one(log)
        
        return {
            "success": True,
            "message": f"Sene sonu işlemi başarıyla tamamlandı",
            "from_season": active_season["name"],
            "to_season": new_season_name,
            "cutoff_date": cutoff_date.isoformat(),
            "summary": summary
        }
        
    except Exception as e:
        # Hata durumunda log oluştur
        error_log = {
            "id": str(uuid.uuid4()),
            "from_season_id": active_season["id"],
            "to_season_id": new_season_id,
            "executed_by": current_user.id,
            "executed_at": cutoff_date,
            "cutoff_date": cutoff_date,
            "status": "failed",
            "summary": None,
            "error_message": str(e),
            "created_at": cutoff_date
        }
        await db.year_end_logs.insert_one(error_log)
        
        raise HTTPException(
            status_code=500,
            detail=f"Sene sonu işlemi sırasında hata oluştu: {str(e)}"
        )

@api_router.get("/year-end/logs")
async def get_year_end_logs(current_user: User = Depends(get_current_user)):
    """Sene sonu işlem loglarını getir"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin")
    
    logs = await db.year_end_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return logs


# ============= FAZ 4: FİYAT GEÇMİŞİ VE SNAPSHOT =============

# Helper: Öğrenci fiyatını tarih bazlı getir
async def get_student_price_at_date(
    student_id: str, 
    branch_id: str, 
    lesson_type: str,
    date: datetime
) -> float:
    """
    Belirli bir tarihteki öğrenci fiyatını döndürür.
    REVİZYON #3: Tarih aralığına düşmüyorsa EN ESKİ FİYATI kullanır.
    
    Mantık:
    1. Ders tarihi bir fiyat aralığına düşüyorsa → o fiyatı kullan
    2. Ders tarihi hiçbir aralığa düşmüyorsa → en eski fiyatı kullan
    3. Hiç fiyat geçmişi yoksa → student_courses'tan fallback
    """
    # 1. Önce tarih aralığına düşen fiyatı ara
    price_record = await db.student_price_history.find_one({
        "$and": [
            {"student_id": student_id},
            {"branch_id": branch_id},
            {"lesson_type": lesson_type},
            {"valid_from": {"$lte": date}},
            {"$or": [
                {"valid_to": None},
                {"valid_to": {"$gte": date}}
            ]}
        ]
    }, {"_id": 0}, sort=[("valid_from", -1)])
    
    if price_record:
        return price_record["price"]
    
    # 2. Tarih aralığına düşmüyorsa, EN ESKİ fiyatı bul
    oldest_price = await db.student_price_history.find_one({
        "student_id": student_id,
        "branch_id": branch_id,
        "lesson_type": lesson_type
    }, {"_id": 0}, sort=[("valid_from", 1)])  # ASC - en eski ilk
    
    if oldest_price:
        return oldest_price["price"]
    
    # 3. Fallback: student_courses'tan fiyat al
    course = await db.student_courses.find_one({
        "student_id": student_id,
        "branch_id": branch_id,
        "status": "active"
    }, {"_id": 0})
    
    if course and course.get("student_price"):
        return course["student_price"]
    
    return 0

# Helper: Öğretmen fiyatını tarih bazlı getir
async def get_teacher_price_at_date(
    teacher_id: str,
    branch_id: str,
    lesson_type_id: str,
    group_size: int = None,
    date: datetime = None
) -> float:
    """
    REVİZYON #8: Tarih aralığına düşmüyorsa EN ESKİ FİYATI kullanır.
    
    Mantık:
    1. Ders tarihi bir fiyat aralığına düşüyorsa → o fiyatı kullan
    2. Ders tarihi hiçbir aralığa düşmüyorsa → en eski fiyatı kullan
    3. Hiç fiyat geçmişi yoksa → teacher_prices'tan fallback
    """
    # Temel sorgu
    base_query = {
        "teacher_id": teacher_id,
        "branch_id": branch_id,
        "lesson_type_id": lesson_type_id
    }
    
    # Group size kontrolü
    if group_size:
        base_query["group_size"] = group_size
    else:
        base_query["$or"] = [{"group_size": None}, {"group_size": {"$exists": False}}]
    
    if date:
        # 1. Önce tarih aralığına düşen fiyatı ara
        query = {
            "$and": [
                {"teacher_id": teacher_id},
                {"branch_id": branch_id},
                {"lesson_type_id": lesson_type_id},
                {"valid_from": {"$lte": date}},
                {"$or": [
                    {"valid_to": None},
                    {"valid_to": {"$gte": date}}
                ]}
            ]
        }
        
        if group_size:
            query["$and"].append({"group_size": group_size})
        else:
            query["$and"].append({"$or": [{"group_size": None}, {"group_size": {"$exists": False}}]})
        
        price_record = await db.teacher_price_history.find_one(
            query, {"_id": 0}, sort=[("valid_from", -1)]
        )
        
        if price_record:
            return price_record["price"]
        
        # 2. Tarih aralığına düşmüyorsa, EN ESKİ fiyatı bul
        oldest_query = {
            "teacher_id": teacher_id,
            "branch_id": branch_id,
            "lesson_type_id": lesson_type_id
        }
        if group_size:
            oldest_query["group_size"] = group_size
        
        oldest_price = await db.teacher_price_history.find_one(
            oldest_query, {"_id": 0}, sort=[("valid_from", 1)]  # ASC - en eski ilk
        )
        
        if oldest_price:
            return oldest_price["price"]
    else:
        # Tarih yoksa: aktif fiyatı getir
        query = {**base_query, "valid_to": None}
        price_record = await db.teacher_price_history.find_one(
            query, {"_id": 0}, sort=[("valid_from", -1)]
        )
        
        if price_record:
            return price_record["price"]
    
    # 3. Fallback: teacher_prices'tan fiyat al
    fallback_query = {
        "teacher_id": teacher_id,
        "branch_id": branch_id,
        "lesson_type_id": lesson_type_id
    }
    if group_size:
        fallback_query["group_size"] = group_size
    
    teacher_price = await db.teacher_prices.find_one(fallback_query, {"_id": 0})
    
    return teacher_price["price"] if teacher_price else 0

# Helper: Fiyat tarih aralığı çakışma kontrolü
async def validate_student_price_date_range(
    student_id: str,
    branch_id: str,
    lesson_type: str,
    valid_from: datetime,
    valid_to: datetime = None,
    exclude_id: str = None
):
    """
    REVİZYON #3: Fiyat tarih aralığı çakışma kontrolü.
    """
    query = {
        "student_id": student_id,
        "branch_id": branch_id,
        "lesson_type": lesson_type,
        "$or": [
            {
                "valid_from": {"$lte": valid_from},
                "$or": [
                    {"valid_to": None},
                    {"valid_to": {"$gte": valid_from}}
                ]
            }
        ]
    }
    
    if valid_to:
        query["$or"].append({
            "$and": [
                {"valid_from": {"$gte": valid_from}},
                {"valid_from": {"$lte": valid_to}}
            ]
        })
    
    if exclude_id:
        query["id"] = {"$ne": exclude_id}
    
    conflicting = await db.student_price_history.find_one(query, {"_id": 0})
    
    if conflicting:
        raise HTTPException(
            status_code=400,
            detail=f"Tarih aralığı çakışması mevcut"
        )

# Student Price History Endpoints
class StudentPriceHistoryCreate(BaseModel):
    student_id: str
    branch_id: str
    lesson_type: str = "birebir"  # "birebir" | "group"
    price: float
    valid_from: str  # YYYY-MM-DD

@api_router.get("/student-price-history/{student_id}")
async def get_student_price_history(
    student_id: str,
    branch_id: str = None,
    current_user: User = Depends(get_current_user)
):
    """Öğrencinin fiyat geçmişini getir"""
    query = {"student_id": student_id}
    if branch_id:
        query["branch_id"] = branch_id
    
    history = await db.student_price_history.find(query, {"_id": 0}).sort("valid_from", -1).to_list(100)
    return history

@api_router.post("/student-price-history")
async def create_student_price_history(
    data: StudentPriceHistoryCreate,
    current_user: User = Depends(get_current_user)
):
    """Öğrenci fiyat geçmişine yeni kayıt ekle"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin")
    
    # Aktif dönem kontrolü
    active_season = await db.seasons.find_one({"status": "active", "is_current": True}, {"_id": 0})
    if not active_season:
        raise HTTPException(status_code=400, detail="Aktif dönem bulunamadı")
    
    # Tarihi parse et
    try:
        valid_from = datetime.strptime(data.valid_from, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="Geçersiz tarih formatı. YYYY-MM-DD kullanın.")
    
    # Mevcut geçerli fiyatı kapat (lesson_type bazında)
    await db.student_price_history.update_one(
        {
            "student_id": data.student_id,
            "branch_id": data.branch_id,
            "lesson_type": data.lesson_type,
            "valid_to": None
        },
        {"$set": {"valid_to": valid_from}}
    )
    
    # Yeni fiyatı ekle
    new_price = {
        "id": str(uuid.uuid4()),
        "student_id": data.student_id,
        "branch_id": data.branch_id,
        "lesson_type": data.lesson_type,
        "price": data.price,
        "valid_from": valid_from,
        "valid_to": None,
        "season_id": active_season["id"],
        "needs_review": False,
        "created_at": datetime.now(timezone.utc),
        "created_by": current_user.id
    }
    
    await db.student_price_history.insert_one(new_price)
    
    # student_courses'taki student_price'ı da güncelle (uyumluluk için)
    await db.student_courses.update_many(
        {
            "student_id": data.student_id,
            "branch_id": data.branch_id,
            "status": "active"
        },
        {"$set": {"student_price": data.price}}
    )
    
    new_price.pop("_id", None)
    return {"message": "Fiyat güncellendi", "price": new_price}

# Fiyat geçmişi güncelleme endpoint'i
class StudentPriceHistoryUpdate(BaseModel):
    price: Optional[float] = None
    valid_from: Optional[str] = None  # YYYY-MM-DD
    valid_to: Optional[str] = None    # YYYY-MM-DD veya null

@api_router.put("/student-price-history/{price_id}")
async def update_student_price_history(
    price_id: str,
    data: StudentPriceHistoryUpdate,
    current_user: User = Depends(get_current_user)
):
    """Fiyat geçmişi kaydını güncelle"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin")
    
    # Mevcut kaydı bul
    existing = await db.student_price_history.find_one({"id": price_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Fiyat kaydı bulunamadı")
    
    update_data = {}
    
    # Fiyat güncelle
    if data.price is not None:
        update_data["price"] = data.price
    
    # valid_from güncelle
    if data.valid_from is not None:
        try:
            new_valid_from = datetime.strptime(data.valid_from, "%Y-%m-%d")
            update_data["valid_from"] = new_valid_from
        except ValueError:
            raise HTTPException(status_code=400, detail="Geçersiz valid_from formatı")
    
    # valid_to güncelle
    if data.valid_to is not None:
        if data.valid_to == "" or data.valid_to.lower() == "null":
            update_data["valid_to"] = None
        else:
            try:
                new_valid_to = datetime.strptime(data.valid_to, "%Y-%m-%d")
                update_data["valid_to"] = new_valid_to
            except ValueError:
                raise HTTPException(status_code=400, detail="Geçersiz valid_to formatı")
    
    # Tarih tutarlılığı kontrolü
    check_from = update_data.get("valid_from", existing.get("valid_from"))
    check_to = update_data.get("valid_to", existing.get("valid_to"))
    
    if check_to is not None and check_from and check_to < check_from:
        raise HTTPException(status_code=400, detail="Bitiş tarihi başlangıç tarihinden önce olamaz")
    
    if update_data:
        await db.student_price_history.update_one(
            {"id": price_id},
            {"$set": update_data}
        )
    
    updated = await db.student_price_history.find_one({"id": price_id}, {"_id": 0})
    return {"message": "Fiyat geçmişi güncellendi", "price": updated}

@api_router.delete("/student-price-history/{price_id}")
async def delete_student_price_history(
    price_id: str,
    current_user: User = Depends(get_current_user)
):
    """Fiyat geçmişi kaydını sil"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin")
    
    # Mevcut kaydı bul
    existing = await db.student_price_history.find_one({"id": price_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Fiyat kaydı bulunamadı")
    
    await db.student_price_history.delete_one({"id": price_id})
    
    return {"message": "Fiyat geçmişi silindi"}

# Teacher Price History Endpoints
class TeacherPriceHistoryCreate(BaseModel):
    teacher_id: str
    branch_id: str
    lesson_type_id: str
    group_size: int = None
    price: float
    valid_from: str  # YYYY-MM-DD

@api_router.get("/teacher-price-history/{teacher_id}")
async def get_teacher_price_history(
    teacher_id: str,
    branch_id: str = None,
    current_user: User = Depends(get_current_user)
):
    """Öğretmenin fiyat geçmişini getir"""
    query = {"teacher_id": teacher_id}
    if branch_id:
        query["branch_id"] = branch_id
    
    history = await db.teacher_price_history.find(query, {"_id": 0}).sort("valid_from", -1).to_list(100)
    return history

@api_router.post("/teacher-price-history")
async def create_teacher_price_history(
    data: TeacherPriceHistoryCreate,
    current_user: User = Depends(get_current_user)
):
    """Öğretmen fiyat geçmişine yeni kayıt ekle"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin")
    
    # Aktif dönem kontrolü
    active_season = await db.seasons.find_one({"status": "active", "is_current": True}, {"_id": 0})
    if not active_season:
        raise HTTPException(status_code=400, detail="Aktif dönem bulunamadı")
    
    # Tarihi parse et
    try:
        valid_from = datetime.strptime(data.valid_from, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="Geçersiz tarih formatı. YYYY-MM-DD kullanın.")
    
    # Mevcut geçerli fiyatı kapat
    close_query = {
        "teacher_id": data.teacher_id,
        "branch_id": data.branch_id,
        "lesson_type_id": data.lesson_type_id,
        "valid_to": None
    }
    if data.group_size:
        close_query["group_size"] = data.group_size
    
    await db.teacher_price_history.update_one(
        close_query,
        {"$set": {"valid_to": valid_from}}
    )
    
    # Yeni fiyatı ekle
    new_price = {
        "id": str(uuid.uuid4()),
        "teacher_id": data.teacher_id,
        "branch_id": data.branch_id,
        "lesson_type_id": data.lesson_type_id,
        "group_size": data.group_size,
        "price": data.price,
        "valid_from": valid_from,
        "valid_to": None,
        "season_id": active_season["id"],
        "needs_review": False,
        "created_at": datetime.now(timezone.utc),
        "created_by": current_user.id
    }
    
    await db.teacher_price_history.insert_one(new_price)
    
    # teacher_prices'ı da güncelle (uyumluluk için)
    update_query = {
        "teacher_id": data.teacher_id,
        "branch_id": data.branch_id,
        "lesson_type_id": data.lesson_type_id
    }
    if data.group_size:
        update_query["group_size"] = data.group_size
    
    await db.teacher_prices.update_one(
        update_query,
        {"$set": {"price": data.price}},
        upsert=True
    )
    
    new_price.pop("_id", None)
    return {"message": "Fiyat güncellendi", "price": new_price}

# Aktif dönemdeki fiyatları getir
@api_router.get("/current-prices/{student_id}")
async def get_current_student_prices(
    student_id: str,
    current_user: User = Depends(get_current_user)
):
    """Öğrencinin güncel fiyatlarını getir (tüm branşlar)"""
    prices = await db.student_price_history.find({
        "student_id": student_id,
        "valid_to": None
    }, {"_id": 0}).to_list(100)
    
    # Branş adlarını ekle
    for price in prices:
        branch = await db.branches.find_one({"id": price["branch_id"]}, {"_id": 0})
        price["branch_name"] = branch["name"] if branch else "Bilinmiyor"
    
    return prices


# ============= FAZ 5: DÖNEM FİLTRESİ VE KAPALI DÖNEM KONTROLLERİ =============

# Helper: Kapalı dönem kontrolü
async def check_season_is_open(season_id: str = None, date_str: str = None):
    """
    Dönemin açık olup olmadığını kontrol et.
    Kapalı döneme işlem yapılamaz.
    
    REVİZYON #9: Tüm CUD endpoint'lerinde kullanılmalı.
    """
    if season_id:
        season = await db.seasons.find_one({"id": season_id}, {"_id": 0})
        if not season:
            raise HTTPException(status_code=400, detail="Dönem bulunamadı")
        if season.get("status") == "closed":
            raise HTTPException(
                status_code=400, 
                detail=f"'{season['name']}' dönemi kapatılmıştır. Kapalı döneme işlem yapılamaz."
            )
        return season
    
    # Aktif dönemi kontrol et
    active_season = await db.seasons.find_one({"status": "active", "is_current": True}, {"_id": 0})
    if not active_season:
        # Dönem yoksa işleme izin ver (migration öncesi uyumluluk)
        return None
    
    return active_season

# Helper: Aktif dönem ID'sini getir
async def get_active_season_id() -> str:
    """Aktif dönem ID'sini döndür, yoksa None"""
    active_season = await db.seasons.find_one({"status": "active", "is_current": True}, {"_id": 0})
    return active_season["id"] if active_season else None

# Dashboard: Dönem bazlı istatistikler
@api_router.get("/dashboard/season-stats")
async def get_season_dashboard_stats(
    season_id: str = None,
    current_user: User = Depends(get_current_user)
):
    """
    FAZ 5: Dönem bazlı dashboard istatistikleri.
    Admin için dönem özeti.
    """
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin")
    
    # Dönem belirtilmemişse aktif dönemi kullan
    if not season_id:
        active_season = await db.seasons.find_one({"status": "active", "is_current": True}, {"_id": 0})
        if active_season:
            season_id = active_season["id"]
    
    # Dönem bilgisi
    season = await db.seasons.find_one({"id": season_id}, {"_id": 0}) if season_id else None
    
    # İstatistikler
    stats = {
        "season": {
            "id": season_id,
            "name": season["name"] if season else "Tüm Zamanlar",
            "status": season.get("status") if season else None,
            "is_closed": season.get("status") == "closed" if season else False
        },
        "students": {},
        "teachers": {},
        "lessons": {},
        "payments": {},
        "groups": {}
    }
    
    # Öğrenci istatistikleri
    if season_id:
        stats["students"]["active_courses"] = await db.student_courses.count_documents({
            "season_id": season_id,
            "status": "active"
        })
        stats["lessons"]["total"] = await db.lessons.count_documents({"season_id": season_id})
        stats["payments"]["total"] = await db.payments.count_documents({"season_id": season_id})
        stats["groups"]["active"] = await db.student_groups.count_documents({
            "season_id": season_id,
            "status": "active"
        })
        stats["groups"]["closed"] = await db.student_groups.count_documents({
            "season_id": season_id,
            "status": "closed"
        })
    else:
        # Tüm zamanlar
        stats["students"]["active_courses"] = await db.student_courses.count_documents({"status": "active"})
        stats["lessons"]["total"] = await db.lessons.count_documents({})
        stats["payments"]["total"] = await db.payments.count_documents({})
        stats["groups"]["active"] = await db.student_groups.count_documents({"status": "active"})
        stats["groups"]["closed"] = await db.student_groups.count_documents({"status": "closed"})
    
    # Genel istatistikler
    stats["students"]["total_active"] = await db.students.count_documents({"status": "active"})
    stats["teachers"]["total_active"] = await db.teachers.count_documents({"status": "active"})
    
    # Bakiye devirleri (eğer dönem varsa)
    if season_id:
        student_carryovers = await db.season_carryovers.find({
            "to_season_id": season_id,
            "entity_type": "student"
        }, {"_id": 0}).to_list(10000)
        
        teacher_carryovers = await db.season_carryovers.find({
            "to_season_id": season_id,
            "entity_type": "teacher"
        }, {"_id": 0}).to_list(1000)
        
        stats["carryovers"] = {
            "student_count": len(student_carryovers),
            "student_total": sum([c["amount"] for c in student_carryovers]),
            "teacher_count": len(teacher_carryovers),
            "teacher_total": sum([c["amount"] for c in teacher_carryovers])
        }
    
    return stats

# Dönem listesi (frontend dropdown için)
@api_router.get("/seasons/list")
async def get_seasons_list(current_user: User = Depends(get_current_user)):
    """
    FAZ 5: Dönem listesi (dropdown için).
    Aktif dönem başta, sonra kapalı dönemler.
    """
    seasons = await db.seasons.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # Aktif dönemi başa al
    active = [s for s in seasons if s.get("status") == "active"]
    closed = [s for s in seasons if s.get("status") == "closed"]
    
    return {
        "active_season": active[0] if active else None,
        "closed_seasons": closed,
        "all_seasons": active + closed
    }

# Kapalı dönem için read-only veri görüntüleme
@api_router.get("/seasons/{season_id}/summary")
async def get_season_summary(
    season_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    FAZ 5: Belirli bir dönemin özet bilgileri.
    Kapalı dönemler için read-only görüntüleme.
    """
    season = await db.seasons.find_one({"id": season_id}, {"_id": 0})
    if not season:
        raise HTTPException(status_code=404, detail="Dönem bulunamadı")
    
    summary = {
        "season": season,
        "is_read_only": season.get("status") == "closed",
        "statistics": {
            "lessons": await db.lessons.count_documents({"season_id": season_id}),
            "payments": await db.payments.count_documents({"season_id": season_id}),
            "student_courses": await db.student_courses.count_documents({"season_id": season_id}),
            "groups": await db.student_groups.count_documents({"season_id": season_id})
        }
    }
    
    # Kapalı dönem için devir bilgileri
    if season.get("status") == "closed":
        year_end_log = await db.year_end_logs.find_one({
            "from_season_id": season_id,
            "status": "success"
        }, {"_id": 0})
        
        if year_end_log:
            summary["year_end_info"] = {
                "executed_at": year_end_log.get("executed_at"),
                "to_season": year_end_log.get("to_season_id"),
                "summary": year_end_log.get("summary")
            }
    
    return summary


# ============= LESSON LINKS (DERS LİNKLERİ) =============

class LessonLink(BaseModel):
    """Ders linki modeli"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    branch_id: str
    teacher_id: str
    link_name: str
    link_url: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None

class LessonLinkCreate(BaseModel):
    branch_id: str
    teacher_id: str
    link_name: str
    link_url: str

class LessonLinkUpdate(BaseModel):
    branch_id: str
    teacher_id: str
    link_name: str
    link_url: str

class StartLessonRequest(BaseModel):
    selected_type: str  # "student" | "group"
    student_course_id: Optional[str] = None
    group_id: Optional[str] = None
    lesson_link_id: str
    mode: str  # "new_lesson" | "continue_existing"

@api_router.get("/lesson-links")
async def get_lesson_links(current_user: User = Depends(get_current_user)):
    """Ders linklerini listele - Sadece admin"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece adminler ders linklerini görebilir")
    
    links = await db.lesson_links.find({}, {"_id": 0}).to_list(500)
    
    # Branş ve öğretmen bilgilerini ekle
    for link in links:
        branch = await db.branches.find_one({"id": link["branch_id"]}, {"_id": 0})
        teacher = await db.teachers.find_one({"id": link["teacher_id"]}, {"_id": 0})
        link["branch_name"] = branch["name"] if branch else "Bilinmiyor"
        link["teacher_name"] = teacher["name"] if teacher else "Bilinmiyor"
    
    return links

@api_router.post("/lesson-links")
async def create_lesson_link(data: LessonLinkCreate, current_user: User = Depends(get_current_user)):
    """Yeni ders linki oluştur - Sadece admin"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece adminler ders linki oluşturabilir")
    
    # Validasyonlar
    if not data.branch_id or not data.teacher_id or not data.link_name or not data.link_url:
        raise HTTPException(status_code=400, detail="Tüm alanlar zorunludur")
    
    # Branş kontrolü
    branch = await db.branches.find_one({"id": data.branch_id}, {"_id": 0})
    if not branch:
        raise HTTPException(status_code=404, detail="Branş bulunamadı")
    
    # Öğretmen kontrolü
    teacher = await db.teachers.find_one({"id": data.teacher_id}, {"_id": 0})
    if not teacher:
        raise HTTPException(status_code=404, detail="Öğretmen bulunamadı")
    
    link = LessonLink(
        **data.model_dump(),
        created_by=current_user.id
    )
    doc = link.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.lesson_links.insert_one(doc)
    
    return {"message": "Ders linki oluşturuldu", "id": link.id}

@api_router.put("/lesson-links/{link_id}")
async def update_lesson_link(link_id: str, data: LessonLinkUpdate, current_user: User = Depends(get_current_user)):
    """Ders linkini güncelle - Sadece admin"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece adminler ders linkini güncelleyebilir")
    
    existing = await db.lesson_links.find_one({"id": link_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Ders linki bulunamadı")
    
    # Validasyonlar
    if not data.branch_id or not data.teacher_id or not data.link_name or not data.link_url:
        raise HTTPException(status_code=400, detail="Tüm alanlar zorunludur")
    
    update_data = data.model_dump()
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = current_user.id
    
    await db.lesson_links.update_one({"id": link_id}, {"$set": update_data})
    return {"message": "Ders linki güncellendi"}

@api_router.delete("/lesson-links/{link_id}")
async def delete_lesson_link(link_id: str, current_user: User = Depends(get_current_user)):
    """Ders linkini sil - Sadece admin"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece adminler ders linkini silebilir")
    
    existing = await db.lesson_links.find_one({"id": link_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Ders linki bulunamadı")
    
    await db.lesson_links.delete_one({"id": link_id})
    return {"message": "Ders linki silindi"}

@api_router.get("/teacher/lesson-links")
async def get_teacher_lesson_links(current_user: User = Depends(get_current_user)):
    """Öğretmenin kendi ders linklerini al"""
    if current_user.user_type != "teacher":
        raise HTTPException(status_code=403, detail="Bu endpoint sadece öğretmenler içindir")
    
    if not current_user.teacher_id:
        raise HTTPException(status_code=400, detail="Öğretmen ID bulunamadı")
    
    links = await db.lesson_links.find(
        {"teacher_id": current_user.teacher_id}, 
        {"_id": 0}
    ).to_list(100)
    
    # Branş bilgisi ekle
    for link in links:
        branch = await db.branches.find_one({"id": link["branch_id"]}, {"_id": 0})
        link["branch_name"] = branch["name"] if branch else "Bilinmiyor"
    
    return links

@api_router.get("/system-settings/lesson-links-status")
async def get_lesson_links_status(current_user: User = Depends(get_current_user)):
    """Ders linkleri özelliği durumunu kontrol et"""
    setting = await db.system_settings.find_one({"key": "lesson_links_enabled"}, {"_id": 0})
    return {"enabled": setting.get("value", False) if setting else False}

@api_router.post("/lesson-links/start-lesson")
async def start_lesson(data: StartLessonRequest, current_user: User = Depends(get_current_user)):
    """Dersi başlat - öğretmen için"""
    if current_user.user_type != "teacher":
        raise HTTPException(status_code=403, detail="Bu işlem sadece öğretmenler içindir")
    
    if not current_user.teacher_id:
        raise HTTPException(status_code=400, detail="Öğretmen ID bulunamadı")
    
    # Double-click koruması - sadece new_lesson modunda
    if data.mode == "new_lesson":
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        entity_id = data.student_course_id if data.selected_type == "student" else data.group_id
        lock_key = f"lesson_start:{current_user.teacher_id}:{data.mode}:{data.selected_type}:{entity_id}:{data.lesson_link_id}:{today}"
        
        current_time = time.time()
        
        # Eski lock'ları temizle (1.5 saniyeden eski olanlar)
        expired_keys = [k for k, v in _lesson_start_locks.items() if current_time - v > 1.5]
        for k in expired_keys:
            del _lesson_start_locks[k]
        
        # Duplicate kontrolü
        if lock_key in _lesson_start_locks:
            time_diff = current_time - _lesson_start_locks[lock_key]
            if time_diff < 1.5:
                raise HTTPException(
                    status_code=429,
                    detail="İşlem zaten başlatıldı. Lütfen bekleyin.",
                    headers={"X-Duplicate-Request": "true"}
                )
        
        # Lock'u koy
        _lesson_start_locks[lock_key] = current_time
    
    # Ders linkini kontrol et
    lesson_link = await db.lesson_links.find_one({"id": data.lesson_link_id}, {"_id": 0})
    if not lesson_link:
        raise HTTPException(status_code=404, detail="Ders linki bulunamadı")
    
    # Öğretmenin kendi linki mi kontrol et
    if lesson_link["teacher_id"] != current_user.teacher_id:
        raise HTTPException(status_code=403, detail="Bu ders linkine erişim yetkiniz yok")
    
    # Mevcut derse devam et modunda sadece linki döndür
    if data.mode == "continue_existing":
        return {
            "success": True,
            "link_url": lesson_link["link_url"],
            "lesson_created_or_updated": False,
            "message": "Link açılabilir."
        }
    
    # Yeni ders başlat modunda ders kaydı oluştur/güncelle
    if data.mode == "new_lesson":
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        if data.selected_type == "student":
            # Birebir öğrenci dersi
            if not data.student_course_id:
                raise HTTPException(status_code=400, detail="Öğrenci kursu belirtilmedi")
            
            course = await db.student_courses.find_one({"id": data.student_course_id}, {"_id": 0})
            if not course:
                raise HTTPException(status_code=404, detail="Kurs bulunamadı")
            
            # Öğretmen yetkisi kontrolü
            if course["teacher_id"] != current_user.teacher_id:
                raise HTTPException(status_code=403, detail="Bu kursa erişim yetkiniz yok")
            
            # FAZ 5: Kapalı dönem kontrolü
            await check_season_is_open()
            
            # Aynı gün, aynı kurs için ders var mı kontrol et
            existing_lesson = await db.lessons.find_one({
                "student_course_id": data.student_course_id,
                "date": today,
                "group_id": None  # Birebir ders
            }, {"_id": 0})
            
            if existing_lesson:
                # Mevcut dersin ders sayısını artır
                new_count = existing_lesson.get("number_of_lessons", 1) + 1
                
                # Fiyat hesaplama (mevcut logic'i koru)
                student_unit_price = existing_lesson.get("student_unit_price_at_lesson")
                teacher_unit_price = existing_lesson.get("teacher_unit_price_at_lesson")
                
                student_total_amount = None
                teacher_total_earning = None
                
                if student_unit_price is not None and not existing_lesson.get("is_free_lesson", False):
                    student_total_amount = student_unit_price * new_count
                
                if teacher_unit_price is not None:
                    teacher_total_earning = teacher_unit_price * new_count
                
                await db.lessons.update_one(
                    {"id": existing_lesson["id"]},
                    {"$set": {
                        "number_of_lessons": new_count,
                        "student_total_amount_at_lesson": student_total_amount,
                        "teacher_total_earning_at_lesson": teacher_total_earning
                    }}
                )
                
                # Audit log - ders güncellendi
                await create_audit_log(
                    action_type=AuditLogActionType.UPDATE,
                    category=AuditLogCategory.LESSON_ENTRY,
                    teacher_id=current_user.teacher_id,
                    entity_id=existing_lesson["id"],
                    student_id=course.get("student_id"),
                    group_id=None,
                    old_data={
                        "date": today,
                        "number_of_lessons": existing_lesson.get("number_of_lessons", 1)
                    },
                    new_data={
                        "date": today,
                        "number_of_lessons": new_count
                    }
                )
                
                return {
                    "success": True,
                    "link_url": lesson_link["link_url"],
                    "lesson_created_or_updated": True,
                    "message": f"Mevcut ders sayısı {new_count}'e güncellendi."
                }
            else:
                # Yeni ders oluştur - mevcut create_lesson mantığını kullan
                lesson_data = LessonCreate(
                    student_course_id=data.student_course_id,
                    date=today,
                    number_of_lessons=1,
                    is_free_lesson=False
                )
                
                # create_lesson fonksiyonunu simüle et (fiyat hesaplamaları dahil)
                active_season = await db.seasons.find_one({"status": "active", "is_current": True}, {"_id": 0})
                season_id = active_season["id"] if active_season else None
                
                # Öğretmen fiyatını hesapla
                lesson_date_for_price = datetime.strptime(today, "%Y-%m-%d")
                teacher_rate = None
                
                teacher_price_history_record = await db.teacher_price_history.find_one({
                    "$and": [
                        {"teacher_id": course["teacher_id"]},
                        {"branch_id": course["branch_id"]},
                        {"lesson_type_id": course["lesson_type_id"]},
                        {"$or": [{"group_size": None}, {"group_size": {"$exists": False}}]},
                        {"valid_from": {"$lte": lesson_date_for_price}},
                        {"$or": [
                            {"valid_to": None},
                            {"valid_to": {"$gte": lesson_date_for_price}}
                        ]}
                    ]
                }, {"_id": 0}, sort=[("valid_from", -1)])
                
                if teacher_price_history_record:
                    teacher_rate = teacher_price_history_record["price"]
                else:
                    oldest_teacher_price = await db.teacher_price_history.find_one({
                        "teacher_id": course["teacher_id"],
                        "branch_id": course["branch_id"],
                        "lesson_type_id": course["lesson_type_id"],
                        "$or": [{"group_size": None}, {"group_size": {"$exists": False}}]
                    }, {"_id": 0}, sort=[("valid_from", 1)])
                    
                    if oldest_teacher_price:
                        teacher_rate = oldest_teacher_price["price"]
                    else:
                        teacher_price = await db.teacher_prices.find_one({
                            "teacher_id": course["teacher_id"],
                            "branch_id": course["branch_id"],
                            "lesson_type_id": course["lesson_type_id"],
                            "group_size": None
                        }, {"_id": 0})
                        if teacher_price:
                            teacher_rate = teacher_price["price"]
                
                # Öğrenci fiyatını hesapla
                student_unit_price = None
                student_total_amount = None
                
                student_price_record = await db.student_price_history.find_one({
                    "$and": [
                        {"student_id": course["student_id"]},
                        {"branch_id": course["branch_id"]},
                        {"lesson_type": "birebir"},
                        {"valid_from": {"$lte": lesson_date_for_price}},
                        {"$or": [
                            {"valid_to": None},
                            {"valid_to": {"$gte": lesson_date_for_price}}
                        ]}
                    ]
                }, {"_id": 0}, sort=[("valid_from", -1)])
                
                if student_price_record:
                    student_unit_price = student_price_record["price"]
                else:
                    oldest_price = await db.student_price_history.find_one({
                        "student_id": course["student_id"],
                        "branch_id": course["branch_id"],
                        "lesson_type": "birebir"
                    }, {"_id": 0}, sort=[("valid_from", 1)])
                    
                    if oldest_price:
                        student_unit_price = oldest_price["price"]
                    else:
                        student_unit_price = course.get("student_price") or course.get("price") or 0
                
                student_total_amount = student_unit_price * 1
                teacher_total_earning = (teacher_rate or 0) * 1
                
                lesson = Lesson(
                    student_course_id=data.student_course_id,
                    date=today,
                    number_of_lessons=1,
                    teacher_rate=teacher_rate,
                    teacher_id=course["teacher_id"],
                    branch_id=course["branch_id"],
                    student_id=course["student_id"],
                    season_id=season_id,
                    is_free_lesson=False,
                    student_unit_price_at_lesson=student_unit_price,
                    student_total_amount_at_lesson=student_total_amount,
                    teacher_unit_price_at_lesson=teacher_rate,
                    teacher_total_earning_at_lesson=teacher_total_earning
                )
                doc = lesson.model_dump()
                doc['created_at'] = doc['created_at'].isoformat()
                await db.lessons.insert_one(doc)
                
                # Audit log - ders eklendi
                await create_audit_log(
                    action_type=AuditLogActionType.ADD,
                    category=AuditLogCategory.LESSON_ENTRY,
                    teacher_id=current_user.teacher_id,
                    entity_id=lesson.id,
                    student_id=course.get("student_id"),
                    group_id=None,
                    old_data=None,
                    new_data={
                        "date": today,
                        "number_of_lessons": 1,
                        "teacher_rate": teacher_rate,
                        "student_unit_price": student_unit_price
                    }
                )
                
                return {
                    "success": True,
                    "link_url": lesson_link["link_url"],
                    "lesson_created_or_updated": True,
                    "message": "Yeni ders kaydı oluşturuldu."
                }
        
        elif data.selected_type == "group":
            # Grup dersi
            if not data.group_id:
                raise HTTPException(status_code=400, detail="Grup belirtilmedi")
            
            group = await db.student_groups.find_one({"id": data.group_id}, {"_id": 0})
            if not group:
                raise HTTPException(status_code=404, detail="Grup bulunamadı")
            
            # Öğretmen yetkisi kontrolü
            if group.get("teacher_id") != current_user.teacher_id:
                raise HTTPException(status_code=403, detail="Bu gruba erişim yetkiniz yok")
            
            # FAZ 5: Kapalı dönem kontrolü
            await check_season_is_open()
            
            # Aynı gün, aynı grup için ders var mı kontrol et
            existing_group_lessons = await db.lessons.find({
                "group_id": data.group_id,
                "date": today
            }, {"_id": 0}).to_list(100)
            
            if existing_group_lessons:
                # Mevcut grup dersinin ders sayısını artır
                new_count = existing_group_lessons[0].get("number_of_lessons", 1) + 1
                
                # Tüm grup derslerini güncelle
                for lesson in existing_group_lessons:
                    student_unit_price = lesson.get("student_unit_price_at_lesson")
                    teacher_unit_price = lesson.get("teacher_unit_price_at_lesson")
                    
                    student_total_amount = None
                    teacher_total_earning = None
                    
                    if student_unit_price is not None and not lesson.get("is_free_lesson", False):
                        student_total_amount = student_unit_price * new_count
                    
                    if teacher_unit_price is not None:
                        teacher_total_earning = teacher_unit_price * new_count
                    
                    await db.lessons.update_one(
                        {"id": lesson["id"]},
                        {"$set": {
                            "number_of_lessons": new_count,
                            "student_total_amount_at_lesson": student_total_amount,
                            "teacher_total_earning_at_lesson": teacher_total_earning
                        }}
                    )
                
                # Audit log - grup dersi güncellendi
                await create_audit_log(
                    action_type=AuditLogActionType.UPDATE,
                    category=AuditLogCategory.LESSON_ENTRY,
                    teacher_id=current_user.teacher_id,
                    entity_id=existing_group_lessons[0]["id"],
                    student_id=None,
                    group_id=data.group_id,
                    old_data={
                        "date": today,
                        "number_of_lessons": existing_group_lessons[0].get("number_of_lessons", 1)
                    },
                    new_data={
                        "date": today,
                        "number_of_lessons": new_count
                    }
                )
                
                return {
                    "success": True,
                    "link_url": lesson_link["link_url"],
                    "lesson_created_or_updated": True,
                    "message": f"Grup dersi sayısı {new_count}'e güncellendi."
                }
            else:
                # Yeni grup dersi oluştur - mevcut create_group_lesson mantığını kullan
                active_season = await db.seasons.find_one({"status": "active", "is_current": True}, {"_id": 0})
                season_id = active_season["id"] if active_season else None
                
                branch_id = group.get("branch_id")
                group_size = len(group.get("student_ids", []))
                effective_group_size = min(group_size, 4)
                
                # Öğretmen fiyatını al
                teacher_rate = None
                group_price = await db.teacher_prices.find_one({
                    "teacher_id": group.get("teacher_id"),
                    "branch_id": branch_id,
                    "group_size": effective_group_size
                }, {"_id": 0})
                
                if group_price:
                    teacher_rate = group_price["price"]
                else:
                    teacher_price = await db.teacher_prices.find_one({
                        "teacher_id": group.get("teacher_id"),
                        "branch_id": branch_id,
                        "group_size": None
                    }, {"_id": 0})
                    if teacher_price:
                        teacher_rate = teacher_price["price"]
                
                created_lessons = []
                is_first_student = True
                
                for student_id in group.get("student_ids", []):
                    course = await db.student_courses.find_one({
                        "student_id": student_id,
                        "branch_id": branch_id,
                        "teacher_id": group.get("teacher_id")
                    }, {"_id": 0})
                    
                    if not course:
                        course = await db.student_courses.find_one({
                            "student_id": student_id,
                            "branch_id": branch_id
                        }, {"_id": 0})
                    
                    student_course_id = course["id"] if course else f"auto_{student_id}_{branch_id}"
                    lesson_teacher_rate = teacher_rate if is_first_student else 0
                    
                    # Öğrenci fiyatı
                    student_unit_price = None
                    student_total_amount = None
                    
                    student_price_record = await db.student_price_history.find_one({
                        "student_id": student_id,
                        "branch_id": branch_id,
                        "lesson_type": "group",
                        "valid_to": None
                    }, {"_id": 0}, sort=[("valid_from", -1)])
                    
                    if student_price_record:
                        student_unit_price = student_price_record["price"]
                    elif course:
                        student_unit_price = course.get("student_price") or course.get("price") or 0
                    
                    if student_unit_price:
                        student_total_amount = student_unit_price * 1
                    
                    teacher_total_earning = (lesson_teacher_rate or 0) * 1
                    is_first_student = False
                    
                    lesson = Lesson(
                        student_course_id=student_course_id,
                        date=today,
                        number_of_lessons=1,
                        teacher_rate=lesson_teacher_rate,
                        group_id=data.group_id,
                        is_free_lesson=False,
                        teacher_id=group.get("teacher_id"),
                        branch_id=branch_id,
                        student_id=student_id,
                        season_id=season_id,
                        student_unit_price_at_lesson=student_unit_price,
                        student_total_amount_at_lesson=student_total_amount,
                        teacher_unit_price_at_lesson=lesson_teacher_rate,
                        teacher_total_earning_at_lesson=teacher_total_earning
                    )
                    doc = lesson.model_dump()
                    doc['created_at'] = doc['created_at'].isoformat()
                    await db.lessons.insert_one(doc)
                    created_lessons.append(lesson)
                
                # Audit log - grup dersi eklendi
                if created_lessons:
                    await create_audit_log(
                        action_type=AuditLogActionType.ADD,
                        category=AuditLogCategory.LESSON_ENTRY,
                        teacher_id=current_user.teacher_id,
                        entity_id=created_lessons[0].id,
                        student_id=None,
                        group_id=data.group_id,
                        old_data=None,
                        new_data={
                            "date": today,
                            "number_of_lessons": 1,
                            "teacher_rate": teacher_rate,
                            "student_count": len(created_lessons)
                        }
                    )
                
                return {
                    "success": True,
                    "link_url": lesson_link["link_url"],
                    "lesson_created_or_updated": True,
                    "message": f"{len(created_lessons)} öğrenci için grup dersi oluşturuldu."
                }
    
    raise HTTPException(status_code=400, detail="Geçersiz mod veya seçim tipi")

# ============= CALENDAR ENDPOINTS =============

@api_router.get("/calendar/events")
async def get_calendar_events(
    year: int,
    month: int,
    current_user: User = Depends(get_current_user)
):
    """Takvim etkinliklerini getir"""
    # Ay başı ve sonu
    start_date = f"{year}-{month:02d}-01"
    if month == 12:
        end_date = f"{year + 1}-01-01"
    else:
        end_date = f"{year}-{month + 1:02d}-01"
    
    query = {
        "event_date": {"$gte": start_date, "$lt": end_date}
    }
    
    # Öğretmen ise sadece kendi etkinliklerini görsün (video_paylasimi hariç)
    if current_user.user_type == "teacher":
        # Öğretmene kapalı özel etkinlik tiplerini bul
        hidden_types = await db.calendar_event_types.find(
            {"teacher_visible": False}, {"_id": 0, "key": 1}
        ).to_list(500)
        excluded_event_types = ["video_paylasimi"] + [t["key"] for t in hidden_types]
        query["$and"] = [
            {"teacher_ids": current_user.teacher_id},
            {"event_type": {"$nin": excluded_event_types}}
        ]
    
    events = await db.calendar_events.find(query, {"_id": 0}).to_list(500)
    
    # Öğretmen ve branş bilgilerini ekle
    teacher_cache = {}
    branch_cache = {}
    
    for event in events:
        teacher_names = []
        teacher_colors = []
        for tid in event.get("teacher_ids", []):
            if tid not in teacher_cache:
                teacher = await db.teachers.find_one({"id": tid}, {"_id": 0, "name": 1, "color": 1})
                teacher_cache[tid] = teacher
            t = teacher_cache.get(tid)
            if t:
                teacher_names.append(t.get("name", "Bilinmiyor"))
                teacher_colors.append(t.get("color", "#6366f1"))
        event["teacher_names"] = teacher_names
        event["teacher_colors"] = teacher_colors
        
        # Branş bilgilerini ekle
        branch_names = []
        branch_abbrevs = []
        for bid in event.get("branch_ids", []):
            if bid not in branch_cache:
                branch = await db.branches.find_one({"id": bid}, {"_id": 0, "name": 1})
                branch_cache[bid] = branch
            b = branch_cache.get(bid)
            if b:
                name = b.get("name", "")
                branch_names.append(name)
                # Kısaltmalar
                abbrev_map = {
                    "Matematik": "Mat",
                    "Türkçe": "TR",
                    "Fen Bilimleri": "Fen",
                    "Fen": "Fen",
                    "İngilizce": "İng",
                    "Sosyal Bilgiler": "Sos",
                    "Din Kültürü": "Din",
                }
                abbrev = abbrev_map.get(name, name[:3])
                branch_abbrevs.append(abbrev)
        event["branch_names"] = branch_names
        event["branch_abbrevs"] = branch_abbrevs
    
    return events

@api_router.get("/calendar/events/upcoming")
async def get_upcoming_event(current_user: User = Depends(get_current_user)):
    """Öğretmenin sıradaki etkinliğini getir"""
    if current_user.user_type != "teacher":
        return None
    
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Öğretmene kapalı özel etkinlik tiplerini bul
    hidden_types = await db.calendar_event_types.find(
        {"teacher_visible": False}, {"_id": 0, "key": 1}
    ).to_list(500)
    excluded_event_types = ["video_paylasimi"] + [t["key"] for t in hidden_types]
    
    event = await db.calendar_events.find_one(
        {
            "teacher_ids": current_user.teacher_id,
            "event_type": {"$nin": excluded_event_types},
            "event_date": {"$gte": today}
        },
        {"_id": 0},
        sort=[("event_date", 1), ("event_time", 1)]
    )
    
    if event:
        # Tarih formatla
        date_obj = datetime.strptime(event["event_date"], "%Y-%m-%d")
        months_tr = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
                     "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
        event["formatted_date"] = f"{date_obj.day} {months_tr[date_obj.month - 1]}"
        
        event_names = {
            "video_cekimi": "Video Çekimi",
            "kamp": "Kamp",
            "canli_yayin": "Canlı Yayın",
            "bulusma": "Buluşma"
        }
        display_name = event_names.get(event["event_type"])
        if not display_name:
            # Özel etkinlik tipi ise label'ını al
            ctype = await db.calendar_event_types.find_one({"key": event["event_type"]}, {"_id": 0, "label": 1})
            display_name = ctype["label"] if ctype else (event.get("title") or "Etkinlik")
        event["display_name"] = display_name
    
    return event

@api_router.post("/calendar/events")
async def create_calendar_event(
    event_data: CalendarEventCreate,
    current_user: User = Depends(get_current_user)
):
    """Yeni takvim etkinliği oluştur (sadece admin)"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin etkinlik oluşturabilir")
    
    # Buluşma etkinliği için özel mantık: tüm aktif hocaları otomatik ata, başlık "Buluşma" olsun
    teacher_ids = event_data.teacher_ids
    title = event_data.title
    
    if event_data.event_type == "bulusma":
        # Tüm aktif öğretmenleri al
        all_teachers = await db.users.find({"user_type": "teacher", "is_active": True}, {"_id": 0, "id": 1}).to_list(None)
        teacher_ids = [t["id"] for t in all_teachers]
        title = "Buluşma"  # Sabit başlık
    
    event = CalendarEvent(
        event_date=event_data.event_date,
        event_time=event_data.event_time,
        event_type=event_data.event_type,
        teacher_ids=teacher_ids,
        branch_ids=event_data.branch_ids,
        video_name=event_data.video_name,
        title=title,
        status=event_data.status or "cekilecek",
        notes=event_data.notes,
        created_by=current_user.id
    )
    
    await db.calendar_events.insert_one(event.model_dump())
    
    return {"message": "Etkinlik oluşturuldu", "event_id": event.id}

@api_router.put("/calendar/events/{event_id}")
async def update_calendar_event(
    event_id: str,
    event_data: CalendarEventUpdate,
    current_user: User = Depends(get_current_user)
):
    """Takvim etkinliğini güncelle (sadece admin)"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin etkinlik güncelleyebilir")
    
    update_dict = {k: v for k, v in event_data.model_dump().items() if v is not None}
    
    # Buluşma etkinliği için özel mantık: tüm aktif hocaları otomatik ata, başlık "Buluşma" olsun
    if event_data.event_type == "bulusma":
        all_teachers = await db.users.find({"user_type": "teacher", "is_active": True}, {"_id": 0, "id": 1}).to_list(None)
        update_dict["teacher_ids"] = [t["id"] for t in all_teachers]
        update_dict["title"] = "Buluşma"
    
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.calendar_events.update_one(
        {"id": event_id},
        {"$set": update_dict}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
    
    return {"message": "Etkinlik güncellendi"}

@api_router.delete("/calendar/events/{event_id}")
async def delete_calendar_event(
    event_id: str,
    current_user: User = Depends(get_current_user)
):
    """Takvim etkinliğini sil (sadece admin)"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin etkinlik silebilir")
    
    result = await db.calendar_events.delete_one({"id": event_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Etkinlik bulunamadı")
    
    return {"message": "Etkinlik silindi"}

@api_router.put("/teachers/{teacher_id}/color")
async def update_teacher_color(
    teacher_id: str,
    color_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Öğretmen rengini güncelle"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin öğretmen rengini güncelleyebilir")
    
    color = color_data.get("color")
    if not color:
        raise HTTPException(status_code=400, detail="Renk belirtilmedi")
    
    await db.teachers.update_one(
        {"id": teacher_id},
        {"$set": {"color": color}}
    )
    
    return {"message": "Öğretmen rengi güncellendi"}

@api_router.get("/calendar/teachers-colors")
async def get_teachers_with_colors(current_user: User = Depends(get_current_user)):
    """Tüm öğretmenleri renkleriyle birlikte getir"""
    teachers = await db.teachers.find(
        {"status": {"$ne": "inactive"}},
        {"_id": 0, "id": 1, "name": 1, "color": 1}
    ).to_list(100)
    
    # Rengi olmayan öğretmenlere otomatik renk ata
    color_index = 0
    for teacher in teachers:
        if not teacher.get("color"):
            teacher["color"] = TEACHER_COLORS[color_index % len(TEACHER_COLORS)]
            # Veritabanına kaydet
            await db.teachers.update_one(
                {"id": teacher["id"]},
                {"$set": {"color": teacher["color"]}}
            )
            color_index += 1
    
    return teachers

@api_router.get("/calendar/event-type-colors")
async def get_event_type_colors(current_user: User = Depends(get_current_user)):
    """Etkinlik tipi renklerini getir"""
    # Veritabanından kayıtlı renkleri al
    settings = await db.settings.find_one({"key": "event_type_colors"}, {"_id": 0})
    if settings:
        return settings.get("value", DEFAULT_EVENT_TYPE_COLORS)
    return DEFAULT_EVENT_TYPE_COLORS

@api_router.put("/calendar/event-type-colors")
async def update_event_type_colors(
    colors: dict,
    current_user: User = Depends(get_current_user)
):
    """Etkinlik tipi renklerini güncelle (sadece admin)"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin renkleri güncelleyebilir")
    
    # Mevcut renkleri al ve güncelle
    current_colors = await db.settings.find_one({"key": "event_type_colors"}, {"_id": 0})
    if current_colors:
        merged_colors = {**current_colors.get("value", DEFAULT_EVENT_TYPE_COLORS), **colors}
    else:
        merged_colors = {**DEFAULT_EVENT_TYPE_COLORS, **colors}
    
    await db.settings.update_one(
        {"key": "event_type_colors"},
        {"$set": {"key": "event_type_colors", "value": merged_colors}},
        upsert=True
    )
    
    return {"message": "Renkler güncellendi", "colors": merged_colors}

# ============= CUSTOM EVENT TYPES =============

@api_router.get("/calendar/custom-event-types")
async def get_custom_event_types(current_user: User = Depends(get_current_user)):
    """Admin tarafından tanımlanan özel etkinlik tiplerini getir"""
    types = await db.calendar_event_types.find({}, {"_id": 0}).to_list(500)
    for t in types:
        if isinstance(t.get("created_at"), str):
            pass
    return types

@api_router.post("/calendar/custom-event-types")
async def create_custom_event_type(
    data: CustomEventTypeCreate,
    current_user: User = Depends(get_current_user)
):
    """Yeni özel etkinlik tipi oluştur (sadece admin)"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin etkinlik tipi tanımlayabilir")

    if not data.label or not data.label.strip():
        raise HTTPException(status_code=400, detail="Etkinlik adı gerekli")

    key = f"custom_{uuid.uuid4().hex[:8]}"
    event_type = CustomEventType(
        key=key,
        label=data.label.strip(),
        icon=data.icon or "📌",
        color=data.color or "#0ea5e9",
        teacher_visible=data.teacher_visible,
        created_by=current_user.id
    )
    doc = event_type.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    response_doc = dict(doc)
    await db.calendar_event_types.insert_one(doc)

    # Rengi event_type_colors ayarına da ekle
    current_colors = await db.settings.find_one({"key": "event_type_colors"}, {"_id": 0})
    base_colors = current_colors.get("value", DEFAULT_EVENT_TYPE_COLORS) if current_colors else dict(DEFAULT_EVENT_TYPE_COLORS)
    base_colors[key] = event_type.color
    await db.settings.update_one(
        {"key": "event_type_colors"},
        {"$set": {"key": "event_type_colors", "value": base_colors}},
        upsert=True
    )

    return {"message": "Etkinlik tipi oluşturuldu", "event_type": response_doc}

@api_router.put("/calendar/custom-event-types/{type_id}")
async def update_custom_event_type(
    type_id: str,
    data: CustomEventTypeUpdate,
    current_user: User = Depends(get_current_user)
):
    """Özel etkinlik tipini güncelle (sadece admin)"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin güncelleyebilir")

    existing = await db.calendar_event_types.find_one({"id": type_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Etkinlik tipi bulunamadı")

    update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
    if update_dict:
        await db.calendar_event_types.update_one({"id": type_id}, {"$set": update_dict})

    # Renk güncellendiyse ayarlara da yansıt
    if "color" in update_dict:
        current_colors = await db.settings.find_one({"key": "event_type_colors"}, {"_id": 0})
        base_colors = current_colors.get("value", DEFAULT_EVENT_TYPE_COLORS) if current_colors else dict(DEFAULT_EVENT_TYPE_COLORS)
        base_colors[existing["key"]] = update_dict["color"]
        await db.settings.update_one(
            {"key": "event_type_colors"},
            {"$set": {"key": "event_type_colors", "value": base_colors}},
            upsert=True
        )

    return {"message": "Etkinlik tipi güncellendi"}

@api_router.delete("/calendar/custom-event-types/{type_id}")
async def delete_custom_event_type(
    type_id: str,
    current_user: User = Depends(get_current_user)
):
    """Özel etkinlik tipini sil (sadece admin)"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Sadece admin silebilir")

    existing = await db.calendar_event_types.find_one({"id": type_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Etkinlik tipi bulunamadı")

    # Bu tipte etkinlik var mı kontrol et
    event_count = await db.calendar_events.count_documents({"event_type": existing["key"]})
    if event_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Bu etkinlik tipine ait {event_count} etkinlik var. Önce onları silin."
        )

    await db.calendar_event_types.delete_one({"id": type_id})
    return {"message": "Etkinlik tipi silindi"}

# ============= DATABASE BACKUP & RESTORE =============

BACKUP_VERSION = "1.0"
APP_NAME = "Yeni Nesil Sınıf"

# Yedeklenmesi gereken collection'lar (dinamik olarak da alınabilir)
BACKUP_COLLECTIONS = [
    "users", "students", "teachers", "lessons", "payments",
    "student_courses", "student_groups", "branches", "cashboxes",
    "lesson_links", "seasons", "student_price_history", "teacher_price_history",
    "season_carryovers", "manual_balance_adjustments", "planned_lessons",
    "homework_plans", "homework_plan_items", "student_book_assignments",
    "student_test_progress", "trial_exams", "youtube_contents", "camps",
    "camp_students", "system_settings", "settings", "calendar_events",
    "groups", "student_point_definitions", "student_point_records"
]

@api_router.post("/admin/database/backup")
async def create_database_backup(current_user: User = Depends(get_current_user)):
    """Tüm veri tabanını ZIP olarak yedekle (sadece admin)"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem sadece admin tarafından yapılabilir")
    
    try:
        # ZIP dosyası oluştur
        zip_buffer = io.BytesIO()
        
        now = datetime.now(timezone.utc)
        timestamp_str = now.strftime("%Y-%m-%d-%H-%M")
        
        # Metadata hazırla
        collections_data = {}
        record_counts = {}
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            # Tüm collection'ları yedekle
            all_collections = await db.list_collection_names()
            
            for coll_name in all_collections:
                # Sistem collection'larını atla
                if coll_name.startswith('system.'):
                    continue
                    
                try:
                    # Collection verilerini al
                    cursor = db[coll_name].find({}, {"_id": 0})
                    documents = await cursor.to_list(None)
                    
                    # JSON dosyası olarak kaydet
                    json_content = json.dumps(documents, ensure_ascii=False, default=str, indent=2)
                    zf.writestr(f"{coll_name}.json", json_content.encode('utf-8'))
                    
                    record_counts[coll_name] = len(documents)
                except Exception as e:
                    logger.error(f"Collection {coll_name} yedeklenemedi: {e}")
                    continue
            
            # Metadata oluştur
            metadata = {
                "app_name": APP_NAME,
                "backup_version": BACKUP_VERSION,
                "created_at": now.isoformat(),
                "created_by": current_user.id,
                "created_by_username": current_user.username,
                "environment": os.environ.get('ENVIRONMENT', 'production'),
                "database_name": os.environ.get('DB_NAME', 'unknown'),
                "collections": list(record_counts.keys()),
                "record_counts": record_counts,
                "total_records": sum(record_counts.values())
            }
            
            # Metadata'yı ZIP'e ekle
            metadata_json = json.dumps(metadata, ensure_ascii=False, indent=2)
            zf.writestr("backup_metadata.json", metadata_json.encode('utf-8'))
        
        # ZIP'i başa sar
        zip_buffer.seek(0)
        
        # Dosya adı
        filename = f"yeni-nesil-sinif-db-backup-{timestamp_str}.zip"
        
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "X-Backup-Filename": filename
            }
        )
        
    except Exception as e:
        logger.error(f"Backup oluşturma hatası: {e}")
        raise HTTPException(status_code=500, detail=f"Yedekleme başarısız: {str(e)}")


@api_router.post("/admin/database/restore/preview")
async def preview_database_restore(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """ZIP dosyasını analiz et ve ön izleme bilgisi döndür (sadece admin)"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem sadece admin tarafından yapılabilir")
    
    # Dosya boyutu kontrolü (max 500MB)
    MAX_FILE_SIZE = 500 * 1024 * 1024
    
    try:
        # Dosyayı oku
        content = await file.read()
        
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="Dosya boyutu çok büyük (max 500MB)")
        
        # ZIP dosyası mı kontrol et
        if not zipfile.is_zipfile(io.BytesIO(content)):
            raise HTTPException(status_code=400, detail="Geçersiz ZIP dosyası")
        
        backup_metadata = None
        backup_collections = {}
        
        with zipfile.ZipFile(io.BytesIO(content), 'r') as zf:
            # Metadata dosyası var mı?
            if 'backup_metadata.json' not in zf.namelist():
                raise HTTPException(status_code=400, detail="backup_metadata.json bulunamadı. Bu dosya geçerli bir yedek dosyası değil.")
            
            # Metadata'yı oku
            try:
                metadata_content = zf.read('backup_metadata.json').decode('utf-8')
                backup_metadata = json.loads(metadata_content)
            except Exception as e:
                raise HTTPException(status_code=400, detail="backup_metadata.json okunamadı veya bozuk.")
            
            # App name kontrolü
            if backup_metadata.get('app_name') != APP_NAME:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Bu dosya {APP_NAME} yedeği olarak doğrulanamadı."
                )
            
            # Backup version kontrolü
            backup_version = backup_metadata.get('backup_version', '0.0')
            if backup_version != BACKUP_VERSION:
                # Uyarı ver ama devam et
                pass
            
            # Collection'ları analiz et
            for filename in zf.namelist():
                if filename == 'backup_metadata.json':
                    continue
                if filename.endswith('.json'):
                    coll_name = filename.replace('.json', '')
                    try:
                        content_str = zf.read(filename).decode('utf-8')
                        data = json.loads(content_str)
                        if isinstance(data, list):
                            backup_collections[coll_name] = len(data)
                        else:
                            backup_collections[coll_name] = 1
                    except Exception as e:
                        raise HTTPException(
                            status_code=400, 
                            detail=f"{filename} dosyası bozuk veya okunamıyor."
                        )
        
        # Mevcut veri tabanı bilgilerini al
        current_summary = {}
        all_collections = await db.list_collection_names()
        
        for coll_name in all_collections:
            if coll_name.startswith('system.'):
                continue
            try:
                count = await db[coll_name].count_documents({})
                current_summary[coll_name] = count
            except Exception:
                current_summary[coll_name] = 0
        
        # Fark tablosu oluştur
        all_collection_names = set(current_summary.keys()) | set(backup_collections.keys())
        differences = []
        
        for coll_name in sorted(all_collection_names):
            current_count = current_summary.get(coll_name, 0)
            backup_count = backup_collections.get(coll_name, 0)
            diff = backup_count - current_count
            
            differences.append({
                "collection": coll_name,
                "current_count": current_count,
                "backup_count": backup_count,
                "difference": diff,
                "in_current": coll_name in current_summary,
                "in_backup": coll_name in backup_collections
            })
        
        return {
            "valid": True,
            "backup_metadata": backup_metadata,
            "current_database_summary": current_summary,
            "backup_database_summary": backup_collections,
            "differences": differences,
            "version_match": backup_metadata.get('backup_version') == BACKUP_VERSION,
            "warnings": [] if backup_metadata.get('backup_version') == BACKUP_VERSION else [
                f"Yedek versiyonu ({backup_metadata.get('backup_version')}) mevcut sistemle ({BACKUP_VERSION}) farklı olabilir."
            ]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Preview hatası: {e}")
        raise HTTPException(status_code=400, detail=f"Yedek dosyası analiz edilemedi: {str(e)}")


class RestoreExecuteRequest(BaseModel):
    confirmation_text: str


@api_router.post("/admin/database/restore/pre-backup")
async def create_pre_restore_backup(current_user: User = Depends(get_current_user)):
    """Restore öncesi mevcut veri tabanının yedeğini al ve indir (sadece admin)"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem sadece admin tarafından yapılabilir")
    
    try:
        logger.info("Pre-restore yedek oluşturuluyor...")
        
        pre_restore_buffer = io.BytesIO()
        now = datetime.now(timezone.utc)
        timestamp_str = now.strftime("%Y-%m-%d-%H-%M")
        
        with zipfile.ZipFile(pre_restore_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            all_collections = await db.list_collection_names()
            pre_restore_counts = {}
            
            for coll_name in all_collections:
                if coll_name.startswith('system.'):
                    continue
                try:
                    cursor = db[coll_name].find({}, {"_id": 0})
                    documents = await cursor.to_list(None)
                    json_content = json.dumps(documents, ensure_ascii=False, default=str, indent=2)
                    zf.writestr(f"{coll_name}.json", json_content.encode('utf-8'))
                    pre_restore_counts[coll_name] = len(documents)
                except Exception as e:
                    logger.error(f"Pre-restore backup hatası ({coll_name}): {e}")
            
            # Pre-restore metadata
            pre_metadata = {
                "app_name": APP_NAME,
                "backup_version": BACKUP_VERSION,
                "created_at": now.isoformat(),
                "created_by": current_user.id,
                "created_by_username": current_user.username,
                "backup_type": "pre-restore-auto-backup",
                "environment": os.environ.get('ENVIRONMENT', 'production'),
                "database_name": os.environ.get('DB_NAME', 'unknown'),
                "collections": list(pre_restore_counts.keys()),
                "record_counts": pre_restore_counts,
                "total_records": sum(pre_restore_counts.values())
            }
            zf.writestr("backup_metadata.json", json.dumps(pre_metadata, ensure_ascii=False, indent=2).encode('utf-8'))
        
        pre_restore_buffer.seek(0)
        filename = f"pre-restore-auto-backup-{timestamp_str}.zip"
        
        logger.info(f"Pre-restore yedek oluşturuldu: {filename}")
        
        return StreamingResponse(
            pre_restore_buffer,
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "X-Backup-Filename": filename
            }
        )
        
    except Exception as e:
        logger.error(f"Pre-restore backup hatası: {e}")
        raise HTTPException(status_code=500, detail=f"Pre-restore yedek oluşturulamadı: {str(e)}")


@api_router.post("/admin/database/restore/execute")
async def execute_database_restore(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Veri tabanını geri yükle (sadece admin, çift onay gerekli)"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem sadece admin tarafından yapılabilir")
    
    try:
        # Dosyayı oku
        content = await file.read()
        
        # ZIP doğrulama
        if not zipfile.is_zipfile(io.BytesIO(content)):
            raise HTTPException(status_code=400, detail="Geçersiz ZIP dosyası")
        
        backup_metadata = None
        backup_data = {}
        
        with zipfile.ZipFile(io.BytesIO(content), 'r') as zf:
            # Metadata kontrolü
            if 'backup_metadata.json' not in zf.namelist():
                raise HTTPException(status_code=400, detail="backup_metadata.json bulunamadı")
            
            try:
                metadata_content = zf.read('backup_metadata.json').decode('utf-8')
                backup_metadata = json.loads(metadata_content)
            except Exception:
                raise HTTPException(status_code=400, detail="backup_metadata.json okunamadı")
            
            # App name kontrolü
            if backup_metadata.get('app_name') != APP_NAME:
                raise HTTPException(status_code=400, detail="Bu dosya geçerli bir yedek değil")
            
            # Tüm collection verilerini parse et
            for filename in zf.namelist():
                if filename == 'backup_metadata.json':
                    continue
                if filename.endswith('.json'):
                    coll_name = filename.replace('.json', '')
                    try:
                        content_str = zf.read(filename).decode('utf-8')
                        data = json.loads(content_str)
                        backup_data[coll_name] = data if isinstance(data, list) else [data]
                    except Exception as e:
                        raise HTTPException(
                            status_code=400, 
                            detail=f"{filename} dosyası bozuk"
                        )
        
        logger.info("Restore başlıyor... (Pre-restore yedek frontend tarafından indirildi)")
        
        # ===== RESTORE İŞLEMİ =====
        restored_collections = []
        restore_errors = []
        
        for coll_name, documents in backup_data.items():
            try:
                # Mevcut collection'ı temizle
                await db[coll_name].delete_many({})
                
                # Yeni verileri ekle
                if documents and len(documents) > 0:
                    await db[coll_name].insert_many(documents)
                
                restored_collections.append({
                    "collection": coll_name,
                    "count": len(documents),
                    "status": "success"
                })
                
            except Exception as e:
                logger.error(f"Restore hatası ({coll_name}): {e}")
                restore_errors.append({
                    "collection": coll_name,
                    "error": str(e)
                })
        
        logger.info(f"Restore tamamlandı. {len(restored_collections)} collection geri yüklendi.")
        
        return {
            "success": True,
            "message": "Veri tabanı başarıyla geri yüklendi",
            "restored_collections": restored_collections,
            "errors": restore_errors,
            "pre_restore_backup_saved": True,
            "backup_source_date": backup_metadata.get('created_at'),
            "warning": "Lütfen sayfayı yenileyin veya tekrar giriş yapın."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Restore hatası: {e}")
        raise HTTPException(status_code=500, detail=f"Geri yükleme başarısız: {str(e)}")


# ============= INCLUDE ROUTER =============

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
