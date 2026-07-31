"""Tests for teacher content page & teachers listing bug fix."""
import os
import requests
import pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://quirky-ride-4.preview.emergentagent.com').rstrip('/')

FEN_BRANCH_ID = "e19bfe4c-1cdb-4982-8a98-f2a3107be587"
TURKCE_BRANCH_ID = "2014af77-18a6-4d0f-a1c4-3fccc2a0308d"

TEACHERS = {
    "ilknur.uzunal": {"id": "5e5cbe5b-d9f7-49cc-af86-1075fb120d43", "branch": "Fen Bilimleri", "branch_id": FEN_BRANCH_ID},
    "buse.ozakdas": {"id": "2c2ca5bd-05c2-411a-ae5a-9db4713d8e4c", "branch": "Türkçe", "branch_id": TURKCE_BRANCH_ID},
    "aysegul.muratlar": {"id": "2902cdd2-084a-4af4-965c-bfc941dbe559", "branch": "Fen Bilimleri", "branch_id": FEN_BRANCH_ID},
}


def login(username, password="test123"):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, f"Login failed for {username}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {login('admin')}"}


def test_admin_get_teachers_lists_all(admin_headers):
    r = requests.get(f"{BASE_URL}/api/teachers", headers=admin_headers)
    assert r.status_code == 200, r.text
    teachers = r.json()
    assert len(teachers) >= 3
    usernames = {t.get("username") for t in teachers}
    assert {"ilknur.uzunal", "buse.ozakdas", "aysegul.muratlar"}.issubset(usernames)


def test_admin_get_all_books(admin_headers):
    r = requests.get(f"{BASE_URL}/api/homework/books", headers=admin_headers)
    assert r.status_code == 200
    books = r.json()
    # Should include both fen and turkce books - admin sees all
    branches = {b.get("branch_id") for b in books}
    assert FEN_BRANCH_ID in branches
    assert TURKCE_BRANCH_ID in branches
    print(f"Total books admin sees: {len(books)}")


@pytest.mark.parametrize("username", ["ilknur.uzunal", "aysegul.muratlar", "buse.ozakdas"])
def test_teacher_can_login_and_fetch_own_teacher_record(username):
    token = login(username)
    headers = {"Authorization": f"Bearer {token}"}
    tid = TEACHERS[username]["id"]
    r = requests.get(f"{BASE_URL}/api/teachers/{tid}", headers=headers)
    assert r.status_code == 200, r.text
    t = r.json()
    # Ensure branches field is a list of dicts with branch_id
    assert isinstance(t.get("branches"), list)
    assert len(t["branches"]) >= 1, f"{username} has no branches!"
    branch_ids = [b["branch_id"] for b in t["branches"]]
    assert TEACHERS[username]["branch_id"] in branch_ids


@pytest.mark.parametrize("username", ["ilknur.uzunal", "aysegul.muratlar", "buse.ozakdas"])
def test_teacher_books_filter_by_own_branch(username):
    """Simulate what TeacherHomeworkContent.jsx does: fetch teacher, then filter books."""
    token = login(username)
    headers = {"Authorization": f"Bearer {token}"}
    tid = TEACHERS[username]["id"]
    expected_branch_id = TEACHERS[username]["branch_id"]

    tr = requests.get(f"{BASE_URL}/api/teachers/{tid}", headers=headers)
    assert tr.status_code == 200
    teacher_branch_ids = [b["branch_id"] for b in tr.json()["branches"]]

    br = requests.get(f"{BASE_URL}/api/homework/books", headers=headers)
    assert br.status_code == 200
    all_books = br.json()
    filtered = [b for b in all_books if b.get("branch_id") in teacher_branch_ids]
    assert len(filtered) > 0, f"{username} sees 0 books after filter!"
    for b in filtered:
        assert b["branch_id"] == expected_branch_id
    print(f"{username}: {len(filtered)} books visible (branch={TEACHERS[username]['branch']})")
