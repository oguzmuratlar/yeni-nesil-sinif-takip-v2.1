"""Backend tests for Veli (Parent) feature end-to-end."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback: read frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass

API = f"{BASE_URL}/api"


def _login(username, password):
    r = requests.post(f"{API}/auth/login", json={"username": username, "password": password}, timeout=30)
    return r


@pytest.fixture(scope="module")
def admin_token():
    r = _login("admin", "admin123")
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"] if "access_token" in r.json() else r.json().get("token")


@pytest.fixture(scope="module")
def parent_token():
    r = _login("veli_test", "veli123")
    assert r.status_code == 200, f"Parent login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def teacher_token():
    r = _login("ilknur.uzunal", "test123")
    if r.status_code != 200:
        pytest.skip("Teacher login failed")
    return r.json().get("access_token") or r.json().get("token")


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- Login & role ----------

def test_admin_login_returns_user_type_admin():
    r = _login("admin", "admin123")
    assert r.status_code == 200
    data = r.json()
    assert data.get("user_type") == "admin"


def test_parent_login_returns_user_type_parent_and_linked_students(parent_token):
    r = _login("veli_test", "veli123")
    assert r.status_code == 200
    data = r.json()
    assert data.get("user_type") == "parent"
    assert isinstance(data.get("linked_student_ids"), list)
    assert len(data["linked_student_ids"]) >= 1


# ---------- Parent endpoints ----------

def test_veli_students(parent_token):
    r = requests.get(f"{API}/veli/students", headers=_h(parent_token), timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) >= 1
    assert "id" in data[0] and "name" in data[0]


def test_veli_summary(parent_token):
    r = requests.get(f"{API}/veli/summary", headers=_h(parent_token), timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert "cards" in data and isinstance(data["cards"], list)
    assert "student_name" in data
    for c in data["cards"]:
        assert c["status"] in ("borclu", "alacakli")


def test_veli_lessons(parent_token):
    r = requests.get(f"{API}/veli/lessons", headers=_h(parent_token), timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert "rows" in data
    for row in data["rows"]:
        assert "branch_name" in row and "teacher_name" in row
        assert row["status"] in ("borclu", "alacakli")


def test_veli_payments(parent_token):
    r = requests.get(f"{API}/veli/payments", headers=_h(parent_token), timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert "payments" in data


# ---------- Authorization guards ----------

def test_parent_cannot_access_admin_endpoint(parent_token):
    r = requests.get(f"{API}/payments/paginated", headers=_h(parent_token), timeout=30)
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text[:200]}"


def test_admin_cannot_access_veli_summary(admin_token):
    r = requests.get(f"{API}/veli/summary", headers=_h(admin_token), timeout=30)
    assert r.status_code == 403


def test_teacher_cannot_access_veli_summary(teacher_token):
    r = requests.get(f"{API}/veli/summary", headers=_h(teacher_token), timeout=30)
    assert r.status_code == 403


def test_parent_cannot_access_unlinked_student(parent_token):
    bogus_id = "00000000-0000-0000-0000-000000000000"
    r = requests.get(f"{API}/veli/summary", headers=_h(parent_token), params={"student_id": bogus_id}, timeout=30)
    assert r.status_code == 403


# ---------- Student creation with parent via admin ----------

def test_create_student_with_parent_and_login(admin_token):
    # Need to pick an existing branch and teacher (optional). Use minimal payload.
    suffix = uuid.uuid4().hex[:6]
    veli_username = f"TEST_veli_{suffix}"
    veli_password = "pass1234"
    payload = {
        "name": f"TEST Öğrenci {suffix}",
        "parent_name": "TEST Veli",
        "phone": "5551112233",
        "level": "5",
        "payment_freq": "1",
        "create_parent": True,
        "veli_username": veli_username,
        "veli_password": veli_password,
    }
    r = requests.post(f"{API}/students", json=payload, headers=_h(admin_token), timeout=30)
    assert r.status_code in (200, 201), f"Student create failed: {r.status_code} {r.text}"
    student = r.json()
    assert student.get("veli_username") == veli_username
    student_id = student["id"]

    # Parent should be able to login
    lr = _login(veli_username, veli_password)
    assert lr.status_code == 200
    luser = lr.json()
    assert luser["user_type"] == "parent"
    assert student_id in luser["linked_student_ids"]

    # Cleanup: delete student (also removes parent per server logic)
    requests.delete(f"{API}/students/{student_id}", headers=_h(admin_token), timeout=30)


def test_create_student_with_parent_duplicate_username_fails(admin_token):
    suffix = uuid.uuid4().hex[:6]
    uname = f"TEST_dup_{suffix}"
    base = {
        "name": f"TEST Dup {suffix}",
        "parent_name": "x",
        "phone": "123",
        "level": "5",
        "payment_freq": "1",
        "create_parent": True,
        "veli_username": uname,
        "veli_password": "pass1234",
    }
    r1 = requests.post(f"{API}/students", json=base, headers=_h(admin_token), timeout=30)
    assert r1.status_code in (200, 201)
    sid = r1.json()["id"]
    base2 = {**base, "name": f"TEST Dup2 {suffix}"}
    r2 = requests.post(f"{API}/students", json=base2, headers=_h(admin_token), timeout=30)
    assert r2.status_code == 400
    requests.delete(f"{API}/students/{sid}", headers=_h(admin_token), timeout=30)


def test_create_student_parent_missing_password(admin_token):
    suffix = uuid.uuid4().hex[:6]
    payload = {
        "name": f"TEST NoPw {suffix}",
        "parent_name": "x",
        "phone": "123",
        "level": "5",
        "payment_freq": "1",
        "create_parent": True,
        "veli_username": f"TEST_nopw_{suffix}",
        # no veli_password
    }
    r = requests.post(f"{API}/students", json=payload, headers=_h(admin_token), timeout=30)
    assert r.status_code == 400


# ---------- Admin creating Veli user via /api/auth/register ----------

def test_admin_register_parent_user_requires_linked_student(admin_token):
    # Get a student to link
    stu_r = requests.get(f"{API}/students", headers=_h(admin_token), timeout=30)
    assert stu_r.status_code == 200
    students = stu_r.json()
    assert len(students) > 0
    sid = students[0]["id"]

    suffix = uuid.uuid4().hex[:6]
    uname = f"TEST_veliuser_{suffix}"
    # No linked students -> error
    r_fail = requests.post(f"{API}/auth/register", json={
        "username": uname,
        "password": "pass1234",
        "user_type": "parent",
        "linked_student_ids": [],
    }, headers=_h(admin_token), timeout=30)
    assert r_fail.status_code == 400

    # With linked student -> ok
    r_ok = requests.post(f"{API}/auth/register", json={
        "username": uname,
        "password": "pass1234",
        "user_type": "parent",
        "linked_student_ids": [sid],
    }, headers=_h(admin_token), timeout=30)
    assert r_ok.status_code in (200, 201), f"{r_ok.status_code} {r_ok.text}"

    # Duplicate -> fails
    r_dup = requests.post(f"{API}/auth/register", json={
        "username": uname,
        "password": "pass1234",
        "user_type": "parent",
        "linked_student_ids": [sid],
    }, headers=_h(admin_token), timeout=30)
    assert r_dup.status_code == 400

    # Cleanup: delete the created user via admin API if available
    try:
        # find user id
        users = requests.get(f"{API}/users", headers=_h(admin_token), timeout=30).json()
        for u in users:
            if u.get("username") == uname:
                requests.delete(f"{API}/users/{u['id']}", headers=_h(admin_token), timeout=30)
                break
    except Exception:
        pass
