"""
Iteration 20 feature tests:
1. Teacher balances summary (admin-only)
2. Teacher address field
3. Custom event types (CRUD + teacher_visible filter)
4. Calendar event POST (recurring copy is a UI concern; backend just POSTs each event)
5. YouTube contents list
6. Bank accounts list
"""
import os
import pytest
import requests
from datetime import datetime, timedelta

BASE_URL = (os.environ.get('REACT_APP_BACKEND_URL') or 'https://quirky-ride-4.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

ADMIN = {"username": "admin", "password": "admin123"}
TEACHER = {"username": "buse.ozakdas", "password": "bozakdas.1"}
TEACHER_ID = "2c2ca5bd-05c2-411a-ae5a-9db4713d8e4c"


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def teacher_headers():
    return {"Authorization": f"Bearer {_login(TEACHER)}"}


# ---------- 1. teacher-balances-summary ----------
class TestTeacherBalancesSummary:
    def test_admin_can_access(self, admin_headers):
        r = requests.get(f"{API}/teacher-balances-summary", headers=admin_headers, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, dict)
        for k, v in data.items():
            assert isinstance(v, (int, float)), f"balance for {k} not numeric: {v}"
        assert TEACHER_ID in data or len(data) > 0

    def test_teacher_forbidden(self, teacher_headers):
        r = requests.get(f"{API}/teacher-balances-summary", headers=teacher_headers, timeout=15)
        assert r.status_code == 403


# ---------- 2. Teacher address ----------
class TestTeacherAddress:
    def test_put_and_get_address(self, admin_headers):
        r = requests.get(f"{API}/teachers/{TEACHER_ID}", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        original = r.json()
        original_address = original.get("address", "") or ""

        new_addr = "TEST_Adres 123, İstanbul"
        payload = {
            "name": original.get("name"),
            "email": original.get("email"),
            "phone": original.get("phone"),
            "branches": original.get("branches", []),
            "address": new_addr,
        }
        r = requests.put(f"{API}/teachers/{TEACHER_ID}", json=payload,
                         headers=admin_headers, timeout=15)
        assert r.status_code in (200, 204), r.text

        r = requests.get(f"{API}/teachers/{TEACHER_ID}", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert r.json().get("address") == new_addr

        # Restore
        payload["address"] = original_address
        requests.put(f"{API}/teachers/{TEACHER_ID}", json=payload, headers=admin_headers, timeout=15)


# ---------- 3. Custom event types ----------
def _create_custom_type(admin_headers, label, visible=True):
    r = requests.post(f"{API}/calendar/custom-event-types", json={
        "label": label, "icon": "🎉", "color": "#ff8800", "teacher_visible": visible,
    }, headers=admin_headers, timeout=15)
    assert r.status_code in (200, 201), r.text
    body = r.json()
    et = body.get("event_type") or body
    return et["id"], et["key"]


class TestCustomEventTypes:
    def test_create_list_delete(self, admin_headers):
        cid, key = _create_custom_type(admin_headers, "TEST_Etkinlik")
        # List
        r = requests.get(f"{API}/calendar/custom-event-types", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        found = [t for t in r.json() if t["id"] == cid]
        assert len(found) == 1
        assert found[0]["label"] == "TEST_Etkinlik"
        assert found[0]["key"] == key

        # Delete
        r = requests.delete(f"{API}/calendar/custom-event-types/{cid}", headers=admin_headers, timeout=15)
        assert r.status_code in (200, 204), r.text

    def test_delete_blocked_when_events_exist(self, admin_headers):
        cid, key = _create_custom_type(admin_headers, "TEST_BlockDelete")
        today = datetime.utcnow().strftime("%Y-%m-%d")
        ev = requests.post(f"{API}/calendar/events", json={
            "event_date": today, "event_type": key, "notes": "test",
        }, headers=admin_headers, timeout=15)
        assert ev.status_code in (200, 201), ev.text
        event_id = ev.json().get("event_id")

        d = requests.delete(f"{API}/calendar/custom-event-types/{cid}", headers=admin_headers, timeout=15)
        assert d.status_code == 400, f"expected 400, got {d.status_code}: {d.text}"

        # Cleanup
        if event_id:
            requests.delete(f"{API}/calendar/events/{event_id}", headers=admin_headers, timeout=15)
        r = requests.delete(f"{API}/calendar/custom-event-types/{cid}", headers=admin_headers, timeout=15)
        assert r.status_code in (200, 204)

    def test_teacher_visible_filter(self, admin_headers, teacher_headers):
        h_id, h_key = _create_custom_type(admin_headers, "TEST_Hidden", visible=False)
        v_id, v_key = _create_custom_type(admin_headers, "TEST_Visible", visible=True)

        tomorrow = datetime.utcnow() + timedelta(days=1)
        date = tomorrow.strftime("%Y-%m-%d")

        e1 = requests.post(f"{API}/calendar/events", json={
            "event_date": date, "event_type": h_key, "teacher_ids": [TEACHER_ID], "notes": "hidden",
        }, headers=admin_headers, timeout=15)
        assert e1.status_code in (200, 201), e1.text
        e1_id = e1.json()["event_id"]

        e2 = requests.post(f"{API}/calendar/events", json={
            "event_date": date, "event_type": v_key, "teacher_ids": [TEACHER_ID], "notes": "visible",
        }, headers=admin_headers, timeout=15)
        assert e2.status_code in (200, 201), e2.text
        e2_id = e2.json()["event_id"]

        # Teacher fetch (needs year/month)
        r = requests.get(
            f"{API}/calendar/events",
            params={"year": tomorrow.year, "month": tomorrow.month},
            headers=teacher_headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        events = r.json()
        ids = [e.get("id") for e in events]
        assert e2_id in ids, "visible event should appear for teacher"
        assert e1_id not in ids, "hidden event must NOT appear for teacher"

        # Cleanup
        requests.delete(f"{API}/calendar/events/{e1_id}", headers=admin_headers, timeout=15)
        requests.delete(f"{API}/calendar/events/{e2_id}", headers=admin_headers, timeout=15)
        requests.delete(f"{API}/calendar/custom-event-types/{h_id}", headers=admin_headers, timeout=15)
        requests.delete(f"{API}/calendar/custom-event-types/{v_id}", headers=admin_headers, timeout=15)


# ---------- 4. Recurring copy simulation: multiple POSTs ----------
class TestRecurringCopy:
    def test_series_creates_multiple(self, admin_headers):
        start = datetime.utcnow() + timedelta(days=3)
        created_ids = []
        # Simulate weekly for 2 weeks, 1 weekday -> 2 events
        for i in range(2):
            d = (start + timedelta(weeks=i)).strftime("%Y-%m-%d")
            r = requests.post(f"{API}/calendar/events", json={
                "event_date": d, "event_type": "bulusma", "notes": "TEST_series",
            }, headers=admin_headers, timeout=15)
            assert r.status_code in (200, 201), r.text
            created_ids.append(r.json()["event_id"])
        assert len(created_ids) == 2
        # Cleanup
        for eid in created_ids:
            requests.delete(f"{API}/calendar/events/{eid}", headers=admin_headers, timeout=15)


# ---------- 5. YouTube contents ----------
class TestYoutube:
    def test_list(self, admin_headers):
        r = requests.get(f"{API}/youtube-contents", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)


# ---------- 6. Bank accounts ----------
class TestBankAccounts:
    def test_list(self, admin_headers):
        r = requests.get(f"{API}/bank-accounts", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
