"""Tests for Lesson Links feature (Ders Linkleri ve Dersi Başlat)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://quirky-ride-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"username": "admin", "password": "test123"}
TEACHER_ILKNUR = {"username": "ilknur.uzunal", "password": "test123"}  # Türkçe
TEACHER_BUSE = {"username": "aysegul.muratlar", "password": "test123"}  # Fen Bilimleri (buse login broken, using aysegul)

TEACHER_ILKNUR_ID = "5e5cbe5b-d9f7-49cc-af86-1075fb120d43"
TEACHER_BUSE_ID = "2902cdd2-084a-4af4-965c-bfc941dbe559"
BRANCH_TURKCE = "2014af77-18a6-4d0f-a1c4-3fccc2a0308d"
BRANCH_FEN = "e19bfe4c-1cdb-4982-8a98-f2a3107be587"


def login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"Login failed for {creds['username']}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers():
    return {"Authorization": f"Bearer {login(ADMIN)}"}


@pytest.fixture(scope="session")
def teacher_headers():
    return {"Authorization": f"Bearer {login(TEACHER_ILKNUR)}"}


@pytest.fixture(scope="session")
def teacher_buse_headers():
    return {"Authorization": f"Bearer {login(TEACHER_BUSE)}"}


@pytest.fixture(scope="session", autouse=True)
def enable_lesson_links(admin_headers):
    """Ensure the feature toggle is enabled before tests."""
    r = requests.put(
        f"{API}/system-settings/lesson_links_enabled",
        json={"value": True},
        headers=admin_headers,
        timeout=15,
    )
    # Not all backends return 200 for missing key; accept 200/201/204
    assert r.status_code in (200, 201, 204), f"toggle failed: {r.status_code} {r.text}"


# ---------------- Admin CRUD ----------------

class TestAdminLessonLinksCRUD:
    def test_list_links_as_admin(self, admin_headers):
        r = requests.get(f"{API}/lesson-links", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_links_as_teacher_forbidden(self, teacher_headers):
        r = requests.get(f"{API}/lesson-links", headers=teacher_headers, timeout=15)
        assert r.status_code == 403

    def test_create_update_delete_flow(self, admin_headers):
        # CREATE
        payload = {
            "branch_id": BRANCH_TURKCE,
            "teacher_id": TEACHER_ILKNUR_ID,
            "link_name": "TEST_LinkAdmin",
            "link_url": "https://meet.example.com/test-admin",
        }
        cr = requests.post(f"{API}/lesson-links", json=payload, headers=admin_headers, timeout=15)
        assert cr.status_code == 200, cr.text
        link_id = cr.json()["id"]

        # Verify via LIST
        lst = requests.get(f"{API}/lesson-links", headers=admin_headers, timeout=15).json()
        created = next((x for x in lst if x["id"] == link_id), None)
        assert created is not None
        assert created["link_name"] == "TEST_LinkAdmin"
        assert created["branch_name"] and created["teacher_name"]

        # UPDATE
        upd = {
            "branch_id": BRANCH_TURKCE,
            "teacher_id": TEACHER_ILKNUR_ID,
            "link_name": "TEST_LinkAdmin_Updated",
            "link_url": "https://meet.example.com/updated",
        }
        ur = requests.put(f"{API}/lesson-links/{link_id}", json=upd, headers=admin_headers, timeout=15)
        assert ur.status_code == 200

        lst2 = requests.get(f"{API}/lesson-links", headers=admin_headers, timeout=15).json()
        updated = next((x for x in lst2 if x["id"] == link_id), None)
        assert updated["link_name"] == "TEST_LinkAdmin_Updated"
        assert updated["link_url"] == "https://meet.example.com/updated"

        # DELETE
        dr = requests.delete(f"{API}/lesson-links/{link_id}", headers=admin_headers, timeout=15)
        assert dr.status_code == 200
        lst3 = requests.get(f"{API}/lesson-links", headers=admin_headers, timeout=15).json()
        assert not any(x["id"] == link_id for x in lst3)

    def test_create_missing_fields(self, admin_headers):
        r = requests.post(
            f"{API}/lesson-links",
            json={"branch_id": "", "teacher_id": "", "link_name": "", "link_url": ""},
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code in (400, 422)

    def test_create_invalid_branch(self, admin_headers):
        r = requests.post(
            f"{API}/lesson-links",
            json={
                "branch_id": "nope",
                "teacher_id": TEACHER_ILKNUR_ID,
                "link_name": "TEST_x",
                "link_url": "https://x.com",
            },
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code == 404

    def test_update_nonexistent(self, admin_headers):
        r = requests.put(
            f"{API}/lesson-links/does-not-exist",
            json={
                "branch_id": BRANCH_TURKCE,
                "teacher_id": TEACHER_ILKNUR_ID,
                "link_name": "x",
                "link_url": "https://x",
            },
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code == 404

    def test_delete_nonexistent(self, admin_headers):
        r = requests.delete(f"{API}/lesson-links/does-not-exist", headers=admin_headers, timeout=15)
        assert r.status_code == 404


# ---------------- Teacher visibility ----------------

class TestTeacherLessonLinks:
    def test_get_teacher_own_links_only(self, admin_headers, teacher_headers, teacher_buse_headers):
        # Create one link for İlknur, one for Buse via admin
        ilknur_payload = {
            "branch_id": BRANCH_TURKCE,
            "teacher_id": TEACHER_ILKNUR_ID,
            "link_name": "TEST_Ilknur_Link",
            "link_url": "https://meet.example.com/ilknur",
        }
        buse_payload = {
            "branch_id": BRANCH_FEN,
            "teacher_id": TEACHER_BUSE_ID,
            "link_name": "TEST_Buse_Link",
            "link_url": "https://meet.example.com/buse",
        }
        c1 = requests.post(f"{API}/lesson-links", json=ilknur_payload, headers=admin_headers, timeout=15).json()
        c2 = requests.post(f"{API}/lesson-links", json=buse_payload, headers=admin_headers, timeout=15).json()
        id1, id2 = c1["id"], c2["id"]

        try:
            r_ilknur = requests.get(f"{API}/teacher/lesson-links", headers=teacher_headers, timeout=15)
            assert r_ilknur.status_code == 200
            ilknur_links = r_ilknur.json()
            assert any(l["id"] == id1 for l in ilknur_links), "Teacher must see own link"
            assert not any(l["id"] == id2 for l in ilknur_links), "Teacher must NOT see other's links"

            r_buse = requests.get(f"{API}/teacher/lesson-links", headers=teacher_buse_headers, timeout=15)
            assert r_buse.status_code == 200
            buse_links = r_buse.json()
            assert any(l["id"] == id2 for l in buse_links)
            assert not any(l["id"] == id1 for l in buse_links)
        finally:
            requests.delete(f"{API}/lesson-links/{id1}", headers=admin_headers, timeout=15)
            requests.delete(f"{API}/lesson-links/{id2}", headers=admin_headers, timeout=15)

    def test_teacher_links_admin_forbidden(self, admin_headers):
        r = requests.get(f"{API}/teacher/lesson-links", headers=admin_headers, timeout=15)
        assert r.status_code == 403


# ---------------- start-lesson ----------------

class TestStartLesson:
    def test_start_lesson_continue_existing_mode(self, admin_headers, teacher_headers):
        # Create link for İlknur
        c = requests.post(
            f"{API}/lesson-links",
            json={
                "branch_id": BRANCH_TURKCE,
                "teacher_id": TEACHER_ILKNUR_ID,
                "link_name": "TEST_StartLessonLink",
                "link_url": "https://meet.example.com/start",
            },
            headers=admin_headers,
            timeout=15,
        ).json()
        link_id = c["id"]

        try:
            # continue_existing should not require student_course_id/group_id and should return link only
            r = requests.post(
                f"{API}/lesson-links/start-lesson",
                json={
                    "selected_type": "student",
                    "student_course_id": None,
                    "group_id": None,
                    "lesson_link_id": link_id,
                    "mode": "continue_existing",
                },
                headers=teacher_headers,
                timeout=20,
            )
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["success"] is True
            assert data["link_url"] == "https://meet.example.com/start"
            assert data["lesson_created_or_updated"] is False
        finally:
            requests.delete(f"{API}/lesson-links/{link_id}", headers=admin_headers, timeout=15)

    def test_start_lesson_unauthorized_other_teacher_link(self, admin_headers, teacher_buse_headers):
        # Link belongs to İlknur, Buse tries to use it
        c = requests.post(
            f"{API}/lesson-links",
            json={
                "branch_id": BRANCH_TURKCE,
                "teacher_id": TEACHER_ILKNUR_ID,
                "link_name": "TEST_OtherTeacherLink",
                "link_url": "https://meet.example.com/other",
            },
            headers=admin_headers,
            timeout=15,
        ).json()
        link_id = c["id"]
        try:
            r = requests.post(
                f"{API}/lesson-links/start-lesson",
                json={
                    "selected_type": "student",
                    "lesson_link_id": link_id,
                    "mode": "continue_existing",
                },
                headers=teacher_buse_headers,
                timeout=15,
            )
            assert r.status_code == 403
        finally:
            requests.delete(f"{API}/lesson-links/{link_id}", headers=admin_headers, timeout=15)

    def test_start_lesson_nonexistent_link(self, teacher_headers):
        r = requests.post(
            f"{API}/lesson-links/start-lesson",
            json={"selected_type": "student", "lesson_link_id": "does-not-exist", "mode": "continue_existing"},
            headers=teacher_headers,
            timeout=15,
        )
        assert r.status_code == 404

    def test_start_lesson_admin_forbidden(self, admin_headers):
        r = requests.post(
            f"{API}/lesson-links/start-lesson",
            json={"selected_type": "student", "lesson_link_id": "x", "mode": "continue_existing"},
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code == 403

    def test_start_lesson_new_lesson_missing_course(self, admin_headers, teacher_headers):
        # Create link, call new_lesson w/o student_course_id -> should 400
        c = requests.post(
            f"{API}/lesson-links",
            json={
                "branch_id": BRANCH_TURKCE,
                "teacher_id": TEACHER_ILKNUR_ID,
                "link_name": "TEST_NewLessonMissing",
                "link_url": "https://meet.example.com/x",
            },
            headers=admin_headers,
            timeout=15,
        ).json()
        link_id = c["id"]
        try:
            r = requests.post(
                f"{API}/lesson-links/start-lesson",
                json={
                    "selected_type": "student",
                    "student_course_id": None,
                    "lesson_link_id": link_id,
                    "mode": "new_lesson",
                },
                headers=teacher_headers,
                timeout=15,
            )
            assert r.status_code == 400
        finally:
            requests.delete(f"{API}/lesson-links/{link_id}", headers=admin_headers, timeout=15)


# ---------------- Feature flag status ----------------

class TestLessonLinksStatus:
    def test_status_endpoint(self, teacher_headers):
        r = requests.get(f"{API}/system-settings/lesson-links-status", headers=teacher_headers, timeout=15)
        assert r.status_code == 200
        assert "enabled" in r.json()
