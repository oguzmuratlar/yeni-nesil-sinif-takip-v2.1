"""YNS League backend tests - iteration 26."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://quirky-ride-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"username": "admin", "password": "admin123"}
BUSE = {"username": "buse.ozakdas", "password": "bozakdas.1"}
OTHER_TEACHER = {"username": "aysegul.muratlar", "password": "test123"}  # Fen Bilimleri - same branch
MAT_TEACHER = {"username": "sıla.aslan", "password": "test123"}  # Matematik

BUSE_STUDENT = "7e978fa0-2dc3-46fd-a148-fbfdd5bce0ea"
FEN_BRANCH = "e19bfe4c-1cdb-4982-8a98-f2a3107be587"


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"Login {creds['username']} failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _h(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def buse_token():
    return _login(BUSE)


@pytest.fixture(scope="module")
def mat_token():
    try:
        return _login(MAT_TEACHER)
    except Exception:
        return None


# =========== FEATURE FLAG ===========
class TestFeatureFlag:
    def test_status_enabled(self, admin_token):
        r = requests.get(f"{API}/system-settings/yns-league-status", headers=_h(admin_token))
        assert r.status_code == 200
        assert r.json().get("enabled") is True

    def test_status_teacher(self, buse_token):
        r = requests.get(f"{API}/system-settings/yns-league-status", headers=_h(buse_token))
        assert r.status_code == 200
        assert r.json().get("enabled") is True


# =========== ADMIN DEFINITIONS ===========
class TestDefinitions:
    def test_list_defs_admin(self, admin_token):
        r = requests.get(f"{API}/admin/student-point-definitions", headers=_h(admin_token))
        assert r.status_code == 200
        defs = r.json()
        assert isinstance(defs, list)
        assert len(defs) >= 13, f"Expected >=13 seeded defs, got {len(defs)}"

    def test_teacher_forbidden_admin_defs(self, buse_token):
        for path, method in [
            (f"{API}/admin/student-point-definitions", "GET"),
            (f"{API}/admin/student-point-definitions", "POST"),
        ]:
            if method == "GET":
                r = requests.get(path, headers=_h(buse_token))
            else:
                r = requests.post(path, headers=_h(buse_token), json={"name": "x", "point": 1, "category": "Ders Dışı"})
            assert r.status_code == 403, f"{method} {path} expected 403, got {r.status_code}"

    def test_active_defs_endpoint(self, buse_token):
        r = requests.get(f"{API}/student-point-definitions", headers=_h(buse_token))
        assert r.status_code == 200
        defs = r.json()
        assert all(d.get("is_active") for d in defs)

    def test_crud_definition_cycle(self, admin_token, buse_token):
        # CREATE
        payload = {"name": "TEST_YNS_Def", "point": 3.0, "category": "Ders Dışı", "is_active": True, "description": "test"}
        r = requests.post(f"{API}/admin/student-point-definitions", headers=_h(admin_token), json=payload)
        assert r.status_code in (200, 201), r.text
        created = r.json()
        # The endpoint may return {message, definition} or the def directly
        def_id = created.get("id") or created.get("definition", {}).get("id")
        assert def_id, f"No id in response: {created}"

        # UPDATE
        r = requests.put(f"{API}/admin/student-point-definitions/{def_id}", headers=_h(admin_token),
                         json={"point": 5.0})
        assert r.status_code == 200, r.text

        # GET list -> find updated
        r = requests.get(f"{API}/admin/student-point-definitions", headers=_h(admin_token))
        matches = [d for d in r.json() if d["id"] == def_id]
        assert matches and matches[0]["point"] == 5.0

        # PATCH status to passive
        r = requests.patch(f"{API}/admin/student-point-definitions/{def_id}/status", headers=_h(admin_token),
                           json={"is_active": False})
        assert r.status_code == 200, r.text

        # Confirm not returned in teacher's active list
        r = requests.get(f"{API}/student-point-definitions", headers=_h(buse_token))
        assert def_id not in [d["id"] for d in r.json()]

        # Confirm admin list still shows it (passive)
        r = requests.get(f"{API}/admin/student-point-definitions", headers=_h(admin_token))
        found = [d for d in r.json() if d["id"] == def_id]
        assert found and found[0]["is_active"] is False

        # Cannot POST star with passive def
        r = requests.post(f"{API}/teacher/student-points", headers=_h(buse_token),
                         json={"student_id": BUSE_STUDENT, "branch_id": FEN_BRANCH,
                               "point_definition_id": def_id, "quantity": 1})
        assert r.status_code == 400, f"Expected 400 for passive def, got {r.status_code}: {r.text}"


# =========== TEACHER GIVE STAR ===========
@pytest.fixture(scope="module")
def sample_def_id(buse_token):
    r = requests.get(f"{API}/student-point-definitions", headers=_h(buse_token))
    assert r.status_code == 200
    defs = r.json()
    # Pick a non-Doğru Cevap definition for fixed point
    for d in defs:
        if d["category"] != "Doğru Cevap":
            return d["id"], d["point"], d["category"]
    d = defs[0]
    return d["id"], d["point"], d["category"]


@pytest.fixture(scope="module")
def dogru_cevap_def(buse_token):
    r = requests.get(f"{API}/student-point-definitions", headers=_h(buse_token))
    for d in r.json():
        if d["category"] == "Doğru Cevap":
            return d
    return None


class TestGiveStar:
    def test_give_star_and_get(self, buse_token, sample_def_id):
        def_id, point, cat = sample_def_id
        payload = {"student_id": BUSE_STUDENT, "branch_id": FEN_BRANCH,
                   "point_definition_id": def_id, "quantity": 1, "description": "TEST_star"}
        r = requests.post(f"{API}/teacher/student-points", headers=_h(buse_token), json=payload)
        assert r.status_code == 200, r.text
        rec = r.json().get("record")
        assert rec["season_id"], "season_id must be set"
        assert rec["point_date"], "point_date must be set"
        assert rec["month"] and rec["year"]
        assert rec["total_point"] == point * 1
        rid = rec["id"]

        # GET list
        r = requests.get(f"{API}/student-points?student_id={BUSE_STUDENT}", headers=_h(buse_token))
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert rid in ids

        # DELETE
        r = requests.delete(f"{API}/teacher/student-points/{rid}", headers=_h(buse_token))
        assert r.status_code == 200

        # Confirm not listed
        r = requests.get(f"{API}/student-points?student_id={BUSE_STUDENT}", headers=_h(buse_token))
        assert rid not in [x["id"] for x in r.json()]

    def test_dogru_cevap_quantity(self, buse_token, dogru_cevap_def):
        if not dogru_cevap_def:
            pytest.skip("No Doğru Cevap def")
        payload = {"student_id": BUSE_STUDENT, "branch_id": FEN_BRANCH,
                   "point_definition_id": dogru_cevap_def["id"], "quantity": 5, "description": "TEST_dc"}
        r = requests.post(f"{API}/teacher/student-points", headers=_h(buse_token), json=payload)
        assert r.status_code == 200
        rec = r.json()["record"]
        assert rec["quantity"] == 5
        assert rec["total_point"] == dogru_cevap_def["point"] * 5
        # cleanup
        requests.delete(f"{API}/teacher/student-points/{rec['id']}", headers=_h(buse_token))


# =========== AUTH RULES ===========
class TestAuthRules:
    def test_admin_cannot_post_teacher_star(self, admin_token, sample_def_id):
        def_id, _, _ = sample_def_id
        r = requests.post(f"{API}/teacher/student-points", headers=_h(admin_token),
                          json={"student_id": BUSE_STUDENT, "branch_id": FEN_BRANCH,
                                "point_definition_id": def_id, "quantity": 1})
        assert r.status_code == 403

    def test_teacher_wrong_branch(self, buse_token, sample_def_id):
        def_id, _, _ = sample_def_id
        # Use Matematik/Türkçe branch which buse doesn't teach
        r = requests.post(f"{API}/teacher/student-points", headers=_h(buse_token),
                          json={"student_id": BUSE_STUDENT, "branch_id": "matematik-fake-branch-id",
                                "point_definition_id": def_id, "quantity": 1})
        assert r.status_code == 403

    def test_teacher_not_teaching_student(self, buse_token, sample_def_id):
        def_id, _, _ = sample_def_id
        r = requests.post(f"{API}/teacher/student-points", headers=_h(buse_token),
                          json={"student_id": "00000000-0000-0000-0000-000000000000", "branch_id": FEN_BRANCH,
                                "point_definition_id": def_id, "quantity": 1})
        assert r.status_code == 403

    def test_teacher_cannot_delete_others_record(self, buse_token, mat_token, sample_def_id):
        if not mat_token:
            pytest.skip("No second teacher")
        def_id, _, _ = sample_def_id
        # Create record with buse
        r = requests.post(f"{API}/teacher/student-points", headers=_h(buse_token),
                          json={"student_id": BUSE_STUDENT, "branch_id": FEN_BRANCH,
                                "point_definition_id": def_id, "quantity": 1, "description": "TEST_del_auth"})
        assert r.status_code == 200
        rid = r.json()["record"]["id"]
        # Try delete with sıla (different teacher)
        r2 = requests.delete(f"{API}/teacher/student-points/{rid}", headers=_h(mat_token))
        assert r2.status_code == 403
        # Cleanup with buse
        requests.delete(f"{API}/teacher/student-points/{rid}", headers=_h(buse_token))


# =========== LEADERBOARD ===========
class TestLeaderboard:
    def test_leaderboard_ranks_and_ties(self, buse_token, sample_def_id):
        def_id, point, _ = sample_def_id
        # Get another student in same branch/grade taught by buse
        r = requests.get(f"{API}/student-courses", headers=_h(buse_token))
        assert r.status_code == 200
        courses = r.json()
        # Find another student in FEN_BRANCH
        other_student = None
        for c in courses:
            if c.get("branch_id") == FEN_BRANCH and c.get("student_id") != BUSE_STUDENT:
                other_student = c["student_id"]
                break
        if not other_student:
            pytest.skip("No second student for tie test")

        created = []
        try:
            # BUSE_STUDENT: 2 stars, other_student: 1 star -> BUSE ranked 1
            for _ in range(2):
                r = requests.post(f"{API}/teacher/student-points", headers=_h(buse_token),
                                  json={"student_id": BUSE_STUDENT, "branch_id": FEN_BRANCH,
                                        "point_definition_id": def_id, "quantity": 1, "description": "TEST_lb"})
                assert r.status_code == 200
                created.append(r.json()["record"]["id"])
            r = requests.post(f"{API}/teacher/student-points", headers=_h(buse_token),
                              json={"student_id": other_student, "branch_id": FEN_BRANCH,
                                    "point_definition_id": def_id, "quantity": 1, "description": "TEST_lb"})
            assert r.status_code == 200
            created.append(r.json()["record"]["id"])

            # Fetch leaderboard for FEN
            r = requests.get(f"{API}/student-points/leaderboard?branch_id={FEN_BRANCH}&view_type=season",
                             headers=_h(buse_token))
            assert r.status_code == 200
            lb = r.json()["leaderboard"]
            by_id = {x["student_id"]: x for x in lb}
            assert BUSE_STUDENT in by_id and other_student in by_id
            # Ordering (sorted desc)
            idx_buse = next(i for i, x in enumerate(lb) if x["student_id"] == BUSE_STUDENT)
            idx_other = next(i for i, x in enumerate(lb) if x["student_id"] == other_student)
            assert idx_buse < idx_other, "BUSE_STUDENT should rank higher"
            assert by_id[BUSE_STUDENT]["rank"] < by_id[other_student]["rank"]

            # Now equal totals: add 1 more to other -> tie
            r = requests.post(f"{API}/teacher/student-points", headers=_h(buse_token),
                              json={"student_id": other_student, "branch_id": FEN_BRANCH,
                                    "point_definition_id": def_id, "quantity": 1})
            assert r.status_code == 200
            created.append(r.json()["record"]["id"])

            r = requests.get(f"{API}/student-points/leaderboard?branch_id={FEN_BRANCH}&view_type=season",
                             headers=_h(buse_token))
            lb = r.json()["leaderboard"]
            by_id = {x["student_id"]: x for x in lb}
            assert by_id[BUSE_STUDENT]["total_point"] == by_id[other_student]["total_point"]
            assert by_id[BUSE_STUDENT]["rank"] == by_id[other_student]["rank"], "Ties must share same rank"
        finally:
            for rid in created:
                requests.delete(f"{API}/teacher/student-points/{rid}", headers=_h(buse_token))

    def test_leaderboard_branch_isolation(self, buse_token, sample_def_id):
        def_id, _, _ = sample_def_id
        # Give a star in Fen
        r = requests.post(f"{API}/teacher/student-points", headers=_h(buse_token),
                          json={"student_id": BUSE_STUDENT, "branch_id": FEN_BRANCH,
                                "point_definition_id": def_id, "quantity": 1, "description": "TEST_iso"})
        rid = r.json()["record"]["id"]
        try:
            # Fetch leaderboard for a fake matematik branch - buse's star should NOT appear
            r = requests.get(f"{API}/student-points/leaderboard?branch_id=matematik-nonexistent&view_type=season",
                             headers=_h(buse_token))
            assert r.status_code == 200
            assert BUSE_STUDENT not in [x["student_id"] for x in r.json()["leaderboard"]]
            # But should appear in Fen branch
            r = requests.get(f"{API}/student-points/leaderboard?branch_id={FEN_BRANCH}&view_type=season",
                             headers=_h(buse_token))
            assert BUSE_STUDENT in [x["student_id"] for x in r.json()["leaderboard"]]
        finally:
            requests.delete(f"{API}/teacher/student-points/{rid}", headers=_h(buse_token))

    def test_leaderboard_monthly(self, buse_token, sample_def_id):
        def_id, _, _ = sample_def_id
        r = requests.post(f"{API}/teacher/student-points", headers=_h(buse_token),
                          json={"student_id": BUSE_STUDENT, "branch_id": FEN_BRANCH,
                                "point_definition_id": def_id, "quantity": 1})
        rec = r.json()["record"]
        rid = rec["id"]
        try:
            # Current month should include
            r = requests.get(f"{API}/student-points/leaderboard?branch_id={FEN_BRANCH}&view_type=monthly"
                             f"&month={rec['month']}&year={rec['year']}", headers=_h(buse_token))
            assert BUSE_STUDENT in [x["student_id"] for x in r.json()["leaderboard"]]
            # Different month should exclude
            other_month = 1 if rec["month"] != 1 else 2
            r = requests.get(f"{API}/student-points/leaderboard?branch_id={FEN_BRANCH}&view_type=monthly"
                             f"&month={other_month}&year={rec['year']}", headers=_h(buse_token))
            assert BUSE_STUDENT not in [x["student_id"] for x in r.json()["leaderboard"]]
        finally:
            requests.delete(f"{API}/teacher/student-points/{rid}", headers=_h(buse_token))


# =========== FEATURE FLAG OFF/ON ===========
class TestFlagToggle:
    def test_toggle_off_then_on(self, admin_token, buse_token):
        # OFF
        r = requests.put(f"{API}/system-settings/yns_league_enabled", headers=_h(admin_token),
                         json={"value": False})
        assert r.status_code == 200, r.text
        try:
            r = requests.get(f"{API}/admin/student-point-definitions", headers=_h(admin_token))
            assert r.status_code == 403
            r = requests.get(f"{API}/student-point-definitions", headers=_h(buse_token))
            assert r.status_code == 403
        finally:
            # Turn back ON
            r = requests.put(f"{API}/system-settings/yns_league_enabled", headers=_h(admin_token),
                             json={"value": True})
            assert r.status_code == 200
        # Verify back on
        r = requests.get(f"{API}/system-settings/yns-league-status", headers=_h(admin_token))
        assert r.json()["enabled"] is True
