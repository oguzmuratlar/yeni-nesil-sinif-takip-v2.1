"""
Test Group Lessons Functionality - Iteration 12
Tests for:
1. GET /api/group-lessons/{group_id} endpoint - fetches lessons directly by group_id
2. POST /api/group-lessons - creates group lesson for all students in group
3. Group lesson visibility in listing screen
4. Teacher earning calculation (teacher_rate only on first student)
5. Update and delete group lessons
6. Total lesson count and lesson day calculation
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_CREDS = {"username": "admin", "password": "test123"}
TEACHER_CREDS = {"username": "ilknur.uzunal", "password": "test123"}

# Known test data
TEST_GROUP_ID = "fc279724-d0cc-4f1c-98df-3a15fbf6ce99"  # 5. sınıf Grup
TEST_BRANCH_ID = "2014af77-18a6-4d0f-a1c4-3fccc2a0308d"  # Türkçe branch


class TestGroupLessonsEndpoint:
    """Test GET /api/group-lessons/{group_id} endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with admin auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        token = response.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.admin_token = token
        
        # Login as teacher
        teacher_response = requests.post(f"{BASE_URL}/api/auth/login", json=TEACHER_CREDS)
        if teacher_response.status_code == 200:
            self.teacher_token = teacher_response.json()["access_token"]
            self.teacher_id = teacher_response.json().get("teacher_id")
        else:
            self.teacher_token = None
            self.teacher_id = None
    
    def test_get_group_lessons_endpoint_exists(self):
        """Test that GET /api/group-lessons/{group_id} endpoint exists and returns data"""
        response = self.session.get(f"{BASE_URL}/api/group-lessons/{TEST_GROUP_ID}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "group" in data, "Response should contain 'group' field"
        assert "lessons" in data, "Response should contain 'lessons' field"
        assert "total_lessons" in data, "Response should contain 'total_lessons' field"
        assert "total_dates" in data, "Response should contain 'total_dates' field"
        assert "raw_lessons" in data, "Response should contain 'raw_lessons' field"
        
        print(f"✓ GET /api/group-lessons/{TEST_GROUP_ID} returns valid structure")
        print(f"  - Group: {data['group'].get('name')}")
        print(f"  - Total lessons: {data['total_lessons']}")
        print(f"  - Total dates: {data['total_dates']}")
    
    def test_group_lessons_filtered_by_group_id(self):
        """Test that lessons are filtered by group_id directly"""
        response = self.session.get(f"{BASE_URL}/api/group-lessons/{TEST_GROUP_ID}")
        assert response.status_code == 200
        
        data = response.json()
        raw_lessons = data.get("raw_lessons", [])
        
        # All lessons should have the correct group_id
        for lesson in raw_lessons:
            assert lesson.get("group_id") == TEST_GROUP_ID, \
                f"Lesson {lesson.get('id')} has wrong group_id: {lesson.get('group_id')}"
        
        print(f"✓ All {len(raw_lessons)} lessons have correct group_id")
    
    def test_group_lessons_sorted_by_date_desc(self):
        """Test that lessons are sorted by date descending (newest first)"""
        response = self.session.get(f"{BASE_URL}/api/group-lessons/{TEST_GROUP_ID}")
        assert response.status_code == 200
        
        data = response.json()
        lessons = data.get("lessons", [])
        
        if len(lessons) > 1:
            dates = [l["date"] for l in lessons]
            assert dates == sorted(dates, reverse=True), "Lessons should be sorted by date descending"
            print(f"✓ Lessons sorted correctly (newest first): {dates[:3]}...")
        else:
            print("✓ Not enough lessons to verify sorting")
    
    def test_teacher_earning_calculation(self):
        """Test that teacher_rate is only on first student (no duplication)"""
        response = self.session.get(f"{BASE_URL}/api/group-lessons/{TEST_GROUP_ID}")
        assert response.status_code == 200
        
        data = response.json()
        raw_lessons = data.get("raw_lessons", [])
        
        # Group lessons by date
        lessons_by_date = {}
        for lesson in raw_lessons:
            date = lesson.get("date")
            if date not in lessons_by_date:
                lessons_by_date[date] = []
            lessons_by_date[date].append(lesson)
        
        # For each date, only ONE lesson should have teacher_rate > 0
        for date, date_lessons in lessons_by_date.items():
            rates_with_value = [l for l in date_lessons if l.get("teacher_rate", 0) > 0]
            assert len(rates_with_value) <= 1, \
                f"Date {date}: Expected max 1 lesson with teacher_rate > 0, got {len(rates_with_value)}"
        
        print(f"✓ Teacher earning calculation correct - only first student has teacher_rate")
    
    def test_nonexistent_group_returns_404(self):
        """Test that nonexistent group returns 404"""
        fake_group_id = "nonexistent-group-id-12345"
        response = self.session.get(f"{BASE_URL}/api/group-lessons/{fake_group_id}")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Nonexistent group returns 404")


class TestGroupLessonCreation:
    """Test POST /api/group-lessons endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with admin auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        token = response.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Generate unique test date
        self.test_date = (datetime.now() + timedelta(days=100)).strftime("%Y-%m-%d")
    
    def test_create_group_lesson(self):
        """Test creating a new group lesson"""
        params = {
            "group_id": TEST_GROUP_ID,
            "branch_id": TEST_BRANCH_ID,
            "date": self.test_date,
            "number_of_lessons": 2,
            "is_free_lesson": False
        }
        
        response = self.session.post(f"{BASE_URL}/api/group-lessons", params=params)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "count" in data, "Response should contain 'count' field"
        assert data["count"] > 0, "Should create lessons for at least one student"
        
        print(f"✓ Created group lesson for {data['count']} students on {self.test_date}")
        
        # Verify lesson appears in listing
        list_response = self.session.get(f"{BASE_URL}/api/group-lessons/{TEST_GROUP_ID}")
        assert list_response.status_code == 200
        
        list_data = list_response.json()
        raw_lessons = list_data.get("raw_lessons", [])
        
        # Find lessons for our test date
        test_date_lessons = [l for l in raw_lessons if l.get("date") == self.test_date]
        assert len(test_date_lessons) > 0, f"New lesson should appear in listing for date {self.test_date}"
        
        print(f"✓ New lesson appears in listing screen ({len(test_date_lessons)} student records)")
        
        # Cleanup - delete the test lessons
        delete_response = self.session.delete(f"{BASE_URL}/api/group-lessons/{TEST_GROUP_ID}/{self.test_date}")
        assert delete_response.status_code == 200, f"Cleanup failed: {delete_response.text}"
        print(f"✓ Cleanup: Deleted test lessons for {self.test_date}")
    
    def test_create_free_group_lesson(self):
        """Test creating a free group lesson (admin only)"""
        params = {
            "group_id": TEST_GROUP_ID,
            "branch_id": TEST_BRANCH_ID,
            "date": self.test_date,
            "number_of_lessons": 1,
            "is_free_lesson": True
        }
        
        response = self.session.post(f"{BASE_URL}/api/group-lessons", params=params)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("is_free_lesson") == True, "Lesson should be marked as free"
        print(f"✓ Created free group lesson for {data['count']} students")
        
        # Verify is_free_lesson flag in listing
        list_response = self.session.get(f"{BASE_URL}/api/group-lessons/{TEST_GROUP_ID}")
        list_data = list_response.json()
        raw_lessons = list_data.get("raw_lessons", [])
        
        test_date_lessons = [l for l in raw_lessons if l.get("date") == self.test_date]
        assert all(l.get("is_free_lesson") == True for l in test_date_lessons), \
            "All lessons for this date should be marked as free"
        
        print("✓ Free lesson flag correctly set on all student records")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/group-lessons/{TEST_GROUP_ID}/{self.test_date}")
    
    def test_lesson_has_group_id_field(self):
        """Test that created lessons have group_id field"""
        params = {
            "group_id": TEST_GROUP_ID,
            "branch_id": TEST_BRANCH_ID,
            "date": self.test_date,
            "number_of_lessons": 2
        }
        
        self.session.post(f"{BASE_URL}/api/group-lessons", params=params)
        
        # Verify group_id field
        list_response = self.session.get(f"{BASE_URL}/api/group-lessons/{TEST_GROUP_ID}")
        list_data = list_response.json()
        raw_lessons = list_data.get("raw_lessons", [])
        
        test_date_lessons = [l for l in raw_lessons if l.get("date") == self.test_date]
        
        for lesson in test_date_lessons:
            assert lesson.get("group_id") == TEST_GROUP_ID, \
                f"Lesson should have group_id={TEST_GROUP_ID}, got {lesson.get('group_id')}"
            assert lesson.get("teacher_id") is not None, "Lesson should have teacher_id"
            assert lesson.get("branch_id") == TEST_BRANCH_ID, "Lesson should have correct branch_id"
            assert lesson.get("student_id") is not None, "Lesson should have student_id"
        
        print("✓ All lesson records have correct group_id, teacher_id, branch_id, student_id")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/group-lessons/{TEST_GROUP_ID}/{self.test_date}")


class TestGroupLessonDeletion:
    """Test DELETE /api/group-lessons/{group_id}/{date} endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with admin auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        assert response.status_code == 200
        token = response.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        self.test_date = (datetime.now() + timedelta(days=101)).strftime("%Y-%m-%d")
    
    def test_delete_group_lessons_by_date(self):
        """Test deleting all group lessons for a specific date"""
        # First create a lesson
        params = {
            "group_id": TEST_GROUP_ID,
            "branch_id": TEST_BRANCH_ID,
            "date": self.test_date,
            "number_of_lessons": 2
        }
        create_response = self.session.post(f"{BASE_URL}/api/group-lessons", params=params)
        assert create_response.status_code == 200
        created_count = create_response.json()["count"]
        
        # Verify it exists
        list_response = self.session.get(f"{BASE_URL}/api/group-lessons/{TEST_GROUP_ID}")
        raw_lessons = list_response.json().get("raw_lessons", [])
        before_count = len([l for l in raw_lessons if l.get("date") == self.test_date])
        assert before_count == created_count, f"Expected {created_count} lessons, found {before_count}"
        
        # Delete
        delete_response = self.session.delete(f"{BASE_URL}/api/group-lessons/{TEST_GROUP_ID}/{self.test_date}")
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        
        # Verify deletion
        list_response = self.session.get(f"{BASE_URL}/api/group-lessons/{TEST_GROUP_ID}")
        raw_lessons = list_response.json().get("raw_lessons", [])
        after_count = len([l for l in raw_lessons if l.get("date") == self.test_date])
        assert after_count == 0, f"Expected 0 lessons after delete, found {after_count}"
        
        print(f"✓ Successfully deleted {created_count} lessons for date {self.test_date}")


class TestTotalLessonCalculation:
    """Test total lesson count and lesson day calculation"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with admin auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        assert response.status_code == 200
        token = response.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_total_lessons_calculation(self):
        """Test that total_lessons is calculated correctly"""
        response = self.session.get(f"{BASE_URL}/api/group-lessons/{TEST_GROUP_ID}")
        assert response.status_code == 200
        
        data = response.json()
        lessons = data.get("lessons", [])
        total_lessons = data.get("total_lessons", 0)
        total_dates = data.get("total_dates", 0)
        
        # Calculate expected total
        expected_total = sum(l.get("number_of_lessons", 0) for l in lessons)
        
        assert total_lessons == expected_total, \
            f"total_lessons mismatch: API says {total_lessons}, calculated {expected_total}"
        assert total_dates == len(lessons), \
            f"total_dates mismatch: API says {total_dates}, actual {len(lessons)}"
        
        print(f"✓ Total lessons: {total_lessons}, Total dates: {total_dates}")
    
    def test_free_lesson_count(self):
        """Test that free_lesson_count is calculated correctly"""
        response = self.session.get(f"{BASE_URL}/api/group-lessons/{TEST_GROUP_ID}")
        assert response.status_code == 200
        
        data = response.json()
        lessons = data.get("lessons", [])
        free_lesson_count = data.get("free_lesson_count", 0)
        
        # Calculate expected free count
        expected_free = sum(1 for l in lessons if l.get("is_free_lesson"))
        
        assert free_lesson_count == expected_free, \
            f"free_lesson_count mismatch: API says {free_lesson_count}, calculated {expected_free}"
        
        print(f"✓ Free lesson count: {free_lesson_count}")


class TestTeacherAccess:
    """Test teacher access to group lessons"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with teacher auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as teacher
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=TEACHER_CREDS)
        if response.status_code == 200:
            token = response.json()["access_token"]
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.teacher_id = response.json().get("teacher_id")
            self.logged_in = True
        else:
            self.logged_in = False
            pytest.skip("Teacher login failed")
    
    def test_teacher_can_access_own_group(self):
        """Test that teacher can access their own group's lessons"""
        if not self.logged_in:
            pytest.skip("Teacher not logged in")
        
        # Get teacher's groups
        groups_response = self.session.get(f"{BASE_URL}/api/student-groups")
        assert groups_response.status_code == 200
        
        groups = groups_response.json()
        teacher_groups = [g for g in groups if g.get("teacher_id") == self.teacher_id]
        
        if not teacher_groups:
            pytest.skip("Teacher has no groups")
        
        # Try to access first group
        group_id = teacher_groups[0]["id"]
        response = self.session.get(f"{BASE_URL}/api/group-lessons/{group_id}")
        
        assert response.status_code == 200, f"Teacher should access own group: {response.text}"
        print(f"✓ Teacher can access own group: {teacher_groups[0].get('name')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
