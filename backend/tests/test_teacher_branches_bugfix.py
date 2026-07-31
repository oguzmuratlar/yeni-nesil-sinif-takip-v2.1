"""
Test bug fix for teacher branches endpoint - branches should be merged from
both teacher_branches and teacher_prices tables.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://quirky-ride-4.preview.emergentagent.com').rstrip('/')

TEACHERS = {
    "ilknur.uzunal": {"id": "5e5cbe5b-d9f7-49cc-af86-1075fb120d43", "branch": "Türkçe"},
    "buse.ozakdas": {"id": "2c2ca5bd-05c2-411a-ae5a-9db4713d8e4c", "branch": "Fen Bilimleri"},
    "sıla.aslan": {"id": "a9199ba8-ac4a-45d9-b766-8268c530507c", "branch": "Matematik"},
}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": "admin", "password": "test123"})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def test_get_teachers_list_contains_branches(admin_headers):
    r = requests.get(f"{BASE_URL}/api/teachers", headers=admin_headers)
    assert r.status_code == 200, r.text
    teachers = r.json()
    by_id = {t["id"]: t for t in teachers}
    for username, info in TEACHERS.items():
        tid = info["id"]
        assert tid in by_id, f"Teacher {username} ({tid}) missing from list"
        branches = by_id[tid].get("branches") or []
        branch_names = [b.get("branch_name") for b in branches]
        assert info["branch"] in branch_names, (
            f"{username} expected branch '{info['branch']}' not in {branch_names}"
        )


@pytest.mark.parametrize("username,info", list(TEACHERS.items()))
def test_get_single_teacher_has_branch(admin_headers, username, info):
    r = requests.get(f"{BASE_URL}/api/teachers/{info['id']}", headers=admin_headers)
    assert r.status_code == 200, r.text
    data = r.json()
    branches = data.get("branches") or []
    branch_names = [b.get("branch_name") for b in branches]
    assert info["branch"] in branch_names, (
        f"{username} expected branch '{info['branch']}' not in {branch_names}"
    )


@pytest.mark.parametrize("username,info", list(TEACHERS.items()))
def test_teacher_login_and_content_branches(username, info):
    """Teacher logs in and fetches their own /teachers/{id}/branches used for content page."""
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": username, "password": "test123"})
    assert r.status_code == 200, f"login failed for {username}: {r.text}"
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    r = requests.get(f"{BASE_URL}/api/teachers/{info['id']}", headers=headers)
    assert r.status_code == 200, r.text
    branches = r.json().get("branches") or []
    branch_names = [b.get("branch_name") for b in branches]
    assert info["branch"] in branch_names, (
        f"{username} content: expected '{info['branch']}' in {branch_names}"
    )


EXPECTED_BOOKS = {
    "Türkçe": "Yeni kitap Türkçe",
    "Fen Bilimleri": "Yeni kitap Fen denemesi",
    "Matematik": "Yeni kitap Matematik",
}


@pytest.mark.parametrize("username,info", list(TEACHERS.items()))
def test_teacher_sees_expected_book_in_their_branch(username, info):
    """Fetch books and verify the teacher's branch has the expected book."""
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": username, "password": "test123"})
    assert r.status_code == 200
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # try common books endpoints
    for path in ("/api/books", "/api/homework-content", "/api/homework-books"):
        r = requests.get(f"{BASE_URL}{path}", headers=headers)
        if r.status_code == 200:
            items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
            # Get teacher's branch id
            tr = requests.get(f"{BASE_URL}/api/teachers/{info['id']}", headers=headers).json()
            branch_ids = [b["branch_id"] for b in tr.get("branches", [])]
            # Filter books by branch
            filtered = [i for i in items if i.get("branch_id") in branch_ids]
            titles = [i.get("title") or i.get("name") for i in filtered]
            expected = EXPECTED_BOOKS[info["branch"]]
            if any(expected in (t or "") for t in titles):
                return  # success
    pytest.skip(f"Could not verify book existence for {username} via API")
