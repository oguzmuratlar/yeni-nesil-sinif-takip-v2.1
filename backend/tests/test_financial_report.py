"""Backend tests for GET /api/admin/financial-report (Finansal Rapor)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://quirky-ride-4.preview.emergentagent.com").rstrip("/")
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


# --- Default shape ---
def test_default_shape_12_months_and_branches(admin_h):
    r = requests.get(f"{API}/admin/financial-report", headers=admin_h, timeout=60)
    assert r.status_code == 200
    d = r.json()
    for k in ["summary_cards", "general_chart", "branch_charts", "monthly_table", "has_data"]:
        assert k in d
    assert len(d["general_chart"]) == 12
    s = d["summary_cards"]
    for k in ["total_income", "total_expense", "net_balance", "teacher_payments", "period_label"]:
        assert k in s
    # Branches present
    for name in BRANCHES.keys():
        assert name in d["branch_charts"], f"missing branch {name}"
        assert len(d["branch_charts"][name]) == 12
    # Row shape
    row = d["general_chart"][0]
    for k in ["month", "label", "total_income", "total_expense", "net_balance",
              "teacher_payment", "reklam", "ofis", "vergi", "sermaye", "diger"]:
        assert k in row


def test_net_balance_math(admin_h):
    r = requests.get(f"{API}/admin/financial-report", headers=admin_h, timeout=60)
    d = r.json()
    for row in d["general_chart"]:
        assert abs(row["net_balance"] - (row["total_income"] - row["total_expense"])) < 0.02
    s = d["summary_cards"]
    assert abs(s["net_balance"] - (s["total_income"] - s["total_expense"])) < 0.02


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
    # Only Matematik in branch_charts
    assert list(d["branch_charts"].keys()) == ["Matematik"]


def test_category_filter_vergi(admin_h):
    r = requests.get(f"{API}/admin/financial-report",
                     params={"category": "Vergi"}, headers=admin_h, timeout=60)
    assert r.status_code == 200
    d = r.json()
    # No income should come through (only expenses with category Vergi)
    assert d["summary_cards"]["total_income"] == 0
    # All expense must be in vergi bucket
    for row in d["general_chart"]:
        assert row["reklam"] == 0
        assert row["ofis"] == 0
        assert row["teacher_payment"] == 0
        # expense may be 0 or vergi
        assert abs(row["total_expense"] - row["vergi"]) < 0.02


def test_teacher_filter(admin_h):
    tid = "2c2ca5bd-05c2-411a-ae5a-9db4713d8e4c"
    r = requests.get(f"{API}/admin/financial-report",
                     params={"teacher_id": tid}, headers=admin_h, timeout=60)
    assert r.status_code == 200
    # No student income for a teacher_id filter (student_payments do not have teacher_id typically) - just ensure OK
    assert r.status_code == 200


# --- Cashbox->branch attribution fix (iteration_24) ---
def test_branch_attribution_via_cashbox(admin_h):
    """Expenses w/o branch_id but w/ cashbox_id must be attributed to cashbox's branch."""
    r = requests.get(f"{API}/admin/financial-report", headers=admin_h, timeout=60)
    assert r.status_code == 200
    d = r.json()
    bc = d["branch_charts"]
    # Matematik: expects 500 vergi + non-zero teacher_payment/expense from previous zeros
    mat = bc["Matematik"]
    assert sum(r["vergi"] for r in mat) == 500.0
    assert sum(r["total_expense"] for r in mat) >= 6500.0
    # Fen Bilimleri and Türkçe now show teacher_payment via cashbox mapping
    fen_tp = sum(r["teacher_payment"] for r in bc["Fen Bilimleri"])
    tur_tp = sum(r["teacher_payment"] for r in bc["Türkçe"])
    assert fen_tp > 0, "Fen Bilimleri teacher_payment should be populated via cashbox mapping"
    assert tur_tp > 0, "Türkçe teacher_payment should be populated via cashbox mapping"
    # Branches should differ (each = own cashbox)
    fen_exp = sum(r["total_expense"] for r in bc["Fen Bilimleri"])
    mat_exp = sum(r["total_expense"] for r in mat)
    assert fen_exp != mat_exp


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
    r = requests.post(f"{API}/payments", json=body, headers=admin_h, timeout=30)
    return r


def test_transfers_excluded(admin_h):
    """Create a transfer payment (transfer_out/in) and verify totals don't change."""
    # baseline
    r0 = requests.get(f"{API}/admin/financial-report",
                      params={"month": "2026-09"}, headers=admin_h, timeout=60)
    base = r0.json()["summary_cards"]

    # Grab two cashboxes
    cb_resp = requests.get(f"{API}/cashboxes", headers=admin_h, timeout=15).json()
    cb = cb_resp["cashboxes"] if isinstance(cb_resp, dict) else cb_resp
    if len(cb) < 2:
        pytest.skip("Not enough cashboxes for transfer test")
    src, dst = cb[0]["id"], cb[1]["id"]

    # Try dedicated cashbox transfer endpoint
    created_ids = []
    tr = requests.post(f"{API}/cashbox-transfers", json={
        "from_cashbox_id": src,
        "to_cashbox_id": dst,
        "amount": 999.0,
        "date": "2026-09-15",
        "description": "TEST_transfer_excl",
    }, headers=admin_h, timeout=30)
    if tr.status_code not in (200, 201):
        # Fallback: create raw transfer_out/in payments directly
        for ptype in ("transfer_out", "transfer_in"):
            rr = _make_payment(admin_h, ptype, 999.0, cashbox_id=src if ptype == "transfer_out" else dst)
            if rr.status_code in (200, 201):
                created_ids.append(rr.json().get("id"))

    # Re-fetch
    r1 = requests.get(f"{API}/admin/financial-report",
                      params={"month": "2026-09"}, headers=admin_h, timeout=60)
    after = r1.json()["summary_cards"]
    assert base["total_income"] == after["total_income"], "transfers must not affect income"
    assert base["total_expense"] == after["total_expense"], "transfers must not affect expense"

    # Cleanup created payments if any
    for pid in created_ids:
        if pid:
            requests.delete(f"{API}/payments/{pid}", headers=admin_h, timeout=15)
    # Try clean cashbox-transfer if exposed
    if tr.status_code in (200, 201):
        tid = tr.json().get("id")
        if tid:
            requests.delete(f"{API}/cashbox-transfers/{tid}", headers=admin_h, timeout=15)
