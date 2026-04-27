from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
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
    status: str = "active"
    season_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TeacherCreate(BaseModel):
    name: str
    phone: str
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
    name: str
    status: str = "active"
    is_current: bool = False

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
    status: str = "active"  # active / inactive
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StudentGroupCreate(BaseModel):
    name: str
    branch_id: str
    level: str
    student_ids: List[str]
    teacher_id: Optional[str] = None
    status: str = "active"

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
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StudentCourseCreate(BaseModel):
    student_id: str
    teacher_id: str
    branch_id: str
    lesson_type_id: str
    price: float
    student_price: Optional[float] = None
    season_id: Optional[str] = None

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
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class LessonCreate(BaseModel):
    student_course_id: str
    date: str
    number_of_lessons: int
    season_id: Optional[str] = None

class PlannedLesson(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_course_id: str
    dates: str  # Comma-separated dates
    number_of_lessons: int
    messaged: bool = False
    month: str
    no_lesson_this_month: bool = False  # Bu ay dersi yok
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PlannedLessonCreate(BaseModel):
    student_course_id: str
    dates: str  # Comma-separated dates
    number_of_lessons: int
    messaged: bool = False
    month: str
    no_lesson_this_month: bool = False  # Bu ay dersi yok

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
    
    # Öğretmen bazında öğrenci sayısı
    student_courses = await db.student_courses.find({"status": "active"}, {"_id": 0}).to_list(10000)
    teachers = await db.teachers.find({"status": "active"}, {"_id": 0}).to_list(1000)
    
    # Her öğretmenin benzersiz öğrenci sayısı
    teacher_student_counts = {}
    for teacher in teachers:
        teacher_students = set()
        for course in student_courses:
            if course["teacher_id"] == teacher["id"]:
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
    return teachers

@api_router.get("/teachers/{teacher_id}", response_model=Teacher)
async def get_teacher(teacher_id: str, current_user: User = Depends(get_current_user)):
    teacher = await db.teachers.find_one({"id": teacher_id}, {"_id": 0})
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
    if isinstance(teacher.get('created_at'), str):
        teacher['created_at'] = datetime.fromisoformat(teacher['created_at'])
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
    await db.teachers.insert_one(doc)
    return teacher

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
    return Teacher(**updated)

@api_router.delete("/teachers/{teacher_id}")
async def delete_teacher(teacher_id: str, current_user: User = Depends(get_current_user)):
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete teachers")
    
    result = await db.teachers.delete_one({"id": teacher_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Teacher not found")
    return {"message": "Teacher deleted successfully"}

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
        
        # Gelen ödemeler (student_payment)
        income_payments = await db.payments.find({
            "bank_account_id": account_id,
            "payment_type": "student_payment"
        }, {"_id": 0, "amount": 1}).to_list(10000)
        total_income = sum([p["amount"] for p in income_payments])
        
        # Giden ödemeler (expense, teacher_payment)
        expense_payments = await db.payments.find({
            "bank_account_id": account_id,
            "payment_type": {"$in": ["expense", "teacher_payment"]}
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

@api_router.get("/bank-accounts/{account_id}/balance")
async def get_bank_account_balance(account_id: str, current_user: User = Depends(get_current_user)):
    """Banka hesabının bakiyesini hesapla"""
    if current_user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view account balance")
    
    # Gelen ödemeler (student_payment)
    income_payments = await db.payments.find({
        "bank_account_id": account_id,
        "payment_type": "student_payment"
    }, {"_id": 0, "amount": 1}).to_list(10000)
    total_income = sum([p["amount"] for p in income_payments])
    
    # Giden ödemeler (expense, teacher_payment)
    expense_payments = await db.payments.find({
        "bank_account_id": account_id,
        "payment_type": {"$in": ["expense", "teacher_payment"]}
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
        "payment_type": "student_payment"
    }, {"_id": 0, "amount": 1}).to_list(10000)
    total_income = sum([p["amount"] for p in income_payments])
    
    expense_payments = await db.payments.find({
        "bank_account_id": account_id,
        "payment_type": {"$in": ["expense", "teacher_payment"]}
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

# ============= STUDENT COURSE ROUTES =============

@api_router.get("/student-courses", response_model=List[StudentCourse])
async def get_student_courses(student_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    query = {}
    if student_id:
        query["student_id"] = student_id
    
    if current_user.user_type == "teacher":
        query["teacher_id"] = current_user.teacher_id
    
    courses = await db.student_courses.find(query, {"_id": 0}).to_list(1000)
    for course in courses:
        if isinstance(course.get('created_at'), str):
            course['created_at'] = datetime.fromisoformat(course['created_at'])
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

@api_router.post("/lessons", response_model=Lesson)
async def create_lesson(lesson_data: LessonCreate, current_user: User = Depends(get_current_user)):
    # Check if user has access to this course
    course = await db.student_courses.find_one({"id": lesson_data.student_course_id}, {"_id": 0})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    if current_user.user_type == "teacher" and course["teacher_id"] != current_user.teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Ders oluşturulurken öğretmenin o anki ücretini kaydet (geriye dönük değişiklik olmaması için)
    teacher_rate = None
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
    
    # Ders kaydına course bilgilerini de ekle (course silinse bile kazanç hesaplanabilsin)
    lesson = Lesson(
        **lesson_data.model_dump(), 
        teacher_rate=teacher_rate,
        teacher_id=course["teacher_id"],
        branch_id=course["branch_id"],
        student_id=course["student_id"]
    )
    doc = lesson.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.lessons.insert_one(doc)
    return lesson

@api_router.delete("/lessons/{lesson_id}")
async def delete_lesson(lesson_id: str, current_user: User = Depends(get_current_user)):
    lesson = await db.lessons.find_one({"id": lesson_id}, {"_id": 0})
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    
    # Check access
    course = await db.student_courses.find_one({"id": lesson["student_course_id"]}, {"_id": 0})
    if current_user.user_type == "teacher" and course["teacher_id"] != current_user.teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
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
    
    update_data = planned_data.model_dump()
    await db.planned_lessons.update_one({"id": planned_id}, {"$set": update_data})
    
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
    
    # Kasa zorunlu kontrolü
    if not payment_data.cashbox_id:
        raise HTTPException(status_code=400, detail="Kasa seçimi zorunludur")
    
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
    
    existing = await db.payments.find_one({"id": payment_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Ödeme bulunamadı")
    
    # Banka hesabı zorunlu kontrolü
    if not payment_data.bank_account_id:
        raise HTTPException(status_code=400, detail="Banka hesabı seçimi zorunludur")
    
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
    
    # Calculate earnings based on lesson rates (stored at creation time)
    total_earnings = 0
    for lesson in lessons:
        # Önce dersin kaydındaki ücreti kullan (geriye dönük değişiklik olmaması için)
        if lesson.get("teacher_rate") is not None:
            total_earnings += lesson["teacher_rate"] * lesson["number_of_lessons"]
        else:
            # Eski dersler için fallback: güncel fiyatı kullan
            course = next((c for c in courses if c["id"] == lesson.get("student_course_id")), None)
            if course:
                # Get teacher price for this course
                teacher_price = await db.teacher_prices.find_one({
                    "teacher_id": teacher_id,
                    "branch_id": course["branch_id"],
                    "lesson_type_id": course["lesson_type_id"]
                }, {"_id": 0})
                
                if teacher_price:
                    # If it's a group lesson, check group_size
                    if teacher_price.get("group_size"):
                        # Find matching group size price
                        group_price = await db.teacher_prices.find_one({
                            "teacher_id": teacher_id,
                            "branch_id": course["branch_id"],
                            "lesson_type_id": course["lesson_type_id"],
                            "group_size": teacher_price.get("group_size")
                        }, {"_id": 0})
                        if group_price:
                            total_earnings += group_price["price"] * lesson["number_of_lessons"]
                    else:
                        total_earnings += teacher_price["price"] * lesson["number_of_lessons"]
    
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
    
    # Kamp kazançlarını hesapla - ay filtresi kamplar için uygulanamaz (kamplar belirli bir ay'a bağlı değil)
    camps = await db.camps.find({"teacher_id": teacher_id}, {"_id": 0}).to_list(1000)
    total_camp_earnings = 0
    camp_earnings_details = []
    
    for camp in camps:
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
    # Not: Ay filtresi varsa kamp kazancı hariç tutulabilir veya dahil edilebilir
    # Şu an tüm kamplar dahil ediliyor
    if month:
        # Ay bazlı görünümde kamp kazancı dahil edilmez (kamplar aya bağlı değil)
        grand_total_earnings = total_earnings + total_youtube_earnings
    else:
        grand_total_earnings = total_earnings + total_camp_earnings + total_youtube_earnings
    
    balance = grand_total_earnings - total_paid
    
    return {
        "teacher_id": teacher_id,
        "month": month,  # Hangi ay için hesaplandığını göster
        "lesson_earnings": total_earnings,
        "camp_earnings": total_camp_earnings if not month else 0,
        "youtube_earnings": total_youtube_earnings,
        "total_earnings": grand_total_earnings,
        "total_paid": total_paid,
        "balance": balance,
        "payments": payments,
        "camp_earnings_details": camp_earnings_details if not month else [],
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
    # Get group
    group = await db.student_groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Check access
    if current_user.user_type == "teacher" and group.get("teacher_id") != current_user.teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Sadece admin ücretsiz ders işaretleyebilir
    if is_free_lesson and current_user.user_type != "admin":
        is_free_lesson = False
    
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
        
        if course:
            # İlk öğrenciye tam ücret, diğerlerine 0 (duplikasyonu önlemek için)
            lesson_teacher_rate = teacher_rate if is_first_student else 0
            is_first_student = False
            
            lesson = Lesson(
                student_course_id=course["id"],
                date=date,
                number_of_lessons=number_of_lessons,
                teacher_rate=lesson_teacher_rate,
                group_id=group_id,
                is_free_lesson=is_free_lesson  # Ücretsiz ders flag'i
            )
            doc = lesson.model_dump()
            doc['created_at'] = doc['created_at'].isoformat()
            await db.lessons.insert_one(doc)
            created_lessons.append(lesson)
    
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
    
    # Planlama tamamlandı mı kontrol et ve puan ver
    badge_result = None
    if group.get("teacher_id"):
        badge_result = await check_and_award_planning_master(group["teacher_id"])
    
    return {
        "message": f"Created {len(created_plans)} planned lessons for group",
        "count": len(created_plans),
        "planning_master_badge": badge_result
    }

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
            
            unit_price = course.get("price", 0)
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
            
            # Öğretmen ücretini teacher_prices'dan al
            teacher_rate = await calculate_teacher_earning_rate(
                teacher_id=teacher_id,
                branch_id=branch_id,
                lesson_type_id=lesson_type_id,
                group_size=group_size if is_group_lesson else None
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
        except:
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
    
    for lesson in lessons:
        # Önce lesson'daki branch_id'yi kullan, yoksa course'dan al
        branch_id = lesson.get("branch_id")
        student_id = lesson.get("student_id")
        
        if not branch_id or not student_id:
            course = course_map.get(lesson.get("student_course_id"))
            if course:
                branch_id = branch_id or course.get("branch_id")
                student_id = student_id or course.get("student_id")
        
        if not branch_id:
            continue
        
        group_id = lesson.get("group_id")
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
        
        # Ücretsiz olmayan derslerin toplam sayısı (bakiye hesabı için)
        paid_lessons = [l for l in lessons if not l.get("is_free_lesson", False)]
        total_paid_lessons = sum([l["number_of_lessons"] for l in paid_lessons])
        
        # Tüm dersler (gösterim için)
        total_lessons = sum([l["number_of_lessons"] for l in lessons])
        free_lessons = sum([l["number_of_lessons"] for l in lessons if l.get("is_free_lesson", False)])
        
        # Öğrenci ders ücreti
        student_price = course.get("student_price") or course.get("price") or 0
        
        # Kullanılan tutar (sadece ücretli dersler)
        used_amount = total_paid_lessons * student_price
        
        # Bu branş için ödemeler
        payments = await db.payments.find({
            "student_id": student_id,
            "branch_id": branch_id,
            "payment_type": "student_payment"
        }, {"_id": 0}).to_list(10000)
        
        total_paid = sum([p["amount"] for p in payments])
        
        # Kalan bakiye ve ders
        remaining_balance = total_paid - used_amount
        remaining_lessons = remaining_balance / student_price if student_price > 0 else 0
        
        result.append({
            "branch_id": branch_id,
            "branch_name": branch.get("name", "Bilinmiyor"),
            "teacher_id": course.get("teacher_id"),
            "teacher_name": teacher.get("name", "Bilinmiyor"),
            "student_price": student_price,
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
        
        # Öğrenci ders ücreti
        student_price = course.get("student_price") or course.get("price") or 0
        used_amount = total_paid_lessons * student_price  # Sadece ücretli dersler
        
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
