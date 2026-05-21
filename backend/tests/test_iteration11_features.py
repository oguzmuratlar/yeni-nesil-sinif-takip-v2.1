"""
Test file for Iteration 11 features:
1. Group lessons now visible with group_id - TeacherGroupLessons page should list lessons
2. Admin Settings page at /admin/settings with 'Ödev Takip Sistemi' toggle
3. Feature Flag toggle should work - active/passive can be changed
4. When Feature Flag is passive, teacher page should not show 'Ödev' button
5. Pagination API endpoint /api/lessons/paginated should work and return total_count
6. Group lessons page should show pagination buttons (when >15 records)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuth:
    """Authentication tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "test123"
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user_type"] == "admin"
        return data["access_token"]
    
    @pytest.fixture(scope="class")
    def teacher_token(self):
        """Get teacher token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "ilknur.uzunal",
            "password": "test123"
        })
        assert response.status_code == 200, f"Teacher login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user_type"] == "teacher"
        return data["access_token"], data.get("teacher_id")
    
    def test_admin_login(self, admin_token):
        """Test admin login works"""
        assert admin_token is not None
        print("✓ Admin login successful")
    
    def test_teacher_login(self, teacher_token):
        """Test teacher login works"""
        token, teacher_id = teacher_token
        assert token is not None
        assert teacher_id is not None
        print(f"✓ Teacher login successful, teacher_id: {teacher_id}")


class TestSystemSettings:
    """Test Feature Flag / System Settings endpoints"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "test123"
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def teacher_token(self):
        """Get teacher token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "ilknur.uzunal",
            "password": "test123"
        })
        assert response.status_code == 200
        data = response.json()
        return data["access_token"], data.get("teacher_id")
    
    def test_get_system_settings_admin(self, admin_token):
        """Admin should be able to get system settings"""
        response = requests.get(
            f"{BASE_URL}/api/system-settings",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        settings = response.json()
        assert isinstance(settings, list)
        
        # Check homework_tool_enabled exists
        homework_setting = next((s for s in settings if s["key"] == "homework_tool_enabled"), None)
        assert homework_setting is not None, "homework_tool_enabled setting not found"
        assert "value" in homework_setting
        assert "description" in homework_setting
        print(f"✓ System settings retrieved, homework_tool_enabled: {homework_setting['value']}")
    
    def test_get_system_settings_teacher_forbidden(self, teacher_token):
        """Teacher should NOT be able to get system settings"""
        token, _ = teacher_token
        response = requests.get(
            f"{BASE_URL}/api/system-settings",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✓ Teacher correctly forbidden from system settings")
    
    def test_toggle_homework_feature_flag(self, admin_token):
        """Admin should be able to toggle homework feature flag"""
        # First get current value
        response = requests.get(
            f"{BASE_URL}/api/system-settings",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        settings = response.json()
        homework_setting = next((s for s in settings if s["key"] == "homework_tool_enabled"), None)
        current_value = homework_setting["value"]
        
        # Toggle to opposite value
        new_value = not current_value
        response = requests.put(
            f"{BASE_URL}/api/system-settings/homework_tool_enabled",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"value": new_value, "description": "Ödev Takip Sistemi"}
        )
        assert response.status_code == 200, f"Failed to toggle: {response.text}"
        
        # Verify the change
        response = requests.get(
            f"{BASE_URL}/api/system-settings",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        settings = response.json()
        homework_setting = next((s for s in settings if s["key"] == "homework_tool_enabled"), None)
        assert homework_setting["value"] == new_value, "Value did not change"
        
        # Toggle back to original
        response = requests.put(
            f"{BASE_URL}/api/system-settings/homework_tool_enabled",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"value": current_value, "description": "Ödev Takip Sistemi"}
        )
        assert response.status_code == 200
        print(f"✓ Feature flag toggle works: {current_value} -> {new_value} -> {current_value}")
    
    def test_homework_status_endpoint(self, teacher_token):
        """Teacher should be able to check homework status"""
        token, _ = teacher_token
        response = requests.get(
            f"{BASE_URL}/api/system-settings/homework-status",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "enabled" in data
        print(f"✓ Homework status endpoint works, enabled: {data['enabled']}")


class TestPaginatedLessons:
    """Test paginated lessons endpoint"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "test123"
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def teacher_token(self):
        """Get teacher token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "ilknur.uzunal",
            "password": "test123"
        })
        assert response.status_code == 200
        data = response.json()
        return data["access_token"], data.get("teacher_id")
    
    def test_paginated_lessons_endpoint_exists(self, admin_token):
        """Test that /api/lessons/paginated endpoint exists and returns correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/lessons/paginated?page=1&page_size=15",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Check response structure
        assert "data" in data, "Missing 'data' field"
        assert "total_count" in data, "Missing 'total_count' field"
        assert "page" in data, "Missing 'page' field"
        assert "page_size" in data, "Missing 'page_size' field"
        assert "total_pages" in data, "Missing 'total_pages' field"
        
        print(f"✓ Paginated lessons endpoint works: total_count={data['total_count']}, total_pages={data['total_pages']}")
    
    def test_paginated_lessons_with_group_id(self, admin_token):
        """Test paginated lessons filtered by group_id"""
        # Use the known group ID from the test context
        group_id = "fc279724-d0cc-4f1c-98df-3a15fbf6ce99"
        
        response = requests.get(
            f"{BASE_URL}/api/lessons/paginated?group_id={group_id}&page=1&page_size=15",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "data" in data
        assert "total_count" in data
        
        # Verify all returned lessons have the correct group_id
        for lesson in data["data"]:
            assert lesson.get("group_id") == group_id, f"Lesson {lesson.get('id')} has wrong group_id"
        
        print(f"✓ Paginated lessons with group_id filter works: {len(data['data'])} lessons, total_count={data['total_count']}")
    
    def test_paginated_lessons_with_teacher_id(self, teacher_token):
        """Test paginated lessons filtered by teacher_id"""
        token, teacher_id = teacher_token
        
        response = requests.get(
            f"{BASE_URL}/api/lessons/paginated?teacher_id={teacher_id}&page=1&page_size=15",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "data" in data
        assert "total_count" in data
        
        # Verify all returned lessons have the correct teacher_id
        for lesson in data["data"]:
            assert lesson.get("teacher_id") == teacher_id, f"Lesson {lesson.get('id')} has wrong teacher_id"
        
        print(f"✓ Paginated lessons with teacher_id filter works: {len(data['data'])} lessons, total_count={data['total_count']}")
    
    def test_pagination_page_navigation(self, admin_token):
        """Test pagination works correctly with different pages"""
        # Get first page
        response1 = requests.get(
            f"{BASE_URL}/api/lessons/paginated?page=1&page_size=5",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response1.status_code == 200
        data1 = response1.json()
        
        if data1["total_pages"] > 1:
            # Get second page
            response2 = requests.get(
                f"{BASE_URL}/api/lessons/paginated?page=2&page_size=5",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            assert response2.status_code == 200
            data2 = response2.json()
            
            # Verify different data on different pages
            if len(data1["data"]) > 0 and len(data2["data"]) > 0:
                first_page_ids = [l["id"] for l in data1["data"]]
                second_page_ids = [l["id"] for l in data2["data"]]
                assert not any(id in first_page_ids for id in second_page_ids), "Pages should have different lessons"
            
            print(f"✓ Pagination navigation works: page 1 has {len(data1['data'])} items, page 2 has {len(data2['data'])} items")
        else:
            print(f"✓ Pagination works (only 1 page with {data1['total_count']} total items)")


class TestGroupLessons:
    """Test group lessons functionality"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "test123"
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def teacher_token(self):
        """Get teacher token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "ilknur.uzunal",
            "password": "test123"
        })
        assert response.status_code == 200
        data = response.json()
        return data["access_token"], data.get("teacher_id")
    
    def test_group_lessons_have_group_id(self, admin_token):
        """Verify group lessons have group_id field populated"""
        group_id = "fc279724-d0cc-4f1c-98df-3a15fbf6ce99"
        
        response = requests.get(
            f"{BASE_URL}/api/lessons/paginated?group_id={group_id}&page=1&page_size=15",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        if data["total_count"] > 0:
            # All lessons should have group_id (this is the key fix)
            for lesson in data["data"]:
                assert lesson.get("group_id") == group_id, f"Lesson missing group_id"
            
            # Note: teacher_id, branch_id, student_id may be null for older lessons
            # created before the fix. New lessons will have these fields.
            lessons_with_teacher_id = [l for l in data["data"] if l.get("teacher_id") is not None]
            print(f"✓ Group lessons filtered by group_id: {len(data['data'])} lessons")
            print(f"  - Lessons with teacher_id: {len(lessons_with_teacher_id)}/{len(data['data'])}")
            print(f"  - Note: Older lessons may not have teacher_id/branch_id/student_id (pre-fix data)")
        else:
            print("⚠ No group lessons found for testing")
    
    def test_get_student_groups(self, teacher_token):
        """Test getting student groups for teacher"""
        token, teacher_id = teacher_token
        
        response = requests.get(
            f"{BASE_URL}/api/student-groups",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        groups = response.json()
        
        # Filter teacher's groups
        teacher_groups = [g for g in groups if g.get("teacher_id") == teacher_id]
        
        print(f"✓ Teacher has {len(teacher_groups)} groups")
        
        if len(teacher_groups) > 0:
            # Check group structure
            group = teacher_groups[0]
            assert "id" in group
            assert "name" in group
            assert "branch_id" in group
            assert "student_ids" in group
            print(f"✓ Group structure is correct: {group['name']} with {len(group.get('student_ids', []))} students")


class TestFeatureFlagIntegration:
    """Test feature flag affects teacher UI"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "test123"
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def teacher_token(self):
        """Get teacher token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "ilknur.uzunal",
            "password": "test123"
        })
        assert response.status_code == 200
        data = response.json()
        return data["access_token"], data.get("teacher_id")
    
    def test_homework_status_reflects_feature_flag(self, admin_token, teacher_token):
        """Test that homework-status endpoint reflects the feature flag value"""
        token, _ = teacher_token
        
        # Get current feature flag value
        response = requests.get(
            f"{BASE_URL}/api/system-settings",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        settings = response.json()
        homework_setting = next((s for s in settings if s["key"] == "homework_tool_enabled"), None)
        expected_value = homework_setting["value"]
        
        # Check homework-status endpoint
        response = requests.get(
            f"{BASE_URL}/api/system-settings/homework-status",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["enabled"] == expected_value, f"homework-status should match feature flag: expected {expected_value}, got {data['enabled']}"
        print(f"✓ homework-status endpoint correctly reflects feature flag value: {expected_value}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
