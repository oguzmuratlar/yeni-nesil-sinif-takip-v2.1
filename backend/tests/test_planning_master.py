"""
Test Planning Master (Planlama Ustası) Gamification Feature
- Admin: GET /api/planning-master/all-teachers
- Teacher/Admin: GET /api/planning-master/summary/{teacher_id}
- Teacher/Admin: GET /api/planning-master/check/{teacher_id}
- Teacher/Admin: GET /api/planning-master/detail/{teacher_id}
- Teacher/Admin: GET /api/planning-master/history/{teacher_id}
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Module-level variables to store tokens
_admin_token = None
_teacher_token = None
_teacher_id = None


def get_admin_token():
    """Get admin authentication token"""
    global _admin_token
    if _admin_token:
        return _admin_token
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": "admin",
        "password": "admin123"
    })
    if response.status_code == 200:
        _admin_token = response.json().get("access_token")
        return _admin_token
    return None


def get_teacher_token():
    """Get teacher authentication token"""
    global _teacher_token, _teacher_id
    if _teacher_token:
        return _teacher_token
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": "ilknur.uzunal",
        "password": "test123"
    })
    if response.status_code == 200:
        data = response.json()
        _teacher_token = data.get("access_token")
        _teacher_id = data.get("teacher_id")
        return _teacher_token
    return None


def get_teacher_id():
    """Get teacher ID from login"""
    global _teacher_id
    if _teacher_id:
        return _teacher_id
    get_teacher_token()
    return _teacher_id


class TestPlanningMasterAPIs:
    """Planning Master API Tests"""
    
    # ==================== Login Tests ====================
    
    def test_admin_login(self):
        """Test admin login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        assert data.get("user_type") == "admin", f"User is not admin, got: {data}"
        print("✓ Admin login successful")
    
    def test_teacher_login(self):
        """Test teacher login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "ilknur.uzunal",
            "password": "test123"
        })
        assert response.status_code == 200, f"Teacher login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        assert data.get("user_type") == "teacher", f"User is not teacher, got: {data}"
        assert data.get("teacher_id") is not None, "No teacher_id in response"
        print(f"✓ Teacher login successful, teacher_id: {data.get('teacher_id')}")
    
    # ==================== Admin Tests ====================
    
    def test_admin_get_all_teachers_planning_master(self):
        """Test GET /api/planning-master/all-teachers (admin only)"""
        token = get_admin_token()
        assert token, "Failed to get admin token"
        
        response = requests.get(
            f"{BASE_URL}/api/planning-master/all-teachers",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Failed to get all teachers: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "season" in data, "No season in response"
        assert "teachers" in data, "No teachers in response"
        assert isinstance(data["teachers"], list), "Teachers should be a list"
        
        # Validate teacher data structure if teachers exist
        if len(data["teachers"]) > 0:
            teacher = data["teachers"][0]
            assert "teacher_id" in teacher, "No teacher_id in teacher data"
            assert "teacher_name" in teacher, "No teacher_name in teacher data"
            assert "total_score" in teacher, "No total_score in teacher data"
            assert "mini_badge_count" in teacher, "No mini_badge_count in teacher data"
            assert "big_badge" in teacher, "No big_badge in teacher data"
            assert "current_streak" in teacher, "No current_streak in teacher data"
            
        print(f"✓ Admin get all teachers: {len(data['teachers'])} teachers found, season: {data['season']}")
    
    def test_admin_get_all_teachers_unauthorized(self):
        """Test GET /api/planning-master/all-teachers requires admin"""
        token = get_teacher_token()
        assert token, "Failed to get teacher token"
        
        response = requests.get(
            f"{BASE_URL}/api/planning-master/all-teachers",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 403, f"Expected 403 for teacher access, got {response.status_code}"
        print("✓ Non-admin access correctly denied for all-teachers endpoint")
    
    # ==================== Summary Tests ====================
    
    def test_get_planning_master_summary_as_admin(self):
        """Test GET /api/planning-master/summary/{teacher_id} as admin"""
        token = get_admin_token()
        teacher_id = get_teacher_id()
        assert token, "Failed to get admin token"
        assert teacher_id, "Failed to get teacher_id"
        
        response = requests.get(
            f"{BASE_URL}/api/planning-master/summary/{teacher_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Failed to get summary: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "teacher_id" in data, "No teacher_id in response"
        assert "season" in data, "No season in response"
        assert "total_score" in data, "No total_score in response"
        assert "mini_badge_count" in data, "No mini_badge_count in response"
        assert "big_badge" in data, "No big_badge in response"
        assert "current_streak" in data, "No current_streak in response"
        assert "longest_streak" in data, "No longest_streak in response"
        
        print(f"✓ Admin get summary: teacher_id={data['teacher_id']}, total_score={data['total_score']}, mini_badges={data['mini_badge_count']}")
    
    def test_get_planning_master_summary_as_teacher(self):
        """Test GET /api/planning-master/summary/{teacher_id} as teacher (own data)"""
        token = get_teacher_token()
        teacher_id = get_teacher_id()
        assert token, "Failed to get teacher token"
        assert teacher_id, "Failed to get teacher_id"
        
        response = requests.get(
            f"{BASE_URL}/api/planning-master/summary/{teacher_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Failed to get own summary: {response.text}"
        data = response.json()
        assert data["teacher_id"] == teacher_id, "Teacher ID mismatch"
        print(f"✓ Teacher get own summary: total_score={data['total_score']}")
    
    # ==================== Check Tests ====================
    
    def test_get_planning_master_check_as_admin(self):
        """Test GET /api/planning-master/check/{teacher_id} as admin"""
        token = get_admin_token()
        teacher_id = get_teacher_id()
        assert token, "Failed to get admin token"
        assert teacher_id, "Failed to get teacher_id"
        
        response = requests.get(
            f"{BASE_URL}/api/planning-master/check/{teacher_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Failed to check status: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "show_warning" in data, "No show_warning in response"
        assert "next_month" in data, "No next_month in response"
        
        # If not invalid month, check additional fields
        if data.get("reason") != "invalid_month":
            assert "is_complete" in data, "No is_complete in response"
            assert "days_until_25th" in data, "No days_until_25th in response"
            assert "missing_students" in data, "No missing_students in response"
            assert "missing_groups" in data, "No missing_groups in response"
            assert "total_students" in data, "No total_students in response"
            assert "total_groups" in data, "No total_groups in response"
        
        print(f"✓ Admin check status: show_warning={data['show_warning']}, next_month={data['next_month']}")
    
    def test_get_planning_master_check_as_teacher(self):
        """Test GET /api/planning-master/check/{teacher_id} as teacher (own data)"""
        token = get_teacher_token()
        teacher_id = get_teacher_id()
        assert token, "Failed to get teacher token"
        assert teacher_id, "Failed to get teacher_id"
        
        response = requests.get(
            f"{BASE_URL}/api/planning-master/check/{teacher_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Failed to check own status: {response.text}"
        data = response.json()
        assert "show_warning" in data, "No show_warning in response"
        print(f"✓ Teacher check own status: show_warning={data['show_warning']}, missing_students={data.get('missing_students', 'N/A')}, missing_groups={data.get('missing_groups', 'N/A')}")
    
    # ==================== Detail Tests ====================
    
    def test_get_planning_master_detail_as_admin(self):
        """Test GET /api/planning-master/detail/{teacher_id} as admin"""
        token = get_admin_token()
        teacher_id = get_teacher_id()
        assert token, "Failed to get admin token"
        assert teacher_id, "Failed to get teacher_id"
        
        response = requests.get(
            f"{BASE_URL}/api/planning-master/detail/{teacher_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Failed to get detail: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "teacher_id" in data, "No teacher_id in response"
        assert "month" in data, "No month in response"
        assert "students" in data, "No students in response"
        assert "groups" in data, "No groups in response"
        assert "total_students" in data, "No total_students in response"
        assert "total_groups" in data, "No total_groups in response"
        assert "completed_students" in data, "No completed_students in response"
        assert "completed_groups" in data, "No completed_groups in response"
        
        # Validate student structure if students exist
        if len(data["students"]) > 0:
            student = data["students"][0]
            assert "id" in student, "No id in student data"
            assert "name" in student, "No name in student data"
            assert "has_planning" in student, "No has_planning in student data"
        
        # Validate group structure if groups exist
        if len(data["groups"]) > 0:
            group = data["groups"][0]
            assert "id" in group, "No id in group data"
            assert "name" in group, "No name in group data"
            assert "has_planning" in group, "No has_planning in group data"
        
        print(f"✓ Admin get detail: {data['completed_students']}/{data['total_students']} students, {data['completed_groups']}/{data['total_groups']} groups")
    
    def test_get_planning_master_detail_as_teacher(self):
        """Test GET /api/planning-master/detail/{teacher_id} as teacher (own data)"""
        token = get_teacher_token()
        teacher_id = get_teacher_id()
        assert token, "Failed to get teacher token"
        assert teacher_id, "Failed to get teacher_id"
        
        response = requests.get(
            f"{BASE_URL}/api/planning-master/detail/{teacher_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Failed to get own detail: {response.text}"
        data = response.json()
        assert data["teacher_id"] == teacher_id, "Teacher ID mismatch"
        print(f"✓ Teacher get own detail: {data['completed_students']}/{data['total_students']} students, {data['completed_groups']}/{data['total_groups']} groups")
    
    # ==================== History Tests ====================
    
    def test_get_planning_master_history_as_admin(self):
        """Test GET /api/planning-master/history/{teacher_id} as admin"""
        token = get_admin_token()
        teacher_id = get_teacher_id()
        assert token, "Failed to get admin token"
        assert teacher_id, "Failed to get teacher_id"
        
        response = requests.get(
            f"{BASE_URL}/api/planning-master/history/{teacher_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Failed to get history: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "teacher_id" in data, "No teacher_id in response"
        assert "season" in data, "No season in response"
        assert "records" in data, "No records in response"
        assert isinstance(data["records"], list), "Records should be a list"
        
        # Validate record structure if records exist
        if len(data["records"]) > 0:
            record = data["records"][0]
            assert "month" in record, "No month in record"
            assert "planning_score" in record, "No planning_score in record"
        
        print(f"✓ Admin get history: {len(data['records'])} records found for season {data['season']}")
    
    def test_get_planning_master_history_as_teacher(self):
        """Test GET /api/planning-master/history/{teacher_id} as teacher (own data)"""
        token = get_teacher_token()
        teacher_id = get_teacher_id()
        assert token, "Failed to get teacher token"
        assert teacher_id, "Failed to get teacher_id"
        
        response = requests.get(
            f"{BASE_URL}/api/planning-master/history/{teacher_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Failed to get own history: {response.text}"
        data = response.json()
        assert data["teacher_id"] == teacher_id, "Teacher ID mismatch"
        print(f"✓ Teacher get own history: {len(data['records'])} records")
    
    # ==================== Authorization Tests ====================
    
    def test_teacher_cannot_access_other_teacher_summary(self):
        """Test teacher cannot access another teacher's summary"""
        token = get_teacher_token()
        assert token, "Failed to get teacher token"
        
        # Try to access a different teacher's data (using a fake ID)
        response = requests.get(
            f"{BASE_URL}/api/planning-master/summary/fake-teacher-id",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        # Should be 403 Forbidden or 404 Not Found
        assert response.status_code in [403, 404], f"Expected 403 or 404, got {response.status_code}"
        print("✓ Teacher correctly denied access to other teacher's summary")
    
    def test_unauthenticated_access_denied(self):
        """Test unauthenticated access is denied"""
        response = requests.get(f"{BASE_URL}/api/planning-master/all-teachers")
        # 401 or 403 are both acceptable for unauthenticated access
        assert response.status_code in [401, 403], f"Expected 401 or 403, got {response.status_code}"
        print("✓ Unauthenticated access correctly denied")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
