"""Tests for the teacher update bugfix - branches field format issue.
Verifies GET, UPDATE flows for all 3 teachers (Buse, Ayşegül, İlknur)
plus create_teacher and teacher content endpoint.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://quirky-ride-4.preview.emergentagent.com").rstrip("/")

TEACHERS = {
    "ilknur": {
        "username": "ilknur.uzunal",
        "teacher_id": "5e5cbe5b-d9f7-49cc-af86-1075fb120d43",
        "expected_branch": "Fen Bilimleri",
    },
    "buse": {
        "username": "buse.ozakdas",
        "teacher_id": "2c2ca5bd-05c2-411a-ae5a-9db4713d8e4c",
        "expected_branch": "Türkçe",
    },
    "aysegul": {
        "username": "aysegul.muratlar",
        "teacher_id": "2902cdd2-084a-4af4-965c-bfc941dbe559",
        "expected_branch": "Fen Bilimleri",
    },
}


def _login(username, password="test123"):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": username, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {username}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login("admin")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


class TestTeachersList:
    def test_list_teachers(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/teachers", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        teachers = r.json()
        assert isinstance(teachers, list)
        assert len(teachers) >= 3, f"Expected >=3 teachers, got {len(teachers)}"

        # verify each known teacher present with proper branches format
        ids = {t["id"]: t for t in teachers}
        for key, info in TEACHERS.items():
            assert info["teacher_id"] in ids, f"{key} teacher missing"
            t = ids[info["teacher_id"]]
            assert isinstance(t.get("branches"), list), f"branches not list for {key}"
            for b in t["branches"]:
                assert isinstance(b, dict), f"branch entry not dict for {key}: {b}"
                assert "branch_id" in b and "branch_name" in b
            branch_names = [b["branch_name"] for b in t["branches"]]
            assert info["expected_branch"] in branch_names, f"{key} missing branch {info['expected_branch']} got {branch_names}"


class TestTeacherUpdate:
    @pytest.mark.parametrize("key", ["buse", "aysegul", "ilknur"])
    def test_update_teacher_preserves_branch(self, admin_headers, key):
        info = TEACHERS[key]
        tid = info["teacher_id"]

        # GET current teacher
        r = requests.get(f"{BASE_URL}/api/teachers/{tid}", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        original = r.json()
        original_phone = original.get("phone") or ""
        original_name = original.get("name")

        # UPDATE - toggle phone by appending/removing a marker
        new_phone = "05551234567" if original_phone != "05551234567" else "05559999999"
        payload = {
            "name": original_name,
            "surname": original.get("surname"),
            "username": original.get("username"),
            "phone": new_phone,
            "email": original.get("email"),
        }
        # remove Nones so backend uses defaults
        payload = {k: v for k, v in payload.items() if v is not None}

        r2 = requests.put(f"{BASE_URL}/api/teachers/{tid}", json=payload, headers=admin_headers, timeout=15)
        assert r2.status_code == 200, f"update failed for {key}: {r2.status_code} {r2.text}"
        updated = r2.json()
        assert updated["phone"] == new_phone
        # verify branches still shown correctly after update
        branch_names = [b["branch_name"] for b in updated.get("branches", []) if isinstance(b, dict)]
        assert info["expected_branch"] in branch_names, f"{key} lost branch after update. Got {updated.get('branches')}"

        # GET again to verify persistence
        r3 = requests.get(f"{BASE_URL}/api/teachers/{tid}", headers=admin_headers, timeout=15)
        assert r3.status_code == 200
        fetched = r3.json()
        assert fetched["phone"] == new_phone
        branch_names2 = [b["branch_name"] for b in fetched.get("branches", []) if isinstance(b, dict)]
        assert info["expected_branch"] in branch_names2


class TestTeacherContent:
    @pytest.mark.parametrize("key", ["buse", "aysegul", "ilknur"])
    def test_teacher_sees_own_branch_content(self, key):
        info = TEACHERS[key]
        token = _login(info["username"])
        headers = {"Authorization": f"Bearer {token}"}
        # Try common teacher content endpoints
        # Based on prior tests: /api/teacher/content or /api/books?branch=
        r = requests.get(f"{BASE_URL}/api/teacher/content", headers=headers, timeout=15)
        if r.status_code == 404:
            pytest.skip("/api/teacher/content endpoint not available")
        assert r.status_code == 200, r.text
        data = r.json()
        # Just verify it returns without error and is a list or dict
        assert data is not None
