"""Tests for the paginated payments endpoints and monthly program detailed."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "https://quirky-ride-4.preview.emergentagent.com"
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"No token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------------- /api/payments/months ----------------
def test_payments_months(auth_headers):
    r = requests.get(f"{API}/payments/months", headers=auth_headers, timeout=30)
    assert r.status_code == 200, r.text
    months = r.json()
    assert isinstance(months, list)
    # Should be YYYY-MM strings and sorted desc
    for m in months:
        assert isinstance(m, str) and len(m) == 7 and m[4] == "-"
    if len(months) > 1:
        assert months == sorted(months, reverse=True)


# ---------------- /api/payments/paginated ----------------
def test_paginated_default(auth_headers):
    r = requests.get(f"{API}/payments/paginated", headers=auth_headers, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    for k in ("items", "total", "page", "page_size", "total_pages", "summary"):
        assert k in data, f"Missing key: {k}"
    assert data["page"] == 1
    assert data["page_size"] == 10
    assert isinstance(data["items"], list)
    assert len(data["items"]) <= 10
    assert "total_income" in data["summary"]
    assert "total_expense" in data["summary"]


def test_paginated_enrichment_fields(auth_headers):
    r = requests.get(f"{API}/payments/paginated?page_size=50", headers=auth_headers, timeout=60)
    assert r.status_code == 200
    items = r.json()["items"]
    # Ensure enrichment keys exist on every item
    for p in items:
        for k in ("student_name", "teacher_name", "branch_name", "cashbox_name"):
            assert k in p, f"Missing enrichment field '{k}' on item {p.get('id')}"
    # At least one of enrichment fields should be non-null across the page
    if items:
        any_enriched = any(
            p.get("student_name") or p.get("teacher_name") or p.get("cashbox_name") or p.get("branch_name")
            for p in items
        )
        assert any_enriched, "Expected at least some enriched names on a non-empty page"


def test_paginated_tabs(auth_headers):
    totals = {}
    for tab in ("all", "income", "expense"):
        r = requests.get(f"{API}/payments/paginated?tab={tab}&page_size=10", headers=auth_headers, timeout=60)
        assert r.status_code == 200, f"{tab}: {r.text}"
        d = r.json()
        totals[tab] = d["total"]
        # Verify item payment_type matches tab filter
        for p in d["items"]:
            pt = p.get("payment_type")
            if tab == "income":
                assert pt == "student_payment", f"Income tab returned {pt}"
            elif tab == "expense":
                assert pt in ("expense", "teacher_payment"), f"Expense tab returned {pt}"
    # Tümü >= Gelir and >= Gider (not strictly sum since transfers exist in all)
    assert totals["all"] >= totals["income"]
    assert totals["all"] >= totals["expense"]


def test_paginated_pagination_navigation(auth_headers):
    r1 = requests.get(f"{API}/payments/paginated?page=1&page_size=5", headers=auth_headers, timeout=60)
    assert r1.status_code == 200
    d1 = r1.json()
    if d1["total_pages"] >= 2:
        r2 = requests.get(f"{API}/payments/paginated?page=2&page_size=5", headers=auth_headers, timeout=60)
        assert r2.status_code == 200
        d2 = r2.json()
        ids1 = {i.get("id") for i in d1["items"]}
        ids2 = {i.get("id") for i in d2["items"]}
        assert ids1.isdisjoint(ids2), "Page 1 and page 2 should not overlap"
        assert d2["page"] == 2


def test_paginated_page_size_bounds(auth_headers):
    r = requests.get(f"{API}/payments/paginated?page_size=100", headers=auth_headers, timeout=60)
    assert r.status_code == 200
    assert r.json()["page_size"] == 100
    # Over 100 should clamp
    r = requests.get(f"{API}/payments/paginated?page_size=5000", headers=auth_headers, timeout=60)
    assert r.status_code == 200
    assert r.json()["page_size"] == 100


def test_paginated_sort_order(auth_headers):
    r_desc = requests.get(f"{API}/payments/paginated?sort_order=desc&page_size=20", headers=auth_headers, timeout=60)
    r_asc = requests.get(f"{API}/payments/paginated?sort_order=asc&page_size=20", headers=auth_headers, timeout=60)
    assert r_desc.status_code == 200 and r_asc.status_code == 200
    desc = [p.get("date") for p in r_desc.json()["items"] if p.get("date")]
    asc = [p.get("date") for p in r_asc.json()["items"] if p.get("date")]
    if len(desc) > 1:
        assert desc == sorted(desc, reverse=True)
    if len(asc) > 1:
        assert asc == sorted(asc)


def test_paginated_month_filter(auth_headers):
    r = requests.get(f"{API}/payments/months", headers=auth_headers, timeout=30)
    months = r.json()
    if not months:
        pytest.skip("No months to filter by")
    m = months[0]
    r = requests.get(f"{API}/payments/paginated?month={m}&page_size=50", headers=auth_headers, timeout=60)
    assert r.status_code == 200
    for p in r.json()["items"]:
        assert (p.get("date") or "").startswith(m)


def test_paginated_summary_consistency_across_tabs(auth_headers):
    # Summary is based on base query (no tab filter) → identical across tabs for same filters
    s_all = requests.get(f"{API}/payments/paginated?tab=all", headers=auth_headers, timeout=60).json()["summary"]
    s_inc = requests.get(f"{API}/payments/paginated?tab=income", headers=auth_headers, timeout=60).json()["summary"]
    s_exp = requests.get(f"{API}/payments/paginated?tab=expense", headers=auth_headers, timeout=60).json()["summary"]
    assert s_all == s_inc == s_exp, f"Summary should be identical across tabs: {s_all} {s_inc} {s_exp}"


def test_paginated_requires_admin():
    r = requests.get(f"{API}/payments/paginated", timeout=30)
    assert r.status_code in (401, 403)


# ---------------- /api/monthly-program-detailed ----------------
def test_monthly_program_detailed(auth_headers):
    # Use current month
    import datetime as dt
    now = dt.datetime.utcnow()
    for (y, m) in [(now.year, now.month), (2025, 11), (2025, 10), (2025, 9)]:
        t0 = time.time()
        r = requests.get(f"{API}/monthly-program-detailed?year={y}&month={m}", headers=auth_headers, timeout=90)
        dt_ms = (time.time() - t0) * 1000
        assert r.status_code == 200, f"{y}-{m}: {r.status_code} {r.text[:300]}"
        print(f"monthly-program-detailed {y}-{m} -> {dt_ms:.0f} ms, keys={list(r.json().keys())[:8]}")
        # Should respond in a reasonable time after optimization
        assert dt_ms < 15000, f"Monthly program too slow: {dt_ms:.0f}ms"
