"""Backend tests for GET /api/admin/financial-report (Finansal Rapor).

Iteration_25: dynamic expense_categories (c0..cN) replace fixed keys.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"username": "admin", "password": "admin123"}
TEACHER = {"username": "buse.ozakdas", "password": "bozakdas.1"}

BRANCHES = {
    "Matematik": "008bf924-c2ff-4e3b-b589-ebf22e0692fc",
    "Fen Bilimleri": "e19bfe4c-1cdb-4982-8a98-f2a3107be587",
    "Türkçe": "2014af77-18a6-4d0f-a1c4-3fccc2a0308d",
}


def login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {login(ADMIN)}"}


@pytest.fixture(scope="module")
def teacher_h():
    return {"Authorization": f"Bearer {login(TEACHER)}"}


# --- Access control ---
def test_teacher_forbidden(teacher_h):
    r = requests.get(f"{API}/admin/financial-report", headers=teacher_h, timeout=30)
    assert r.status_code == 403


def test_no_auth_unauthorized():
    r = requests.get(f"{API}/admin/financial-report", timeout=30)
    assert r.status_code in (401, 403)


# --- Default shape / dynamic categories ---
def test_default_shape_and_dynamic_categories(admin_h):
    r = requests.get(f"{API}/admin/financial-report", headers=admin_h, timeout=60)
    assert r.status_code == 200
    d = r.json()
    for k in ["summary_cards", "expense_categories", "general_chart", "branch_charts", "monthly_table", "has_data"]:
        assert k in d, f"missing {k}"
    s = d["summary_cards"]
    for k in ["total_income", "total_expense", "net_balance", "teacher_payments", "period_label"]:
        assert k in s

    cats = d["expense_categories"]
    assert isinstance(cats, list) and len(cats) > 0
    labels = [c["label"] for c in cats]
    keys = [c["key"] for c in cats]
    # Dynamic keys must be index-based c0..cN
    for i, k in enumerate(keys):
        assert k == f"c{i}", f"expected c{i}, got {k}"
    # Real categories present, and no generic 'Diğer Giderler' catch-all
    for expected in ["Öğretmen Ödemesi", "Kira", "Reklam", "Vergi"]:
        assert expected in labels, f"missing category {expected}"
    assert "Diğer Giderler" not in labels

    # Row shape uses dynamic keys, and old fixed keys are gone
    row = d["general_chart"][0]
    for k in ["month", "label", "total_income", "total_expense", "net_balance"]:
        assert k in row
    for k in keys:
        assert k in row
    for legacy in ["reklam", "ofis", "vergi", "sermaye", "diger", "teacher_payment"]:
        assert legacy not in row, f"legacy fixed key {legacy} should not be present"


def test_net_balance_math_and_category_sum(admin_h):
    r = requests.get(f"{API}/admin/financial-report", headers=admin_h, timeout=60)
    d = r.json()
    keys = [c["key"] for c in d["expense_categories"]]
    for row in d["general_chart"]:
        assert abs(row["net_balance"] - (row["total_income"] - row["total_expense"])) < 0.02
        # Sum of category buckets equals total_expense
        cat_sum = sum(row[k] for k in keys)
        assert abs(cat_sum - row["total_expense"]) < 0.02, f"cat sum {cat_sum} != {row['total_expense']}"
    s = d["summary_cards"]
    assert abs(s["net_balance"] - (s["total_income"] - s["total_expense"])) < 0.02


def test_matematik_branch_dynamic_values(admin_h):
    """Matematik branch: Kira=1000, Reklam=5000, Vergi=500 across the default range."""
    r = requests.get(f"{API}/admin/financial-report", headers=admin_h, timeout=60)
    d = r.json()
    cats = {c["label"]: c["key"] for c in d["expense_categories"]}
    mat = d["branch_charts"]["Matematik"]
    kira_key = cats["Kira"]
    reklam_key = cats["Reklam"]
    vergi_key = cats["Vergi"]
    assert sum(r[kira_key] for r in mat) == 1000.0
    assert sum(r[reklam_key] for r in mat) == 5000.0
    assert sum(r[vergi_key] for r in mat) == 500.0
    assert sum(r["total_expense"] for r in mat) >= 6500.0


def test_teacher_payments_summary_matches_payments(admin_h):
    r = requests.get(f"{API}/admin/financial-report", headers=admin_h, timeout=60)
    d = r.json()
    # teacher_payments card must equal the sum of the Öğretmen Ödemesi category if present
    cats = {c["label"]: c["key"] for c in d["expense_categories"]}
    if "Öğretmen Ödemesi" in cats:
        k = cats["Öğretmen Ödemesi"]
        total_tp = sum(r[k] for r in d["general_chart"])
        assert abs(d["summary_cards"]["teacher_payments"] - total_tp) < 0.02


def test_single_month(admin_h):
    r = requests.get(f"{API}/admin/financial-report",
                     params={"month": "2026-09"}, headers=admin_h, timeout=60)
    assert r.status_code == 200
    d = r.json()
    assert len(d["general_chart"]) == 1
    assert d["general_chart"][0]["month"] == "2026-09"
    assert "Eylül 2026" in d["summary_cards"]["period_label"]


def test_empty_state_far_past(admin_h):
    r = requests.get(f"{API}/admin/financial-report",
                     params={"month": "2020-01"}, headers=admin_h, timeout=60)
    assert r.status_code == 200
    d = r.json()
    assert d["has_data"] is False
    assert d["summary_cards"]["total_income"] == 0
    assert d["summary_cards"]["total_expense"] == 0


def test_branch_filter(admin_h):
    bid = BRANCHES["Matematik"]
    r = requests.get(f"{API}/admin/financial-report",
                     params={"branch_id": bid}, headers=admin_h, timeout=60)
    assert r.status_code == 200
    d = r.json()
    assert list(d["branch_charts"].keys()) == ["Matematik"]


# --- Transfers exclusion ---
def _make_payment(admin_h, ptype, amount, cashbox_id=None, extra=None):
    body = {
        "payment_type": ptype,
        "amount": amount,
        "date": "2026-09-15",
        "payment_method": "cash",
        "description": f"TEST_{uuid.uuid4().hex[:8]}",
    }
    if cashbox_id:
        body["cashbox_id"] = cashbox_id
    if extra:
        body.update(extra)
    return requests.post(f"{API}/payments", json=body, headers=admin_h, timeout=30)


def test_transfers_excluded(admin_h):
    r0 = requests.get(f"{API}/admin/financial-report",
                      params={"month": "2026-09"}, headers=admin_h, timeout=60)
    base = r0.json()["summary_cards"]

    cb_resp = requests.get(f"{API}/cashboxes", headers=admin_h, timeout=15).json()
    cb = cb_resp["cashboxes"] if isinstance(cb_resp, dict) else cb_resp
    if len(cb) < 2:
        pytest.skip("Not enough cashboxes for transfer test")
    src, dst = cb[0]["id"], cb[1]["id"]

    created_ids = []
    tr = requests.post(f"{API}/cashbox-transfers", json={
        "from_cashbox_id": src,
        "to_cashbox_id": dst,
        "amount": 999.0,
        "date": "2026-09-15",
        "description": "TEST_transfer_excl",
    }, headers=admin_h, timeout=30)
    if tr.status_code not in (200, 201):
        for ptype in ("transfer_out", "transfer_in"):
            rr = _make_payment(admin_h, ptype, 999.0, cashbox_id=src if ptype == "transfer_out" else dst)
            if rr.status_code in (200, 201):
                created_ids.append(rr.json().get("id"))

    r1 = requests.get(f"{API}/admin/financial-report",
                      params={"month": "2026-09"}, headers=admin_h, timeout=60)
    after = r1.json()["summary_cards"]
    assert base["total_income"] == after["total_income"]
    assert base["total_expense"] == after["total_expense"]

    for pid in created_ids:
        if pid:
            requests.delete(f"{API}/payments/{pid}", headers=admin_h, timeout=15)
    if tr.status_code in (200, 201):
        tid = tr.json().get("id")
        if tid:
            requests.delete(f"{API}/cashbox-transfers/{tid}", headers=admin_h, timeout=15)
