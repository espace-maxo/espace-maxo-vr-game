"""
Test Coach Players (Iteration 94) - Suivi consommation par joueur côté Coach Jeux.

Tests:
- POST /api/coach/players - Create player (coach_jeux only)
- GET /api/coach/players - List players (filtered by coach)
- POST /api/coach/players/{id}/consume - Add consumption (parties/hourly modes)
- DELETE /api/coach/players/{id}/consume/{idx} - Remove consumption
- DELETE /api/coach/players/{id} - Delete player
- POST /api/coach/players/transmit - Transmit players to jeux_bons
- GET /api/caisse/tables - Admin/manager sees ALL tables
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test data prefix for cleanup
TEST_PREFIX = "TEST_ITER94_"


class TestCoachPlayersCreate:
    """POST /api/coach/players - Create player"""

    def test_create_player_success(self):
        """Coach jeux can create a player"""
        response = requests.post(f"{BASE_URL}/api/coach/players", json={
            "player_name": f"{TEST_PREFIX}Jean",
            "coach_name": "coach",
            "coach_role": "coach_jeux",
            "table_number": 4,
            "notes": "Test player"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") is True
        assert "player" in data
        player = data["player"]
        assert player["player_name"] == f"{TEST_PREFIX}Jean"
        assert player["status"] == "open"
        assert player["items"] == []
        assert player["total"] == 0
        assert player["table_number"] == 4
        assert "id" in player
        # Verify no _id exposed
        assert "_id" not in player
        print(f"✓ Created player: {player['id']}")

    def test_create_player_empty_name_400(self):
        """Empty player_name returns 400"""
        response = requests.post(f"{BASE_URL}/api/coach/players", json={
            "player_name": "   ",
            "coach_name": "coach",
            "coach_role": "coach_jeux"
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Empty player_name returns 400")

    def test_create_player_server_role_403(self):
        """Server role cannot create player (403)"""
        response = requests.post(f"{BASE_URL}/api/coach/players", json={
            "player_name": f"{TEST_PREFIX}Forbidden",
            "coach_name": "server1",
            "coach_role": "server"
        })
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✓ Server role returns 403")


class TestCoachPlayersGet:
    """GET /api/coach/players - List players"""

    def test_list_players_coach_jeux(self):
        """Coach jeux sees their own open players"""
        # First create a player
        create_resp = requests.post(f"{BASE_URL}/api/coach/players", json={
            "player_name": f"{TEST_PREFIX}ListTest",
            "coach_name": "coach_test_list",
            "coach_role": "coach_jeux"
        })
        assert create_resp.status_code == 200

        # List players
        response = requests.get(f"{BASE_URL}/api/coach/players", params={
            "actor_role": "coach_jeux",
            "actor_name": "coach_test_list",
            "status": "open"
        })
        assert response.status_code == 200
        data = response.json()
        assert "players" in data
        assert "total" in data
        # Should find our created player
        found = any(p["player_name"] == f"{TEST_PREFIX}ListTest" for p in data["players"])
        assert found, "Created player not found in list"
        # Verify no _id exposed
        for p in data["players"]:
            assert "_id" not in p
        print(f"✓ Listed {data['total']} players")

    def test_list_players_forbidden_role(self):
        """Non-coach role returns 403"""
        response = requests.get(f"{BASE_URL}/api/coach/players", params={
            "actor_role": "server",
            "actor_name": "server1",
            "status": "open"
        })
        assert response.status_code == 403
        print("✓ Server role returns 403 on list")


class TestCoachPlayersConsume:
    """POST /api/coach/players/{id}/consume - Add consumption"""

    @pytest.fixture
    def player_id(self):
        """Create a player for consumption tests"""
        resp = requests.post(f"{BASE_URL}/api/coach/players", json={
            "player_name": f"{TEST_PREFIX}ConsumeTest",
            "coach_name": "coach",
            "coach_role": "coach_jeux"
        })
        assert resp.status_code == 200
        return resp.json()["player"]["id"]

    def test_consume_parties_mode(self, player_id):
        """Add consumption in parties mode"""
        response = requests.post(f"{BASE_URL}/api/coach/players/{player_id}/consume", json={
            "jeu_product_id": "vr360",
            "jeu_name": "VR 360°",
            "billing_mode": "parties",
            "parties": 3,
            "unit_price": 2000,
            "actor_name": "coach",
            "actor_role": "coach_jeux"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") is True
        assert data["new_total"] == 6000  # 3 * 2000
        assert data["item"]["billing_mode"] == "parties"
        assert data["item"]["parties"] == 3
        assert data["item"]["total"] == 6000
        print(f"✓ Added parties consumption, new_total={data['new_total']}")

    def test_consume_hourly_mode(self, player_id):
        """Add consumption in hourly mode"""
        response = requests.post(f"{BASE_URL}/api/coach/players/{player_id}/consume", json={
            "jeu_product_id": "simulateur",
            "jeu_name": "Simulateur Course",
            "billing_mode": "hourly",
            "hours": 2,
            "hourly_rate": 12000,
            "actor_name": "coach",
            "actor_role": "coach_jeux"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") is True
        assert data["new_total"] == 24000  # 2 * 12000
        assert data["item"]["billing_mode"] == "hourly"
        assert data["item"]["hours"] == 2
        assert data["item"]["hourly_rate"] == 12000
        assert data["item"]["total"] == 24000
        print(f"✓ Added hourly consumption, new_total={data['new_total']}")

    def test_consume_parties_invalid_400(self, player_id):
        """parties < 1 returns 400"""
        response = requests.post(f"{BASE_URL}/api/coach/players/{player_id}/consume", json={
            "jeu_product_id": "vr360",
            "jeu_name": "VR 360°",
            "billing_mode": "parties",
            "parties": 0,
            "unit_price": 2000,
            "actor_name": "coach",
            "actor_role": "coach_jeux"
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ parties=0 returns 400")

    def test_consume_hours_invalid_400(self, player_id):
        """hours <= 0 in hourly mode returns 400"""
        response = requests.post(f"{BASE_URL}/api/coach/players/{player_id}/consume", json={
            "jeu_product_id": "vr360",
            "jeu_name": "VR 360°",
            "billing_mode": "hourly",
            "hours": 0,
            "hourly_rate": 12000,
            "actor_name": "coach",
            "actor_role": "coach_jeux"
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ hours=0 in hourly mode returns 400")

    def test_consume_on_transmitted_player_400(self):
        """Cannot add consumption to transmitted player"""
        # Create and transmit a player
        create_resp = requests.post(f"{BASE_URL}/api/coach/players", json={
            "player_name": f"{TEST_PREFIX}TransmittedConsume",
            "coach_name": "coach",
            "coach_role": "coach_jeux"
        })
        player_id = create_resp.json()["player"]["id"]
        
        # Add a consumption first
        requests.post(f"{BASE_URL}/api/coach/players/{player_id}/consume", json={
            "jeu_product_id": "vr360",
            "jeu_name": "VR 360°",
            "billing_mode": "parties",
            "parties": 1,
            "unit_price": 2000,
            "actor_name": "coach",
            "actor_role": "coach_jeux"
        })
        
        # Transmit
        transmit_resp = requests.post(f"{BASE_URL}/api/coach/players/transmit", json={
            "player_ids": [player_id],
            "actor_name": "coach",
            "actor_role": "coach_jeux"
        })
        assert transmit_resp.status_code == 200
        
        # Try to add consumption to transmitted player
        response = requests.post(f"{BASE_URL}/api/coach/players/{player_id}/consume", json={
            "jeu_product_id": "vr360",
            "jeu_name": "VR 360°",
            "billing_mode": "parties",
            "parties": 1,
            "unit_price": 2000,
            "actor_name": "coach",
            "actor_role": "coach_jeux"
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Cannot add consumption to transmitted player (400)")


class TestCoachPlayersRemoveConsumption:
    """DELETE /api/coach/players/{id}/consume/{idx} - Remove consumption"""

    def test_remove_consumption_success(self):
        """Remove consumption recalculates total"""
        # Create player
        create_resp = requests.post(f"{BASE_URL}/api/coach/players", json={
            "player_name": f"{TEST_PREFIX}RemoveConsume",
            "coach_name": "coach",
            "coach_role": "coach_jeux"
        })
        player_id = create_resp.json()["player"]["id"]
        
        # Add two consumptions
        requests.post(f"{BASE_URL}/api/coach/players/{player_id}/consume", json={
            "jeu_product_id": "vr360",
            "jeu_name": "VR 360°",
            "billing_mode": "parties",
            "parties": 2,
            "unit_price": 2000,
            "actor_name": "coach",
            "actor_role": "coach_jeux"
        })
        requests.post(f"{BASE_URL}/api/coach/players/{player_id}/consume", json={
            "jeu_product_id": "simulateur",
            "jeu_name": "Simulateur",
            "billing_mode": "parties",
            "parties": 1,
            "unit_price": 1500,
            "actor_name": "coach",
            "actor_role": "coach_jeux"
        })
        
        # Remove first item (index 0)
        response = requests.delete(
            f"{BASE_URL}/api/coach/players/{player_id}/consume/0",
            params={"actor_role": "coach_jeux"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") is True
        # After removing 4000F item, only 1500F remains
        assert data["new_total"] == 1500
        print(f"✓ Removed consumption, new_total={data['new_total']}")


class TestCoachPlayersDelete:
    """DELETE /api/coach/players/{id} - Delete player"""

    def test_delete_player_success(self):
        """Delete open player"""
        # Create player
        create_resp = requests.post(f"{BASE_URL}/api/coach/players", json={
            "player_name": f"{TEST_PREFIX}DeleteMe",
            "coach_name": "coach",
            "coach_role": "coach_jeux"
        })
        player_id = create_resp.json()["player"]["id"]
        
        # Delete
        response = requests.delete(
            f"{BASE_URL}/api/coach/players/{player_id}",
            params={"actor_role": "coach_jeux"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.json().get("success") is True
        print("✓ Deleted player successfully")


class TestCoachPlayersTransmit:
    """POST /api/coach/players/transmit - Transmit players to jeux_bons"""

    def test_transmit_single_player(self):
        """Transmit single player creates jeux_bons"""
        # Create player with consumption
        create_resp = requests.post(f"{BASE_URL}/api/coach/players", json={
            "player_name": f"{TEST_PREFIX}TransmitSingle",
            "coach_name": "coach",
            "coach_role": "coach_jeux"
        })
        player_id = create_resp.json()["player"]["id"]
        
        # Add consumption
        requests.post(f"{BASE_URL}/api/coach/players/{player_id}/consume", json={
            "jeu_product_id": "vr360",
            "jeu_name": "VR 360°",
            "billing_mode": "parties",
            "parties": 2,
            "unit_price": 2000,
            "notes": "Test note",
            "actor_name": "coach",
            "actor_role": "coach_jeux"
        })
        
        # Transmit
        response = requests.post(f"{BASE_URL}/api/coach/players/transmit", json={
            "player_ids": [player_id],
            "actor_name": "coach",
            "actor_role": "coach_jeux"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") is True
        assert "bon_id" in data
        assert data["transmitted_count"] == 1
        assert data["total"] == 4000  # 2 * 2000
        print(f"✓ Transmitted player, bon_id={data['bon_id']}, total={data['total']}")

    def test_transmit_multiple_players(self):
        """Transmit multiple players creates single jeux_bons with prefixed notes"""
        # Create two players
        player_ids = []
        for name in ["Alice", "Bob"]:
            create_resp = requests.post(f"{BASE_URL}/api/coach/players", json={
                "player_name": f"{TEST_PREFIX}{name}",
                "coach_name": "coach",
                "coach_role": "coach_jeux"
            })
            pid = create_resp.json()["player"]["id"]
            player_ids.append(pid)
            
            # Add consumption
            requests.post(f"{BASE_URL}/api/coach/players/{pid}/consume", json={
                "jeu_product_id": "vr360",
                "jeu_name": "VR 360°",
                "billing_mode": "parties",
                "parties": 1,
                "unit_price": 2000,
                "actor_name": "coach",
                "actor_role": "coach_jeux"
            })
        
        # Transmit both
        response = requests.post(f"{BASE_URL}/api/coach/players/transmit", json={
            "player_ids": player_ids,
            "actor_name": "coach",
            "actor_role": "coach_jeux"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") is True
        assert data["transmitted_count"] == 2
        assert data["total"] == 4000  # 2 * 2000
        print(f"✓ Transmitted 2 players, total={data['total']}")

    def test_transmit_empty_player_ids_400(self):
        """Empty player_ids returns 400"""
        response = requests.post(f"{BASE_URL}/api/coach/players/transmit", json={
            "player_ids": [],
            "actor_name": "coach",
            "actor_role": "coach_jeux"
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Empty player_ids returns 400")

    def test_transmit_nonexistent_player_404(self):
        """Non-existent player returns 404"""
        response = requests.post(f"{BASE_URL}/api/coach/players/transmit", json={
            "player_ids": ["nonexistent-id-12345"],
            "actor_name": "coach",
            "actor_role": "coach_jeux"
        })
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Non-existent player returns 404")


class TestCaisseTablesActorRole:
    """GET /api/caisse/tables - Admin/manager sees ALL tables"""

    def test_tables_admin_sees_all(self):
        """Admin with actor_role=admin sees all tables (ignores server_id)"""
        response = requests.get(f"{BASE_URL}/api/caisse/tables", params={
            "actor_role": "admin"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "tables" in data
        # Verify no _id exposed
        for t in data.get("tables", []):
            assert "_id" not in t
        print(f"✓ Admin sees {len(data['tables'])} tables (all)")

    def test_tables_manager_sees_all(self):
        """Manager with actor_role=manager sees all tables"""
        response = requests.get(f"{BASE_URL}/api/caisse/tables", params={
            "actor_role": "manager"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "tables" in data
        print(f"✓ Manager sees {len(data['tables'])} tables (all)")

    def test_tables_server_id_filter(self):
        """Without actor_role, server_id filter works (backward compat)"""
        response = requests.get(f"{BASE_URL}/api/caisse/tables", params={
            "server_id": "some-server-id"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "tables" in data
        print(f"✓ Server filter returns {len(data['tables'])} tables")


class TestCleanup:
    """Cleanup test data"""

    def test_cleanup_test_players(self):
        """Remove TEST_ prefixed players"""
        # List all players (as admin)
        response = requests.get(f"{BASE_URL}/api/coach/players", params={
            "actor_role": "admin",
            "actor_name": "admin",
            "status": "open"
        })
        if response.status_code == 200:
            players = response.json().get("players", [])
            deleted = 0
            for p in players:
                if p.get("player_name", "").startswith(TEST_PREFIX):
                    del_resp = requests.delete(
                        f"{BASE_URL}/api/coach/players/{p['id']}",
                        params={"actor_role": "admin"}
                    )
                    if del_resp.status_code == 200:
                        deleted += 1
            print(f"✓ Cleaned up {deleted} test players")
        else:
            print("✓ Cleanup skipped (no players to clean)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
