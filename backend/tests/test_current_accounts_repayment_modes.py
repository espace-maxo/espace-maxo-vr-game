"""
Test suite for Current Accounts - 3 New Repayment Modes (Iteration 54)

Tests:
1. POST /api/current-accounts - new fields (repayment_percentage, repayment_fixed_amount, etc.)
2. PUT /api/current-accounts/{id} - NULLABLE_FIELDS handling
3. Auto-deduction engine - 3 modes combined
4. Percentage mode - idempotency
5. Fixed mode - daily/weekly/monthly/yearly with period-end logic
6. Fixed mode - respects start_date
7. Auto-deduction filter - picks up accounts with any mode enabled
8. Repayment cap - never exceeds total_advance - already_repaid
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, date

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCurrentAccountsRepaymentModes:
    """Tests for the 3 new repayment modes: schedule, percentage, fixed-period"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data prefix for cleanup"""
        self.test_prefix = f"TEST_REPAY_{uuid.uuid4().hex[:6]}"
        yield
        # Cleanup: delete test accounts
        try:
            res = requests.get(f"{BASE_URL}/api/current-accounts")
            if res.status_code == 200:
                for acc in res.json().get("accounts", []):
                    if acc.get("name", "").startswith("TEST_REPAY_"):
                        requests.delete(f"{BASE_URL}/api/current-accounts/{acc['id']}")
        except:
            pass
    
    # ==================== POST - New Fields ====================
    
    def test_create_account_with_percentage_mode(self):
        """POST /api/current-accounts accepts repayment_percentage field"""
        payload = {
            "name": f"{self.test_prefix}_PCT",
            "total_advance": 100000,
            "repayment_percentage": 10.5,
        }
        res = requests.post(f"{BASE_URL}/api/current-accounts", json=payload)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert data.get("success") is True
        acc = data.get("account", {})
        assert acc.get("repayment_percentage") == 10.5
        print(f"✓ Created account with repayment_percentage=10.5")
    
    def test_create_account_with_fixed_mode(self):
        """POST /api/current-accounts accepts fixed amount fields"""
        payload = {
            "name": f"{self.test_prefix}_FIXED",
            "total_advance": 200000,
            "repayment_fixed_amount": 5000,
            "repayment_fixed_period": "weekly",
            "repayment_fixed_start_date": "2026-05-01",
        }
        res = requests.post(f"{BASE_URL}/api/current-accounts", json=payload)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        acc = data.get("account", {})
        assert acc.get("repayment_fixed_amount") == 5000
        assert acc.get("repayment_fixed_period") == "weekly"
        assert acc.get("repayment_fixed_start_date") == "2026-05-01"
        print(f"✓ Created account with fixed mode: 5000 F/weekly starting 2026-05-01")
    
    def test_create_account_with_all_modes(self):
        """POST /api/current-accounts accepts all 3 modes combined"""
        payload = {
            "name": f"{self.test_prefix}_ALL_MODES",
            "total_advance": 500000,
            "auto_deduct_enabled": True,
            "repayment_percentage": 10,
            "repayment_fixed_amount": 5000,
            "repayment_fixed_period": "weekly",
            "schedule": [
                {"label": "Mois 1", "due_date": "2026-05-01", "expected_amount": 50000}
            ]
        }
        res = requests.post(f"{BASE_URL}/api/current-accounts", json=payload)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        acc = res.json().get("account", {})
        assert acc.get("auto_deduct_enabled") is True
        assert acc.get("repayment_percentage") == 10
        assert acc.get("repayment_fixed_amount") == 5000
        assert acc.get("repayment_fixed_period") == "weekly"
        assert len(acc.get("schedule", [])) == 1
        print(f"✓ Created account with all 3 modes enabled")
    
    def test_get_account_returns_new_fields(self):
        """GET /api/current-accounts returns new repayment fields"""
        # Create account first
        payload = {
            "name": f"{self.test_prefix}_GET_TEST",
            "total_advance": 100000,
            "repayment_percentage": 15,
            "repayment_fixed_amount": 2000,
            "repayment_fixed_period": "daily",
        }
        create_res = requests.post(f"{BASE_URL}/api/current-accounts", json=payload)
        assert create_res.status_code == 200
        acc_id = create_res.json().get("account", {}).get("id")
        
        # GET single account
        get_res = requests.get(f"{BASE_URL}/api/current-accounts/{acc_id}")
        assert get_res.status_code == 200
        acc = get_res.json()
        assert acc.get("repayment_percentage") == 15
        assert acc.get("repayment_fixed_amount") == 2000
        assert acc.get("repayment_fixed_period") == "daily"
        print(f"✓ GET returns new repayment fields correctly")
    
    # ==================== PUT - NULLABLE_FIELDS ====================
    
    def test_update_account_set_percentage(self):
        """PUT /api/current-accounts/{id} can set repayment_percentage"""
        # Create account without percentage
        payload = {"name": f"{self.test_prefix}_UPDATE_PCT", "total_advance": 100000}
        create_res = requests.post(f"{BASE_URL}/api/current-accounts", json=payload)
        acc_id = create_res.json().get("account", {}).get("id")
        
        # Update to add percentage
        update_res = requests.put(f"{BASE_URL}/api/current-accounts/{acc_id}", json={
            "repayment_percentage": 20
        })
        assert update_res.status_code == 200
        
        # Verify
        get_res = requests.get(f"{BASE_URL}/api/current-accounts/{acc_id}")
        assert get_res.json().get("repayment_percentage") == 20
        print(f"✓ PUT can set repayment_percentage")
    
    def test_update_account_clear_percentage(self):
        """PUT /api/current-accounts/{id} can clear repayment_percentage with null"""
        # Create account with percentage
        payload = {
            "name": f"{self.test_prefix}_CLEAR_PCT",
            "total_advance": 100000,
            "repayment_percentage": 10
        }
        create_res = requests.post(f"{BASE_URL}/api/current-accounts", json=payload)
        acc_id = create_res.json().get("account", {}).get("id")
        
        # Clear percentage
        update_res = requests.put(f"{BASE_URL}/api/current-accounts/{acc_id}", json={
            "repayment_percentage": None
        })
        assert update_res.status_code == 200
        
        # Verify cleared
        get_res = requests.get(f"{BASE_URL}/api/current-accounts/{acc_id}")
        assert get_res.json().get("repayment_percentage") is None
        print(f"✓ PUT can clear repayment_percentage with null")
    
    def test_update_account_clear_fixed_mode(self):
        """PUT /api/current-accounts/{id} can clear fixed mode fields"""
        # Create account with fixed mode
        payload = {
            "name": f"{self.test_prefix}_CLEAR_FIXED",
            "total_advance": 100000,
            "repayment_fixed_amount": 5000,
            "repayment_fixed_period": "weekly"
        }
        create_res = requests.post(f"{BASE_URL}/api/current-accounts", json=payload)
        acc_id = create_res.json().get("account", {}).get("id")
        
        # Clear fixed mode
        update_res = requests.put(f"{BASE_URL}/api/current-accounts/{acc_id}", json={
            "repayment_fixed_amount": None,
            "repayment_fixed_period": None
        })
        assert update_res.status_code == 200
        
        # Verify cleared
        get_res = requests.get(f"{BASE_URL}/api/current-accounts/{acc_id}")
        acc = get_res.json()
        assert acc.get("repayment_fixed_amount") is None
        assert acc.get("repayment_fixed_period") is None
        print(f"✓ PUT can clear fixed mode fields with null")
    
    # ==================== Auto-Deduction Filter ====================
    
    def test_auto_deduction_filter_picks_up_percentage_mode(self):
        """run-auto-deduction processes accounts with repayment_percentage > 0"""
        # Create account with only percentage mode (no auto_deduct_enabled)
        payload = {
            "name": f"{self.test_prefix}_FILTER_PCT",
            "total_advance": 100000,
            "repayment_percentage": 10,
            "auto_deduct_enabled": False
        }
        create_res = requests.post(f"{BASE_URL}/api/current-accounts", json=payload)
        acc_id = create_res.json().get("account", {}).get("id")
        
        # Run auto-deduction
        run_res = requests.post(f"{BASE_URL}/api/current-accounts/run-auto-deduction", json={
            "date": "2026-04-25"
        })
        assert run_res.status_code == 200
        
        # Check if account was processed
        results = run_res.json().get("results", [])
        processed_ids = [r.get("account_id") for r in results]
        assert acc_id in processed_ids, "Account with percentage mode should be processed"
        print(f"✓ Auto-deduction filter picks up accounts with repayment_percentage > 0")
    
    def test_auto_deduction_filter_picks_up_fixed_mode(self):
        """run-auto-deduction processes accounts with repayment_fixed_amount > 0"""
        # Create account with only fixed mode
        payload = {
            "name": f"{self.test_prefix}_FILTER_FIXED",
            "total_advance": 100000,
            "repayment_fixed_amount": 5000,
            "repayment_fixed_period": "daily",
            "auto_deduct_enabled": False
        }
        create_res = requests.post(f"{BASE_URL}/api/current-accounts", json=payload)
        acc_id = create_res.json().get("account", {}).get("id")
        
        # Run auto-deduction
        run_res = requests.post(f"{BASE_URL}/api/current-accounts/run-auto-deduction", json={
            "date": "2026-04-25"
        })
        assert run_res.status_code == 200
        
        results = run_res.json().get("results", [])
        processed_ids = [r.get("account_id") for r in results]
        assert acc_id in processed_ids, "Account with fixed mode should be processed"
        print(f"✓ Auto-deduction filter picks up accounts with repayment_fixed_amount > 0")
    
    # ==================== Percentage Mode - Idempotency ====================
    
    def test_percentage_mode_idempotent(self):
        """Running auto-deduction twice on same date does NOT duplicate percentage repayment"""
        # Create account with percentage mode
        payload = {
            "name": f"{self.test_prefix}_PCT_IDEMP",
            "total_advance": 100000,
            "repayment_percentage": 10
        }
        create_res = requests.post(f"{BASE_URL}/api/current-accounts", json=payload)
        acc_id = create_res.json().get("account", {}).get("id")
        
        test_date = "2026-04-25"
        
        # Run auto-deduction first time
        run1 = requests.post(f"{BASE_URL}/api/current-accounts/run-auto-deduction", json={"date": test_date})
        assert run1.status_code == 200
        
        # Get account state after first run
        get1 = requests.get(f"{BASE_URL}/api/current-accounts/{acc_id}")
        repayments1 = get1.json().get("repayments", [])
        pct_repayments1 = [r for r in repayments1 if r.get("reference", "").startswith("AUTO-PCT-")]
        
        # Run auto-deduction second time (same date)
        run2 = requests.post(f"{BASE_URL}/api/current-accounts/run-auto-deduction", json={"date": test_date})
        assert run2.status_code == 200
        
        # Get account state after second run
        get2 = requests.get(f"{BASE_URL}/api/current-accounts/{acc_id}")
        repayments2 = get2.json().get("repayments", [])
        pct_repayments2 = [r for r in repayments2 if r.get("reference", "").startswith("AUTO-PCT-")]
        
        # Should have same number of percentage repayments
        assert len(pct_repayments2) == len(pct_repayments1), \
            f"Idempotency failed: {len(pct_repayments1)} -> {len(pct_repayments2)} repayments"
        print(f"✓ Percentage mode is idempotent (reference=AUTO-PCT-{test_date})")
    
    # ==================== Fixed Mode - Period End Logic ====================
    
    def test_fixed_mode_daily_deducts_every_day(self):
        """Fixed mode daily: deducts every day (reference=AUTO-FIX-YYYY-MM-DD)"""
        payload = {
            "name": f"{self.test_prefix}_FIXED_DAILY",
            "total_advance": 100000,
            "repayment_fixed_amount": 1000,
            "repayment_fixed_period": "daily"
        }
        create_res = requests.post(f"{BASE_URL}/api/current-accounts", json=payload)
        acc_id = create_res.json().get("account", {}).get("id")
        
        # Run for a specific date
        test_date = "2026-04-25"
        run_res = requests.post(f"{BASE_URL}/api/current-accounts/run-auto-deduction", json={"date": test_date})
        assert run_res.status_code == 200
        
        # Check repayment created
        get_res = requests.get(f"{BASE_URL}/api/current-accounts/{acc_id}")
        repayments = get_res.json().get("repayments", [])
        fix_repayments = [r for r in repayments if r.get("reference") == f"AUTO-FIX-{test_date}"]
        
        assert len(fix_repayments) == 1, f"Expected 1 daily fixed repayment, got {len(fix_repayments)}"
        assert fix_repayments[0].get("amount") == 1000
        print(f"✓ Fixed mode daily creates repayment with reference AUTO-FIX-{test_date}")
    
    def test_fixed_mode_weekly_only_on_sunday(self):
        """Fixed mode weekly: only deducts on Sundays (weekday()=6)"""
        payload = {
            "name": f"{self.test_prefix}_FIXED_WEEKLY",
            "total_advance": 100000,
            "repayment_fixed_amount": 5000,
            "repayment_fixed_period": "weekly"
        }
        create_res = requests.post(f"{BASE_URL}/api/current-accounts", json=payload)
        acc_id = create_res.json().get("account", {}).get("id")
        
        # Run on Monday (2026-04-27 is Monday) - should NOT create repayment
        monday_date = "2026-04-27"
        run_mon = requests.post(f"{BASE_URL}/api/current-accounts/run-auto-deduction", json={"date": monday_date})
        assert run_mon.status_code == 200
        
        get_mon = requests.get(f"{BASE_URL}/api/current-accounts/{acc_id}")
        repayments_mon = get_mon.json().get("repayments", [])
        fix_repayments_mon = [r for r in repayments_mon if r.get("reference", "").startswith("AUTO-FIX-")]
        assert len(fix_repayments_mon) == 0, f"Monday should NOT create weekly repayment, got {len(fix_repayments_mon)}"
        
        # Run on Sunday (2026-04-26 is Sunday) - should create repayment
        sunday_date = "2026-04-26"
        run_sun = requests.post(f"{BASE_URL}/api/current-accounts/run-auto-deduction", json={"date": sunday_date})
        assert run_sun.status_code == 200
        
        get_sun = requests.get(f"{BASE_URL}/api/current-accounts/{acc_id}")
        repayments_sun = get_sun.json().get("repayments", [])
        fix_repayments_sun = [r for r in repayments_sun if r.get("reference", "").startswith("AUTO-FIX-")]
        
        assert len(fix_repayments_sun) == 1, f"Sunday should create weekly repayment, got {len(fix_repayments_sun)}"
        # Reference should be AUTO-FIX-YYYY-Wnn
        assert "AUTO-FIX-2026-W17" in fix_repayments_sun[0].get("reference", ""), \
            f"Expected reference AUTO-FIX-2026-W17, got {fix_repayments_sun[0].get('reference')}"
        print(f"✓ Fixed mode weekly only deducts on Sundays (reference=AUTO-FIX-YYYY-Wnn)")
    
    def test_fixed_mode_weekly_idempotent(self):
        """Fixed mode weekly: running twice on same Sunday does NOT duplicate"""
        payload = {
            "name": f"{self.test_prefix}_WEEKLY_IDEMP",
            "total_advance": 100000,
            "repayment_fixed_amount": 5000,
            "repayment_fixed_period": "weekly"
        }
        create_res = requests.post(f"{BASE_URL}/api/current-accounts", json=payload)
        acc_id = create_res.json().get("account", {}).get("id")
        
        sunday_date = "2026-04-26"
        
        # Run twice
        requests.post(f"{BASE_URL}/api/current-accounts/run-auto-deduction", json={"date": sunday_date})
        requests.post(f"{BASE_URL}/api/current-accounts/run-auto-deduction", json={"date": sunday_date})
        
        get_res = requests.get(f"{BASE_URL}/api/current-accounts/{acc_id}")
        repayments = get_res.json().get("repayments", [])
        fix_repayments = [r for r in repayments if r.get("reference", "").startswith("AUTO-FIX-2026-W17")]
        
        assert len(fix_repayments) == 1, f"Weekly idempotency failed: got {len(fix_repayments)} repayments"
        print(f"✓ Fixed mode weekly is idempotent per week")
    
    def test_fixed_mode_monthly_only_on_last_day(self):
        """Fixed mode monthly: only on last day of month (reference=AUTO-FIX-YYYY-MM)"""
        payload = {
            "name": f"{self.test_prefix}_FIXED_MONTHLY",
            "total_advance": 100000,
            "repayment_fixed_amount": 10000,
            "repayment_fixed_period": "monthly"
        }
        create_res = requests.post(f"{BASE_URL}/api/current-accounts", json=payload)
        acc_id = create_res.json().get("account", {}).get("id")
        
        # Run on April 29 (not last day) - should NOT create
        run_29 = requests.post(f"{BASE_URL}/api/current-accounts/run-auto-deduction", json={"date": "2026-04-29"})
        assert run_29.status_code == 200
        
        get_29 = requests.get(f"{BASE_URL}/api/current-accounts/{acc_id}")
        fix_29 = [r for r in get_29.json().get("repayments", []) if r.get("reference", "").startswith("AUTO-FIX-")]
        assert len(fix_29) == 0, "April 29 should NOT create monthly repayment"
        
        # Run on April 30 (last day of April) - should create
        run_30 = requests.post(f"{BASE_URL}/api/current-accounts/run-auto-deduction", json={"date": "2026-04-30"})
        assert run_30.status_code == 200
        
        get_30 = requests.get(f"{BASE_URL}/api/current-accounts/{acc_id}")
        fix_30 = [r for r in get_30.json().get("repayments", []) if r.get("reference", "").startswith("AUTO-FIX-")]
        
        assert len(fix_30) == 1, f"April 30 should create monthly repayment, got {len(fix_30)}"
        assert fix_30[0].get("reference") == "AUTO-FIX-2026-04"
        print(f"✓ Fixed mode monthly only deducts on last day of month")
    
    def test_fixed_mode_yearly_only_on_dec_31(self):
        """Fixed mode yearly: only on Dec 31 (reference=AUTO-FIX-YYYY)"""
        payload = {
            "name": f"{self.test_prefix}_FIXED_YEARLY",
            "total_advance": 1000000,
            "repayment_fixed_amount": 100000,
            "repayment_fixed_period": "yearly"
        }
        create_res = requests.post(f"{BASE_URL}/api/current-accounts", json=payload)
        acc_id = create_res.json().get("account", {}).get("id")
        
        # Run on Dec 30 - should NOT create
        run_30 = requests.post(f"{BASE_URL}/api/current-accounts/run-auto-deduction", json={"date": "2026-12-30"})
        assert run_30.status_code == 200
        
        get_30 = requests.get(f"{BASE_URL}/api/current-accounts/{acc_id}")
        fix_30 = [r for r in get_30.json().get("repayments", []) if r.get("reference", "").startswith("AUTO-FIX-")]
        assert len(fix_30) == 0, "Dec 30 should NOT create yearly repayment"
        
        # Run on Dec 31 - should create
        run_31 = requests.post(f"{BASE_URL}/api/current-accounts/run-auto-deduction", json={"date": "2026-12-31"})
        assert run_31.status_code == 200
        
        get_31 = requests.get(f"{BASE_URL}/api/current-accounts/{acc_id}")
        fix_31 = [r for r in get_31.json().get("repayments", []) if r.get("reference", "").startswith("AUTO-FIX-")]
        
        assert len(fix_31) == 1, f"Dec 31 should create yearly repayment, got {len(fix_31)}"
        assert fix_31[0].get("reference") == "AUTO-FIX-2026"
        print(f"✓ Fixed mode yearly only deducts on Dec 31")
    
    # ==================== Fixed Mode - Start Date ====================
    
    def test_fixed_mode_respects_start_date(self):
        """Fixed mode: no deduction until date >= repayment_fixed_start_date"""
        payload = {
            "name": f"{self.test_prefix}_FIXED_START",
            "total_advance": 100000,
            "repayment_fixed_amount": 1000,
            "repayment_fixed_period": "daily",
            "repayment_fixed_start_date": "2026-05-01"  # Start in May
        }
        create_res = requests.post(f"{BASE_URL}/api/current-accounts", json=payload)
        acc_id = create_res.json().get("account", {}).get("id")
        
        # Run on April 25 (before start date) - should NOT create
        run_apr = requests.post(f"{BASE_URL}/api/current-accounts/run-auto-deduction", json={"date": "2026-04-25"})
        assert run_apr.status_code == 200
        
        get_apr = requests.get(f"{BASE_URL}/api/current-accounts/{acc_id}")
        fix_apr = [r for r in get_apr.json().get("repayments", []) if r.get("reference", "").startswith("AUTO-FIX-")]
        assert len(fix_apr) == 0, "Before start_date should NOT create repayment"
        
        # Run on May 1 (on start date) - should create
        run_may = requests.post(f"{BASE_URL}/api/current-accounts/run-auto-deduction", json={"date": "2026-05-01"})
        assert run_may.status_code == 200
        
        get_may = requests.get(f"{BASE_URL}/api/current-accounts/{acc_id}")
        fix_may = [r for r in get_may.json().get("repayments", []) if r.get("reference", "").startswith("AUTO-FIX-")]
        
        assert len(fix_may) == 1, f"On start_date should create repayment, got {len(fix_may)}"
        print(f"✓ Fixed mode respects repayment_fixed_start_date")
    
    # ==================== Repayment Cap ====================
    
    def test_repayment_cap_never_exceeds_total_advance(self):
        """Total deductions can never exceed total_advance - already_repaid"""
        payload = {
            "name": f"{self.test_prefix}_CAP_TEST",
            "total_advance": 10000,  # Small amount
            "repayment_fixed_amount": 8000,  # Large fixed amount
            "repayment_fixed_period": "daily"
        }
        create_res = requests.post(f"{BASE_URL}/api/current-accounts", json=payload)
        acc_id = create_res.json().get("account", {}).get("id")
        
        # Run first day - should deduct 8000
        run1 = requests.post(f"{BASE_URL}/api/current-accounts/run-auto-deduction", json={"date": "2026-04-25"})
        assert run1.status_code == 200
        
        get1 = requests.get(f"{BASE_URL}/api/current-accounts/{acc_id}")
        total_repaid1 = get1.json().get("total_repaid", 0)
        assert total_repaid1 == 8000, f"First deduction should be 8000, got {total_repaid1}"
        
        # Run second day - should only deduct 2000 (cap: 10000 - 8000 = 2000)
        run2 = requests.post(f"{BASE_URL}/api/current-accounts/run-auto-deduction", json={"date": "2026-04-26"})
        assert run2.status_code == 200
        
        get2 = requests.get(f"{BASE_URL}/api/current-accounts/{acc_id}")
        total_repaid2 = get2.json().get("total_repaid", 0)
        assert total_repaid2 == 10000, f"Total should be capped at 10000, got {total_repaid2}"
        
        # Run third day - should deduct 0 (already fully repaid)
        run3 = requests.post(f"{BASE_URL}/api/current-accounts/run-auto-deduction", json={"date": "2026-04-27"})
        assert run3.status_code == 200
        
        get3 = requests.get(f"{BASE_URL}/api/current-accounts/{acc_id}")
        total_repaid3 = get3.json().get("total_repaid", 0)
        assert total_repaid3 == 10000, f"Should stay at 10000, got {total_repaid3}"
        
        print(f"✓ Repayment cap works: deductions never exceed total_advance")
    
    # ==================== Combined Modes ====================
    
    def test_all_three_modes_combined(self):
        """All 3 modes can run together on same account"""
        payload = {
            "name": f"{self.test_prefix}_COMBINED",
            "total_advance": 500000,
            "auto_deduct_enabled": True,
            "repayment_percentage": 10,
            "repayment_fixed_amount": 5000,
            "repayment_fixed_period": "daily",
            "schedule": [
                {"label": "Test", "due_date": "2026-04-25", "expected_amount": 10000}
            ]
        }
        create_res = requests.post(f"{BASE_URL}/api/current-accounts", json=payload)
        assert create_res.status_code == 200
        acc_id = create_res.json().get("account", {}).get("id")
        
        # Run auto-deduction
        run_res = requests.post(f"{BASE_URL}/api/current-accounts/run-auto-deduction", json={"date": "2026-04-25"})
        assert run_res.status_code == 200
        
        # Check repayments
        get_res = requests.get(f"{BASE_URL}/api/current-accounts/{acc_id}")
        repayments = get_res.json().get("repayments", [])
        
        # Should have at least fixed mode repayment (schedule and pct depend on revenue)
        fix_repayments = [r for r in repayments if r.get("reference", "").startswith("AUTO-FIX-")]
        assert len(fix_repayments) >= 1, "Fixed mode should create repayment"
        
        print(f"✓ All 3 modes can coexist and run together")
    
    # ==================== Manual Repayments Still Work ====================
    
    def test_manual_repayment_still_works(self):
        """Manual repayments can still be added alongside auto modes"""
        payload = {
            "name": f"{self.test_prefix}_MANUAL",
            "total_advance": 100000,
            "repayment_percentage": 10
        }
        create_res = requests.post(f"{BASE_URL}/api/current-accounts", json=payload)
        acc_id = create_res.json().get("account", {}).get("id")
        
        # Add manual repayment
        repay_res = requests.post(f"{BASE_URL}/api/current-accounts/{acc_id}/repayments", json={
            "repayment_date": "2026-04-25",
            "amount": 5000,
            "method": "cash",
            "reference": "MANUAL-001"
        })
        assert repay_res.status_code == 200
        
        # Verify
        get_res = requests.get(f"{BASE_URL}/api/current-accounts/{acc_id}")
        repayments = get_res.json().get("repayments", [])
        manual = [r for r in repayments if r.get("reference") == "MANUAL-001"]
        
        assert len(manual) == 1
        assert manual[0].get("amount") == 5000
        print(f"✓ Manual repayments still work alongside auto modes")


class TestInvalidPeriodValidation:
    """Test validation of repayment_fixed_period"""
    
    def test_invalid_period_rejected_on_create(self):
        """Invalid repayment_fixed_period should be ignored/nullified"""
        payload = {
            "name": f"TEST_INVALID_PERIOD_{uuid.uuid4().hex[:6]}",
            "total_advance": 100000,
            "repayment_fixed_amount": 5000,
            "repayment_fixed_period": "invalid_period"
        }
        res = requests.post(f"{BASE_URL}/api/current-accounts", json=payload)
        # Should succeed but period should be null
        assert res.status_code == 200
        acc = res.json().get("account", {})
        assert acc.get("repayment_fixed_period") is None, "Invalid period should be nullified"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/current-accounts/{acc.get('id')}")
        print(f"✓ Invalid period is nullified on create")
    
    def test_invalid_period_rejected_on_update(self):
        """Invalid repayment_fixed_period should be rejected on update"""
        # Create valid account
        payload = {
            "name": f"TEST_INVALID_UPDATE_{uuid.uuid4().hex[:6]}",
            "total_advance": 100000
        }
        create_res = requests.post(f"{BASE_URL}/api/current-accounts", json=payload)
        acc_id = create_res.json().get("account", {}).get("id")
        
        # Try to update with invalid period
        update_res = requests.put(f"{BASE_URL}/api/current-accounts/{acc_id}", json={
            "repayment_fixed_period": "invalid"
        })
        assert update_res.status_code == 400, f"Expected 400 for invalid period, got {update_res.status_code}"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/current-accounts/{acc_id}")
        print(f"✓ Invalid period rejected on update with 400")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
