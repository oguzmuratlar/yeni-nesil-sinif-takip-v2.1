"""
Test suite for date-based price history feature.
Tests:
- POST /api/student-price-history
- GET /api/student-price-history/{student_id}
- POST /api/teacher-price-history
- GET /api/teacher-price-history/{teacher_id}
- Student balance calculation using price history snapshots
- Teacher balance calculation using price history snapshots
"""
import os
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://quirky-ride-4.preview.emergentagent.com').rstrip('/')

ADMIN_USER = "admin"
ADMIN_PASS = "test123"
TEACHER_ID = "5e5cbe5b-d9f7-49cc-af86-1075fb120d43"
STUDENT_ID = "aaf2775f-615a-415c-8572-b0f81273fdd8"


@pytest.fixture(scope="session")
def admin_token():
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": ADMIN_USER,
        "password": ADMIN_PASS
    })
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    return response.json().get("access_token") or response.json().get("token")


@pytest.fixture(scope="session")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {admin_token}"
    })
    return s


@pytest.fixture(scope="session")
def student_with_courses(admin_client):
    """Get student and their active courses to find a branch with a lesson_type"""
    resp = admin_client.get(f"{BASE_URL}/api/students/{STUDENT_ID}")
    assert resp.status_code == 200, f"Get student failed: {resp.text}"
    student = resp.json()

    # Get student courses
    courses_resp = admin_client.get(f"{BASE_URL}/api/student-courses?student_id={STUDENT_ID}")
    courses = courses_resp.json() if courses_resp.status_code == 200 else []
    # Filter active courses
    active_courses = [c for c in courses if c.get("status") == "active"]
    return student, active_courses or courses


@pytest.fixture(scope="session")
def teacher_with_branches(admin_client):
    resp = admin_client.get(f"{BASE_URL}/api/teachers/{TEACHER_ID}")
    assert resp.status_code == 200, f"Get teacher failed: {resp.text}"
    return resp.json()


# ============= STUDENT PRICE HISTORY TESTS =============

class TestStudentPriceHistory:

    def test_get_student_price_history(self, admin_client):
        resp = admin_client.get(f"{BASE_URL}/api/student-price-history/{STUDENT_ID}")
        assert resp.status_code == 200, f"GET failed: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "Response must be a list"
        print(f"Student price history records: {len(data)}")

    def test_create_student_price_history(self, admin_client, student_with_courses):
        student, courses = student_with_courses
        if not courses:
            pytest.skip("Student has no active courses")

        branch_id = courses[0].get("branch_id")
        assert branch_id, "No branch_id in course"

        payload = {
            "student_id": STUDENT_ID,
            "branch_id": branch_id,
            "lesson_type": "birebir",
            "price": 999.0,
            "valid_from": "2026-02-15"
        }
        resp = admin_client.post(f"{BASE_URL}/api/student-price-history", json=payload)
        assert resp.status_code == 200, f"POST failed: {resp.text}"
        data = resp.json()
        assert "price" in data
        assert data["price"]["price"] == 999.0
        assert data["price"]["lesson_type"] == "birebir"
        assert data["price"]["branch_id"] == branch_id

        # Verify GET returns the new record
        get_resp = admin_client.get(f"{BASE_URL}/api/student-price-history/{STUDENT_ID}?branch_id={branch_id}")
        assert get_resp.status_code == 200
        history = get_resp.json()
        # find our record
        found = any(h.get("price") == 999.0 and h.get("lesson_type") == "birebir" for h in history)
        assert found, f"Newly created price not found in history: {history}"

    def test_create_student_price_invalid_date(self, admin_client, student_with_courses):
        student, courses = student_with_courses
        if not courses:
            pytest.skip("No courses")
        branch_id = courses[0].get("branch_id")
        payload = {
            "student_id": STUDENT_ID,
            "branch_id": branch_id,
            "lesson_type": "birebir",
            "price": 500.0,
            "valid_from": "invalid-date"
        }
        resp = admin_client.post(f"{BASE_URL}/api/student-price-history", json=payload)
        assert resp.status_code == 400, f"Should reject invalid date, got: {resp.status_code} {resp.text}"

    def test_student_price_history_closes_previous(self, admin_client, student_with_courses):
        """New price entry must close previous open entry's valid_to"""
        student, courses = student_with_courses
        if not courses:
            pytest.skip("No courses")
        branch_id = courses[0].get("branch_id")

        # Add new price
        admin_client.post(f"{BASE_URL}/api/student-price-history", json={
            "student_id": STUDENT_ID,
            "branch_id": branch_id,
            "lesson_type": "birebir",
            "price": 777.0,
            "valid_from": "2026-03-01"
        })

        get_resp = admin_client.get(f"{BASE_URL}/api/student-price-history/{STUDENT_ID}?branch_id={branch_id}")
        history = get_resp.json()
        # Filter birebir only
        birebir = [h for h in history if h.get("lesson_type") == "birebir"]
        # The newest entry should have valid_to = None
        open_records = [h for h in birebir if h.get("valid_to") is None]
        assert len(open_records) == 1, f"Should have only 1 open record per lesson_type, got {len(open_records)}: {open_records}"


# ============= TEACHER PRICE HISTORY TESTS =============

class TestTeacherPriceHistory:

    def test_get_teacher_price_history(self, admin_client):
        resp = admin_client.get(f"{BASE_URL}/api/teacher-price-history/{TEACHER_ID}")
        assert resp.status_code == 200, f"GET failed: {resp.text}"
        data = resp.json()
        assert isinstance(data, list)
        print(f"Teacher price history records: {len(data)}")

    def test_create_teacher_price_history_birebir(self, admin_client, student_with_courses):
        # Use the same student-course relationship to find a teacher's branch
        _, courses = student_with_courses
        teacher_courses = [c for c in courses if c.get("teacher_id") == TEACHER_ID]
        if not teacher_courses:
            pytest.skip("Teacher has no courses with our test student")

        branch_id = teacher_courses[0]["branch_id"]

        # Get lesson types
        lt_resp = admin_client.get(f"{BASE_URL}/api/lesson-types")
        assert lt_resp.status_code == 200
        lesson_types = lt_resp.json()
        birebir_lt = next((lt for lt in lesson_types if lt.get("name", "").lower() in ["birebir", "bireysel", "individual"]), None)
        if not birebir_lt:
            birebir_lt = lesson_types[0] if lesson_types else None
        if not birebir_lt:
            pytest.skip("No lesson types")

        payload = {
            "teacher_id": TEACHER_ID,
            "branch_id": branch_id,
            "lesson_type_id": birebir_lt["id"],
            "price": 888.0,
            "valid_from": "2026-02-20"
        }
        resp = admin_client.post(f"{BASE_URL}/api/teacher-price-history", json=payload)
        assert resp.status_code == 200, f"POST failed: {resp.text}"
        data = resp.json()
        assert data["price"]["price"] == 888.0
        assert data["price"]["teacher_id"] == TEACHER_ID

        # Verify GET shows record
        gh = admin_client.get(f"{BASE_URL}/api/teacher-price-history/{TEACHER_ID}?branch_id={branch_id}")
        assert gh.status_code == 200
        history = gh.json()
        found = any(h.get("price") == 888.0 for h in history)
        assert found, "Created teacher price not found in history"

    def test_create_teacher_price_with_group_size(self, admin_client, student_with_courses):
        _, courses = student_with_courses
        teacher_courses = [c for c in courses if c.get("teacher_id") == TEACHER_ID]
        if not teacher_courses:
            pytest.skip("Teacher has no courses")
        branch_id = teacher_courses[0]["branch_id"]

        lt_resp = admin_client.get(f"{BASE_URL}/api/lesson-types")
        lesson_types = lt_resp.json()
        group_lt = next((lt for lt in lesson_types if "grup" in lt.get("name", "").lower() or "group" in lt.get("name", "").lower()), None)
        if not group_lt:
            pytest.skip("No group lesson type")

        payload = {
            "teacher_id": TEACHER_ID,
            "branch_id": branch_id,
            "lesson_type_id": group_lt["id"],
            "group_size": 3,
            "price": 555.0,
            "valid_from": "2026-02-25"
        }
        resp = admin_client.post(f"{BASE_URL}/api/teacher-price-history", json=payload)
        assert resp.status_code == 200, f"Group price POST failed: {resp.text}"
        assert resp.json()["price"]["group_size"] == 3


# ============= BALANCE CALCULATION TESTS =============

class TestBalanceCalculations:

    def test_student_finance_detail_uses_price_history(self, admin_client):
        """get_student_finance_detail should use price history snapshots"""
        resp = admin_client.get(f"{BASE_URL}/api/students/{STUDENT_ID}/finance-detail")
        assert resp.status_code == 200, f"Finance detail failed: {resp.text}"
        data = resp.json()
        print(f"Student finance detail keys: {list(data.keys()) if isinstance(data, dict) else 'list'}")
        # Verify by_branch contains expected fields
        assert "by_branch" in data, "by_branch missing from finance detail"
        assert isinstance(data["by_branch"], list)
        for branch_entry in data["by_branch"]:
            assert "student_price" in branch_entry
            assert "used_amount" in branch_entry
            assert "remaining_balance" in branch_entry

    def test_teacher_balance_uses_price_history(self, admin_client):
        resp = admin_client.get(f"{BASE_URL}/api/teacher-balance/{TEACHER_ID}")
        assert resp.status_code == 200, f"Teacher balance failed: {resp.text}"
        data = resp.json()
        assert "lesson_earnings" in data
        assert "balance" in data
        assert "total_earnings" in data
        print(f"Teacher earnings: {data.get('lesson_earnings')}, balance: {data.get('balance')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
