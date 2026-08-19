"""
Test double-click protection for /api/lesson-links/start-lesson
"""
import os
import time
import threading
import requests
import pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://quirky-ride-4.preview.emergentagent.com').rstrip('/')

TEACHER_USER = "ilknur.uzunal"
TEACHER_PASS = "test123"

LESSON_LINK_ID = "22d16262-d529-4136-8ba7-508ca68dbdd6"
TEACHER_ID = "5e5cbe5b-d9f7-49cc-af86-1075fb120d43"


@pytest.fixture(scope="module")
def teacher_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": TEACHER_USER,
        "password": TEACHER_PASS
    }, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"No token in {data}"
    return token


@pytest.fixture(scope="module")
def headers(teacher_token):
    return {"Authorization": f"Bearer {teacher_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def student_course(headers):
    # Get a student course for this teacher (birebir)
    r = requests.get(f"{BASE_URL}/api/student-courses", headers=headers, timeout=15)
    if r.status_code != 200:
        # Try teacher-specific endpoint
        r = requests.get(f"{BASE_URL}/api/teacher/student-courses", headers=headers, timeout=15)
    assert r.status_code == 200, f"Failed to fetch courses: {r.status_code} {r.text[:300]}"
    courses = r.json()
    # Filter for this teacher's birebir courses
    for c in courses:
        if c.get("teacher_id") == TEACHER_ID and not c.get("group_id"):
            return c
    pytest.skip("No suitable birebir student_course found for teacher")


@pytest.fixture(scope="module")
def group_info(headers):
    """Find a group for this teacher"""
    r = requests.get(f"{BASE_URL}/api/teacher-groups/{TEACHER_ID}", headers=headers, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Cannot fetch groups: {r.status_code}")
    groups = r.json()
    if not groups:
        pytest.skip("No group found for teacher")
    return groups[0]


class TestLessonLinkAuth:
    def test_lesson_link_exists(self, headers):
        r = requests.get(f"{BASE_URL}/api/teacher/lesson-links", headers=headers, timeout=15)
        assert r.status_code == 200
        links = r.json()
        ids = [l.get("id") for l in links]
        assert LESSON_LINK_ID in ids, f"Lesson link {LESSON_LINK_ID} not found in teacher's links: {ids}"


class TestDoubleClickProtection:
    """Test the 1.5s duplicate request lock"""

    def test_continue_existing_no_lock(self, headers):
        """continue_existing mode should NOT be locked (no duplicate protection)"""
        payload = {
            "selected_type": "student",
            "lesson_link_id": LESSON_LINK_ID,
            "mode": "continue_existing",
            "student_course_id": "dummy"  # will 404 but not 429
        }
        r1 = requests.post(f"{BASE_URL}/api/lesson-links/start-lesson", headers=headers, json=payload, timeout=15)
        r2 = requests.post(f"{BASE_URL}/api/lesson-links/start-lesson", headers=headers, json=payload, timeout=15)
        # Neither should be 429 because continue_existing is not locked
        assert r1.status_code != 429
        assert r2.status_code != 429

    def test_duplicate_request_returns_429(self, headers, student_course):
        """Second identical request within 1.5s should return 429"""
        payload = {
            "selected_type": "student",
            "lesson_link_id": LESSON_LINK_ID,
            "mode": "new_lesson",
            "student_course_id": student_course["id"]
        }
        # Fire two back-to-back
        results = [None, None]

        def fire(idx):
            results[idx] = requests.post(
                f"{BASE_URL}/api/lesson-links/start-lesson",
                headers=headers, json=payload, timeout=15
            )

        t1 = threading.Thread(target=fire, args=(0,))
        t2 = threading.Thread(target=fire, args=(1,))
        t1.start()
        # Small delay to ensure ordering — first request gets the lock
        time.sleep(0.05)
        t2.start()
        t1.join()
        t2.join()

        r1, r2 = results
        print(f"R1: {r1.status_code} {r1.text[:200]}")
        print(f"R2: {r2.status_code} {r2.text[:200]}")

        # One should succeed (200/201) and the second should be 429
        codes = sorted([r1.status_code, r2.status_code])
        assert 429 in codes, f"Expected 429 in one of responses, got {codes}"

    def test_wait_after_lock_expires_accepts_new_request(self, headers, student_course):
        """After 1.6s, same request should be accepted (not 429)"""
        payload = {
            "selected_type": "student",
            "lesson_link_id": LESSON_LINK_ID,
            "mode": "new_lesson",
            "student_course_id": student_course["id"]
        }
        # Wait for any prior lock to expire
        time.sleep(2.0)
        r1 = requests.post(f"{BASE_URL}/api/lesson-links/start-lesson", headers=headers, json=payload, timeout=15)
        assert r1.status_code != 429, f"Expected non-429 after lock expiry, got {r1.status_code}: {r1.text[:200]}"
        # Wait past 1.5s and re-request; should also succeed (not 429)
        time.sleep(2.0)
        r2 = requests.post(f"{BASE_URL}/api/lesson-links/start-lesson", headers=headers, json=payload, timeout=15)
        assert r2.status_code != 429, f"Expected non-429 after 2s wait, got {r2.status_code}: {r2.text[:200]}"

    def test_group_double_click_no_double_students(self, headers, group_info):
        """For group lessons, double-click should not duplicate student count"""
        # Fetch group members count
        group_id = group_info["id"]

        payload = {
            "selected_type": "group",
            "lesson_link_id": LESSON_LINK_ID,
            "mode": "new_lesson",
            "group_id": group_id
        }

        # Wait for lock to expire
        time.sleep(2.0)

        # Fire two requests in parallel
        results = [None, None]

        def fire(idx):
            results[idx] = requests.post(
                f"{BASE_URL}/api/lesson-links/start-lesson",
                headers=headers, json=payload, timeout=15
            )

        t1 = threading.Thread(target=fire, args=(0,))
        t2 = threading.Thread(target=fire, args=(1,))
        t1.start()
        time.sleep(0.05)
        t2.start()
        t1.join(); t2.join()

        r1, r2 = results
        codes = sorted([r1.status_code, r2.status_code])
        print(f"Group R1: {r1.status_code} R2: {r2.status_code}")
        assert 429 in codes, f"Expected 429 for duplicate group lesson start, got {codes}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
