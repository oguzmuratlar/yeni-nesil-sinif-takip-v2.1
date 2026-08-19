"""
Test double-click protection for POST /api/lessons (manual birebir lesson)
and POST /api/group-lessons (manual group lesson).
Verifies backend 1.5s in-memory lock returns 429 for duplicates.
"""
import os
import time
import threading
import requests
import pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

TEACHER_USER = "ilknur.uzunal"
TEACHER_PASS = "test123"


@pytest.fixture(scope="module")
def headers():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": TEACHER_USER, "password": TEACHER_PASS
    }, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def teacher_id(headers):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    return r.json().get("teacher_id")


@pytest.fixture(scope="module")
def birebir_course(headers, teacher_id):
    # Try to find a student_course for this teacher (not part of a group)
    r = requests.get(f"{BASE_URL}/api/student-courses", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    for c in r.json():
        if c.get("teacher_id") == teacher_id and not c.get("group_id"):
            return c
    pytest.skip("No birebir course found for teacher")


@pytest.fixture(scope="module")
def teacher_group(headers, teacher_id):
    r = requests.get(f"{BASE_URL}/api/teacher-groups/{teacher_id}", headers=headers, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"cannot fetch groups: {r.status_code}")
    groups = r.json()
    if not groups:
        pytest.skip("no group for teacher")
    return groups[0]


def _count_lessons(headers, course_id, date):
    r = requests.get(f"{BASE_URL}/api/lessons?student_course_id={course_id}",
                     headers=headers, timeout=15)
    if r.status_code != 200:
        return None
    return sum(1 for l in r.json() if l.get("date") == date)


class TestManualLessonDoubleClick:
    """POST /api/lessons - Birebir manual lesson"""

    def test_duplicate_returns_429(self, headers, birebir_course):
        # Use yesterday's date to reduce interference with today's active lessons
        date = "2024-01-15"
        payload = {
            "student_course_id": birebir_course["id"],
            "date": date,
            "number_of_lessons": 1
        }
        # wait to ensure no prior lock exists
        time.sleep(2.0)
        before = _count_lessons(headers, birebir_course["id"], date)

        results = [None, None]

        def fire(idx):
            results[idx] = requests.post(
                f"{BASE_URL}/api/lessons", headers=headers, json=payload, timeout=15
            )

        t1 = threading.Thread(target=fire, args=(0,))
        t2 = threading.Thread(target=fire, args=(1,))
        t1.start(); time.sleep(0.05); t2.start()
        t1.join(); t2.join()

        r1, r2 = results
        print(f"Manual lesson R1={r1.status_code} R2={r2.status_code}")
        print(f"R1 body: {r1.text[:200]}")
        print(f"R2 body: {r2.text[:200]}")
        codes = sorted([r1.status_code, r2.status_code])
        assert 429 in codes, f"Expected 429 in duplicate request, got {codes}"

        # DB check: after both requests, only ONE lesson should be added
        after = _count_lessons(headers, birebir_course["id"], date)
        if before is not None and after is not None:
            print(f"Lesson count before={before} after={after}")
            # At most +1 should be added despite two requests
            assert after - before <= 1, f"Duplicate lesson persisted! before={before} after={after}"

    def test_after_lock_expiry_accepts(self, headers, birebir_course):
        date = "2024-01-16"
        payload = {
            "student_course_id": birebir_course["id"],
            "date": date,
            "number_of_lessons": 1
        }
        time.sleep(2.0)
        r1 = requests.post(f"{BASE_URL}/api/lessons", headers=headers, json=payload, timeout=15)
        assert r1.status_code != 429, f"got {r1.status_code}: {r1.text[:200]}"
        time.sleep(2.0)
        r2 = requests.post(f"{BASE_URL}/api/lessons", headers=headers, json=payload, timeout=15)
        assert r2.status_code != 429, f"got {r2.status_code}: {r2.text[:200]}"


class TestGroupLessonDoubleClick:
    """POST /api/group-lessons - manual group lesson"""

    def test_duplicate_returns_429(self, headers, teacher_group):
        group_id = teacher_group["id"]
        branch_id = teacher_group.get("branch_id")
        date = "2024-01-15"
        params = {
            "group_id": group_id,
            "branch_id": branch_id,
            "date": date,
            "number_of_lessons": 1
        }
        time.sleep(2.0)
        results = [None, None]

        def fire(idx):
            results[idx] = requests.post(
                f"{BASE_URL}/api/group-lessons", headers=headers, params=params, timeout=15
            )

        t1 = threading.Thread(target=fire, args=(0,))
        t2 = threading.Thread(target=fire, args=(1,))
        t1.start(); time.sleep(0.05); t2.start()
        t1.join(); t2.join()

        r1, r2 = results
        print(f"Group lesson R1={r1.status_code} R2={r2.status_code}")
        print(f"R1 body: {r1.text[:200]}")
        print(f"R2 body: {r2.text[:200]}")
        codes = sorted([r1.status_code, r2.status_code])
        assert 429 in codes, f"Expected 429 in duplicate, got {codes}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
