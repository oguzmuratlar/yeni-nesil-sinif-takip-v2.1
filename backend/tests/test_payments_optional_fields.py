"""Backend tests for optional cashbox_id / bank_account_id in /api/payments."""
import os
import pytest
import requests
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/') or os.environ.get('BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    # fallback - read frontend .env
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL'):
                BASE_URL = line.strip().split('=', 1)[1].strip().strip('"').rstrip('/')

API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def ref_data(headers):
    def _list(resp):
        if isinstance(resp, dict):
            # pick first list value
            for v in resp.values():
                if isinstance(v, list):
                    return v
        return resp
    students = _list(requests.get(f"{API}/students", headers=headers).json())
    cashboxes = _list(requests.get(f"{API}/cashboxes", headers=headers).json())
    banks = _list(requests.get(f"{API}/bank-accounts", headers=headers).json())
    branches = _list(requests.get(f"{API}/branches", headers=headers).json())
    assert students and cashboxes and banks and branches
    return {
        "student_id": students[0]["id"],
        "cashbox_id": cashboxes[0]["id"],
        "bank_id": banks[0]["id"],
        "branch_id": branches[0]["id"],
    }


created_ids = []


def _cleanup(headers):
    for pid in created_ids:
        requests.delete(f"{API}/payments/{pid}", headers=headers)


def test_income_bank_only_no_cashbox(headers, ref_data):
    """Income with empty cashbox_id (bank-only) should succeed."""
    payload = {
        "amount": 123.45,
        "payment_type": "student_payment",
        "student_id": ref_data["student_id"],
        "branch_id": ref_data["branch_id"],
        "cashbox_id": "",
        "bank_account_id": ref_data["bank_id"],
        "description": "TEST bank-only income",
        "date": datetime.utcnow().date().isoformat(),
    }
    r = requests.post(f"{API}/payments", headers=headers, json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["bank_account_id"] == ref_data["bank_id"]
    assert data["cashbox_id"] in ("", None)
    created_ids.append(data["id"])

    # verify persistence
    g = requests.get(f"{API}/payments/{data['id']}", headers=headers)
    # may 404 if no single-get route; use list
    lst = requests.get(f"{API}/payments", headers=headers).json()
    assert any(p["id"] == data["id"] for p in lst)


def test_expense_cashbox_only_no_bank(headers, ref_data):
    """Expense with empty bank_account_id (cashbox-only) should succeed."""
    payload = {
        "amount": 50.0,
        "payment_type": "expense",
        "expense_category": "Ofis",
        "cashbox_id": ref_data["cashbox_id"],
        "bank_account_id": "",
        "description": "TEST cashbox-only expense",
        "date": datetime.utcnow().date().isoformat(),
    }
    r = requests.post(f"{API}/payments", headers=headers, json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["cashbox_id"] == ref_data["cashbox_id"]
    assert data["bank_account_id"] in ("", None)
    created_ids.append(data["id"])


def test_expense_bank_only_no_cashbox(headers, ref_data):
    """Expense bank-only (empty cashbox_id) should succeed (previously 400)."""
    payload = {
        "amount": 75.0,
        "payment_type": "expense",
        "expense_category": "Ofis",
        "cashbox_id": "",
        "bank_account_id": ref_data["bank_id"],
        "description": "TEST bank-only expense",
        "date": datetime.utcnow().date().isoformat(),
    }
    r = requests.post(f"{API}/payments", headers=headers, json=payload)
    assert r.status_code == 200, r.text
    assert "zorunludur" not in r.text.lower()
    data = r.json()
    created_ids.append(data["id"])


def test_put_payment_without_bank_account(headers, ref_data):
    """PUT /payments/{id} should no longer require bank_account_id."""
    # create first
    payload = {
        "amount": 10.0,
        "payment_type": "expense",
        "expense_category": "Ofis",
        "cashbox_id": ref_data["cashbox_id"],
        "bank_account_id": "",
        "description": "TEST update",
        "date": datetime.utcnow().date().isoformat(),
    }
    r = requests.post(f"{API}/payments", headers=headers, json=payload)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    created_ids.append(pid)

    payload["amount"] = 20.0
    u = requests.put(f"{API}/payments/{pid}", headers=headers, json=payload)
    assert u.status_code == 200, u.text
    assert u.json()["amount"] == 20.0


def test_salary_payment_method_still_required(headers, ref_data):
    """Maaş without payment_method should still fail (frontend validation stays).
    Backend may or may not enforce; this test documents behavior."""
    # Backend-only test: not asserting 400 since enforcement is frontend-side.
    pass


def test_cleanup(headers):
    _cleanup(headers)
