"""Backend tests for Publisher & Sponsored Content feature (sponsor_enabled)."""
import os
import pytest
import requests
import uuid
from datetime import datetime

def _get_base():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        # try reading from frontend/.env
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL"):
                        return line.split("=", 1)[1].strip().rstrip("/")
        except Exception:
            pass
    return url.rstrip("/") if url else None

BASE_URL = _get_base()
API = f"{BASE_URL}/api"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def teacher_token():
    r = requests.post(f"{API}/auth/login", json={"username": "ilknur.uzunal", "password": "test123"})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def teacher_h(teacher_token):
    return {"Authorization": f"Bearer {teacher_token['access_token']}"}


@pytest.fixture(scope="module")
def ilknur_teacher_id():
    return "5e5cbe5b-d9f7-49cc-af86-1075fb120d43"


# ---------- Flag status ----------
class TestSponsorFlag:
    def test_sponsor_status_endpoint(self, admin_h):
        r = requests.get(f"{API}/system-settings/sponsor-status", headers=admin_h)
        assert r.status_code == 200
        assert "enabled" in r.json()

    def test_flag_currently_on(self, admin_h):
        r = requests.get(f"{API}/system-settings/sponsor-status", headers=admin_h)
        assert r.json()["enabled"] is True, "Flag expected ON per task note"


# ---------- Authorization ----------
class TestAuthorization:
    def test_teacher_cannot_get_publishers(self, teacher_h):
        r = requests.get(f"{API}/publishers", headers=teacher_h)
        assert r.status_code == 403

    def test_teacher_cannot_create_publisher(self, teacher_h):
        r = requests.post(f"{API}/publishers", headers=teacher_h, json={"name": "X"})
        assert r.status_code == 403

    def test_teacher_cannot_see_other_teachers_sponsored(self, teacher_h):
        other = "2c2ca5bd-05c2-411a-ae5a-9db4713d8e4c"
        r = requests.get(f"{API}/teachers/{other}/sponsored-contents", headers=teacher_h)
        assert r.status_code == 403

    def test_teacher_own_sponsored(self, teacher_h):
        r = requests.get(f"{API}/teacher/sponsored-contents", headers=teacher_h)
        assert r.status_code == 200
        d = r.json()
        assert "details" in d and isinstance(d["details"], list)


# ---------- Publisher CRUD + Sponsored Content flow ----------
class TestPublisherCRUDAndBalance:
    created_pub = {}
    created_payment_id = None

    def test_create_publisher(self, admin_h):
        name = f"TEST_PUB_{uuid.uuid4().hex[:6]}"
        payload = {
            "name": name,
            "reels_price": 5000,
            "story_price": 2000,
            "contacts": [
                {"name": "TEST Kişi1", "phone": "05550001"},
                {"name": "TEST Kişi2", "phone": "05550002"},
            ],
        }
        r = requests.post(f"{API}/publishers", headers=admin_h, json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == name
        assert d["reels_price"] == 5000
        assert d["story_price"] == 2000
        assert len(d["contacts"]) == 2
        TestPublisherCRUDAndBalance.created_pub = d

    def test_list_publishers_includes_balance(self, admin_h):
        r = requests.get(f"{API}/publishers", headers=admin_h)
        assert r.status_code == 200
        lst = r.json()
        pub = next((p for p in lst if p["id"] == self.created_pub["id"]), None)
        assert pub is not None
        assert "balance" in pub
        assert pub["balance"] == 0

    def test_update_publisher(self, admin_h):
        pid = self.created_pub["id"]
        payload = {
            "name": self.created_pub["name"] + "_U",
            "reels_price": 6000,
            "story_price": 2500,
            "contacts": self.created_pub["contacts"],
        }
        r = requests.put(f"{API}/publishers/{pid}", headers=admin_h, json=payload)
        assert r.status_code == 200
        assert r.json()["reels_price"] == 6000

    def test_sponsored_content_reels_uses_default(self, admin_h, ilknur_teacher_id):
        pid = self.created_pub["id"]
        r = requests.post(
            f"{API}/publishers/{pid}/sponsored-content",
            headers=admin_h,
            json={
                "share_name": "TEST Reels 1",
                "share_type": "reels",
                "teacher_id": ilknur_teacher_id,
            },
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["publisher_amount"] == 6000  # updated reels price
        # snapshot name
        assert d["publisher_name_snapshot"]
        TestPublisherCRUDAndBalance.reels_sc_id = d["id"]

    def test_sponsored_content_story_manual_amount(self, admin_h, ilknur_teacher_id):
        pid = self.created_pub["id"]
        r = requests.post(
            f"{API}/publishers/{pid}/sponsored-content",
            headers=admin_h,
            json={
                "share_name": "TEST Story manual",
                "share_type": "story",
                "teacher_id": ilknur_teacher_id,
                "amount": 7500,
            },
        )
        assert r.status_code == 200, r.text
        assert r.json()["publisher_amount"] == 7500

    def test_sponsored_content_no_amount_no_default_400(self, admin_h, ilknur_teacher_id):
        # create a fee-less publisher
        pay = {"name": f"TEST_NOFEE_{uuid.uuid4().hex[:5]}"}
        p = requests.post(f"{API}/publishers", headers=admin_h, json=pay).json()
        r = requests.post(
            f"{API}/publishers/{p['id']}/sponsored-content",
            headers=admin_h,
            json={"share_name": "x", "share_type": "reels", "teacher_id": ilknur_teacher_id},
        )
        assert r.status_code == 400

    def test_balance_after_two_shares(self, admin_h):
        r = requests.get(f"{API}/publishers", headers=admin_h)
        pub = next(p for p in r.json() if p["id"] == self.created_pub["id"])
        # 6000 reels + 7500 story => -13500
        assert pub["balance"] == -13500, f"expected -13500, got {pub['balance']}"

    def test_payment_xor_both_fails(self, admin_h):
        # need a student to try. Pick any.
        s = requests.get(f"{API}/students", headers=admin_h).json()
        if not s:
            pytest.skip("no students")
        payload = {
            "payment_type": "income",
            "amount": 100,
            "date": datetime.utcnow().strftime("%Y-%m-%d"),
            "student_id": s[0]["id"],
            "publisher_id": self.created_pub["id"],
        }
        r = requests.post(f"{API}/payments", headers=admin_h, json=payload)
        assert r.status_code == 400

    def test_publisher_payment_updates_balance(self, admin_h):
        payload = {
            "payment_type": "income",
            "amount": 7000,
            "date": datetime.utcnow().strftime("%Y-%m-%d"),
            "publisher_id": self.created_pub["id"],
        }
        r = requests.post(f"{API}/payments", headers=admin_h, json=payload)
        assert r.status_code in (200, 201), r.text
        TestPublisherCRUDAndBalance.created_payment_id = r.json().get("id")
        # Verify balance now = -13500 + 7000 = -6500
        lst = requests.get(f"{API}/publishers", headers=admin_h).json()
        pub = next(p for p in lst if p["id"] == self.created_pub["id"])
        assert pub["balance"] == -6500

    def test_snapshot_amounts_persist_after_fee_change(self, admin_h, ilknur_teacher_id):
        pid = self.created_pub["id"]
        # change publisher reels price
        payload = {
            "name": self.created_pub["name"] + "_U2",
            "reels_price": 9999,
            "story_price": 8888,
            "contacts": [],
        }
        r = requests.put(f"{API}/publishers/{pid}", headers=admin_h, json=payload)
        assert r.status_code == 200
        # existing records unchanged
        contents = requests.get(
            f"{API}/publishers/{pid}/sponsored-contents", headers=admin_h
        ).json()
        amounts = sorted([c["publisher_amount"] for c in contents])
        assert amounts == [6000, 7500], f"snapshot violated: {amounts}"


# ---------- Teacher side (sponsor earnings in balance) ----------
class TestTeacherSponsorIntegration:
    def test_teacher_sees_own_sponsored(self, teacher_h, ilknur_teacher_id):
        r = requests.get(f"{API}/teacher/sponsored-contents", headers=teacher_h)
        assert r.status_code == 200
        lst = r.json().get("details", [])
        # share_name mapped as 'share_name' or 'name'
        titles = [x.get("share_name") or x.get("name") or "" for x in lst]
        assert any("TEST Reels 1" in t for t in titles) or any(
            "TEST Story manual" in t for t in titles
        ), f"expected test shares, got {titles[:5]}"

    def test_teacher_balance_includes_sponsor(self, admin_h, ilknur_teacher_id):
        r = requests.get(f"{API}/teacher-balance/{ilknur_teacher_id}", headers=admin_h)
        assert r.status_code == 200
        d = r.json()
        # Some backends label it sponsor_earnings
        assert any(
            k in d for k in ("sponsor_earnings", "sponsor_earning", "sponsor")
        ), f"keys: {list(d.keys())}"
