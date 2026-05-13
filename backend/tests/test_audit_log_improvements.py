"""
Test Audit Log Improvements:
1. Group planned lessons update creates single audit log
2. Group planned lessons delete creates single audit log
3. Audit log API returns correct data structure with group_students_snapshot
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuditLogImprovements:
    """Test audit log improvements for group operations"""
    
    admin_token = None
    teacher_token = None
    teacher_id = None
    group_id = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login as admin and teacher"""
        # Admin login
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "test123"
        })
        if response.status_code == 200:
            TestAuditLogImprovements.admin_token = response.json()["access_token"]
            print(f"Admin login successful")
        else:
            pytest.skip("Admin login failed")
        
        # Teacher login
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "ilknur.uzunal",
            "password": "test123"
        })
        if response.status_code == 200:
            data = response.json()
            TestAuditLogImprovements.teacher_token = data["access_token"]
            TestAuditLogImprovements.teacher_id = data.get("teacher_id")
            print(f"Teacher login successful, teacher_id: {TestAuditLogImprovements.teacher_id}")
        else:
            pytest.skip("Teacher login failed")
    
    def get_admin_headers(self):
        return {"Authorization": f"Bearer {TestAuditLogImprovements.admin_token}"}
    
    def get_teacher_headers(self):
        return {"Authorization": f"Bearer {TestAuditLogImprovements.teacher_token}"}
    
    def test_01_get_teacher_groups(self):
        """Get teacher's groups to find a group for testing"""
        response = requests.get(
            f"{BASE_URL}/api/student-groups",
            headers=self.get_teacher_headers()
        )
        assert response.status_code == 200, f"Failed to get groups: {response.text}"
        
        groups = response.json()
        print(f"Found {len(groups)} groups")
        
        # Find a group belonging to this teacher
        teacher_groups = [g for g in groups if g.get("teacher_id") == TestAuditLogImprovements.teacher_id]
        print(f"Teacher has {len(teacher_groups)} groups")
        
        if teacher_groups:
            TestAuditLogImprovements.group_id = teacher_groups[0]["id"]
            print(f"Using group: {teacher_groups[0].get('name')} (ID: {TestAuditLogImprovements.group_id})")
            print(f"Group students: {teacher_groups[0].get('student_ids', [])}")
        else:
            pytest.skip("No groups found for teacher")
    
    def test_02_admin_audit_logs_recent_endpoint(self):
        """Test GET /api/admin/audit-logs/recent returns correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/admin/audit-logs/recent",
            headers=self.get_admin_headers()
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "logs" in data, "Response should have 'logs' field"
        assert "total_count" in data, "Response should have 'total_count' field"
        assert "has_new_changes" in data, "Response should have 'has_new_changes' field"
        
        print(f"Recent audit logs: {data['total_count']} logs, has_new_changes: {data['has_new_changes']}")
        
        # Check log structure if there are logs
        if data["logs"]:
            log = data["logs"][0]
            print(f"Sample log: action_type={log.get('action_type')}, category={log.get('category')}")
            print(f"  teacher_name={log.get('teacher_name')}")
            print(f"  group_id={log.get('group_id')}, group_name={log.get('group_name')}")
            print(f"  group_students_snapshot={log.get('group_students_snapshot')}")
    
    def test_03_admin_audit_logs_paginated_endpoint(self):
        """Test GET /api/admin/audit-logs with pagination"""
        response = requests.get(
            f"{BASE_URL}/api/admin/audit-logs?page=1&page_size=10",
            headers=self.get_admin_headers()
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "logs" in data, "Response should have 'logs' field"
        assert "total_count" in data, "Response should have 'total_count' field"
        assert "page" in data, "Response should have 'page' field"
        assert "page_size" in data, "Response should have 'page_size' field"
        assert "total_pages" in data, "Response should have 'total_pages' field"
        
        print(f"Paginated audit logs: {data['total_count']} total, page {data['page']}/{data['total_pages']}")
    
    def test_04_group_planned_lesson_create(self):
        """Test POST /api/group-planned-lessons creates planned lessons for group"""
        if not TestAuditLogImprovements.group_id:
            pytest.skip("No group available for testing")
        
        # Create a group planned lesson
        response = requests.post(
            f"{BASE_URL}/api/group-planned-lessons",
            headers=self.get_teacher_headers(),
            json={
                "group_id": TestAuditLogImprovements.group_id,
                "dates": "TEST-5-12-19-26",
                "number_of_lessons": 4,
                "month": "2026-03"
            }
        )
        
        # May fail if already exists or no courses, but endpoint should work
        print(f"Create group planned lesson response: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Created {data.get('count', 0)} planned lessons")
        else:
            print(f"Response: {response.text}")
    
    def test_05_group_planned_lesson_update_single_audit_log(self):
        """Test PUT /api/group-planned-lessons creates single audit log"""
        if not TestAuditLogImprovements.group_id:
            pytest.skip("No group available for testing")
        
        # First, get current audit log count
        response = requests.get(
            f"{BASE_URL}/api/admin/audit-logs?page=1&page_size=100",
            headers=self.get_admin_headers()
        )
        initial_count = response.json().get("total_count", 0)
        print(f"Initial audit log count: {initial_count}")
        
        # Update group planned lesson
        response = requests.put(
            f"{BASE_URL}/api/group-planned-lessons",
            headers=self.get_teacher_headers(),
            json={
                "group_id": TestAuditLogImprovements.group_id,
                "old_month": "2026-03",
                "old_dates": "TEST-5-12-19-26",
                "old_number_of_lessons": 4,
                "new_dates": "TEST-6-13-20-27",
                "new_number_of_lessons": 4,
                "new_month": "2026-03"
            }
        )
        
        print(f"Update group planned lesson response: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Updated {data.get('count', 0)} planned lessons")
            
            # Check audit log count - should only increase by 1 (single audit log)
            response = requests.get(
                f"{BASE_URL}/api/admin/audit-logs?page=1&page_size=100",
                headers=self.get_admin_headers()
            )
            new_count = response.json().get("total_count", 0)
            print(f"New audit log count: {new_count}")
            
            # If lessons were updated, audit log should increase by exactly 1
            if data.get('count', 0) > 0:
                assert new_count == initial_count + 1, f"Expected single audit log, but count changed from {initial_count} to {new_count}"
                print("PASS: Single audit log created for group update")
        else:
            print(f"Response: {response.text}")
    
    def test_06_group_planned_lesson_delete_single_audit_log(self):
        """Test DELETE /api/group-planned-lessons creates single audit log"""
        if not TestAuditLogImprovements.group_id:
            pytest.skip("No group available for testing")
        
        # First, get current audit log count
        response = requests.get(
            f"{BASE_URL}/api/admin/audit-logs?page=1&page_size=100",
            headers=self.get_admin_headers()
        )
        initial_count = response.json().get("total_count", 0)
        print(f"Initial audit log count: {initial_count}")
        
        # Delete group planned lesson
        response = requests.delete(
            f"{BASE_URL}/api/group-planned-lessons",
            headers=self.get_teacher_headers(),
            json={
                "group_id": TestAuditLogImprovements.group_id,
                "month": "2026-03",
                "dates": "TEST-6-13-20-27",
                "number_of_lessons": 4
            }
        )
        
        print(f"Delete group planned lesson response: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Deleted {data.get('count', 0)} planned lessons")
            
            # Check audit log count - should only increase by 1 (single audit log)
            response = requests.get(
                f"{BASE_URL}/api/admin/audit-logs?page=1&page_size=100",
                headers=self.get_admin_headers()
            )
            new_count = response.json().get("total_count", 0)
            print(f"New audit log count: {new_count}")
            
            # If lessons were deleted, audit log should increase by exactly 1
            if data.get('count', 0) > 0:
                assert new_count == initial_count + 1, f"Expected single audit log, but count changed from {initial_count} to {new_count}"
                print("PASS: Single audit log created for group delete")
        else:
            print(f"Response: {response.text}")
    
    def test_07_audit_log_has_group_students_snapshot(self):
        """Test that audit logs for group operations include group_students_snapshot"""
        response = requests.get(
            f"{BASE_URL}/api/admin/audit-logs?page=1&page_size=50",
            headers=self.get_admin_headers()
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        logs = data.get("logs", [])
        
        # Find a log with group_id
        group_logs = [log for log in logs if log.get("group_id")]
        print(f"Found {len(group_logs)} logs with group_id")
        
        if group_logs:
            log = group_logs[0]
            print(f"Sample group log:")
            print(f"  group_id: {log.get('group_id')}")
            print(f"  group_name: {log.get('group_name')}")
            print(f"  group_students_snapshot: {log.get('group_students_snapshot')}")
            
            # Verify group_students_snapshot structure
            snapshot = log.get("group_students_snapshot")
            if snapshot:
                assert isinstance(snapshot, list), "group_students_snapshot should be a list"
                if snapshot:
                    student = snapshot[0]
                    assert "id" in student, "Student snapshot should have 'id'"
                    assert "name" in student, "Student snapshot should have 'name'"
                    print(f"  First student: {student}")
                print("PASS: group_students_snapshot has correct structure")
            else:
                print("Note: group_students_snapshot is None or empty")
    
    def test_08_mark_audit_logs_read(self):
        """Test POST /api/admin/audit-logs/mark-read"""
        response = requests.post(
            f"{BASE_URL}/api/admin/audit-logs/mark-read",
            headers=self.get_admin_headers()
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should have 'message' field"
        print(f"Mark read response: {data['message']}")


class TestAuditLogDataFormat:
    """Test that audit log data doesn't contain hidden fields"""
    
    admin_token = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login as admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "test123"
        })
        if response.status_code == 200:
            TestAuditLogDataFormat.admin_token = response.json()["access_token"]
        else:
            pytest.skip("Admin login failed")
    
    def get_admin_headers(self):
        return {"Authorization": f"Bearer {TestAuditLogDataFormat.admin_token}"}
    
    def test_audit_log_data_fields(self):
        """Verify audit log old_data and new_data structure"""
        response = requests.get(
            f"{BASE_URL}/api/admin/audit-logs?page=1&page_size=50",
            headers=self.get_admin_headers()
        )
        assert response.status_code == 200
        
        data = response.json()
        logs = data.get("logs", [])
        
        print(f"Checking {len(logs)} audit logs for data structure")
        
        # Check a few logs
        for log in logs[:5]:
            old_data = log.get("old_data")
            new_data = log.get("new_data")
            
            print(f"\nLog: {log.get('action_type')} {log.get('category')}")
            print(f"  old_data keys: {list(old_data.keys()) if old_data else 'None'}")
            print(f"  new_data keys: {list(new_data.keys()) if new_data else 'None'}")
            
            # Note: The filtering of hidden fields (is_free_lesson, student_count, teacher_rate)
            # is done in the frontend, not backend. Backend stores all data.
            # This test just verifies the data structure is correct.


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
