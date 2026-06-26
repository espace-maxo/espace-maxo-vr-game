"""
Iter 117 — Test des endpoints d'édition de packs Promo Vacances par l'Admin.
Vérifie : GET (is_customized), PUT (partiel + non-écrasement), DELETE (reset), 404 sur pack inconnu.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://caisse-mon-point.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    yield s
    # Cleanup global — au cas où
    for pid in ("pack_game_fresh", "pack_solo_fun", "pack_duo_snack_vr",
                "pack_fun_maxo_vacances", "promo_vacances_25"):
        try:
            s.delete(f"{API}/promo-vacances/pack/{pid}", timeout=10)
        except Exception:
            pass


def _get_pack(http, pid):
    r = http.get(f"{API}/promo-vacances", timeout=15)
    assert r.status_code == 200
    packs = r.json().get("packs", [])
    return next((p for p in packs if p["id"] == pid), None)


def test_get_promo_vacances_returns_is_customized_false_default(http):
    # Ensure clean state first
    http.delete(f"{API}/promo-vacances/pack/pack_game_fresh", timeout=10)
    r = http.get(f"{API}/promo-vacances", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "packs" in data
    assert isinstance(data["packs"], list)
    assert len(data["packs"]) >= 5
    for p in data["packs"]:
        assert "is_customized" in p, f"is_customized manquant sur {p.get('id')}"
        assert isinstance(p["is_customized"], bool)
    pack = _get_pack(http, "pack_game_fresh")
    assert pack is not None
    assert pack["is_customized"] is False
    assert pack["title"] == "Pack Game Fresh Maxo"


def test_put_partial_does_not_overwrite_other_fields(http):
    pid = "pack_game_fresh"
    # Save default for restoration
    before = _get_pack(http, pid)
    assert before is not None
    original_subtitle = before["subtitle"]
    original_image = before["image"]

    # PUT partial — only title + price
    payload = {"title": "TEST_iter117 Pack Game Fresh", "price": 2500, "actor_name": "TEST_iter117"}
    r = http.put(f"{API}/promo-vacances/pack/{pid}", json=payload, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body.get("success") is True
    assert body.get("pack_id") == pid

    # GET → champs modifiés + is_customized=true + autres champs intacts
    after = _get_pack(http, pid)
    assert after["title"] == "TEST_iter117 Pack Game Fresh"
    assert after["price"] == 2500
    assert after["is_customized"] is True
    # Champs non fournis : préservés depuis les défauts (merge)
    assert after["subtitle"] == original_subtitle
    assert after["image"] == original_image


def test_delete_resets_to_defaults(http):
    pid = "pack_game_fresh"
    # Ensure customized first
    http.put(f"{API}/promo-vacances/pack/{pid}",
             json={"title": "TEST_iter117 X", "price": 9999, "actor_name": "TEST"}, timeout=15)
    after_put = _get_pack(http, pid)
    assert after_put["is_customized"] is True

    # DELETE
    r = http.delete(f"{API}/promo-vacances/pack/{pid}", timeout=15)
    assert r.status_code == 200
    assert r.json().get("success") is True

    # GET → défauts restaurés + is_customized=false
    restored = _get_pack(http, pid)
    assert restored["is_customized"] is False
    assert restored["title"] == "Pack Game Fresh Maxo"
    assert restored["price"] == 2000


def test_put_unknown_pack_returns_404(http):
    r = http.put(f"{API}/promo-vacances/pack/pack_unknown_xyz",
                 json={"title": "Nope"}, timeout=15)
    assert r.status_code == 404
    detail = r.json().get("detail", "")
    assert "inconnu" in detail.lower() or "unknown" in detail.lower()


def test_put_all_fields_then_reset(http):
    pid = "pack_solo_fun"
    full_payload = {
        "title": "TEST_iter117 Solo Fun Updated",
        "subtitle": "TEST sub",
        "highlight": "9 999 FCFA",
        "description": "TEST desc",
        "price": 9999,
        "old_price": 12000,
        "regular_promo_price": 10500,
        "image": "https://example.com/test.jpg",
        "limit_100_first": False,
        "included_games": 2,
        "included_players": 3,
        "cta_label": "TEST CTA",
        "actor_name": "TEST_iter117",
    }
    r = http.put(f"{API}/promo-vacances/pack/{pid}", json=full_payload, timeout=15)
    assert r.status_code == 200

    after = _get_pack(http, pid)
    for k, v in full_payload.items():
        if k == "actor_name":
            continue
        assert after[k] == v, f"Mismatch on {k}: expected {v}, got {after[k]}"
    assert after["is_customized"] is True

    # Cleanup
    http.delete(f"{API}/promo-vacances/pack/{pid}", timeout=15)
    restored = _get_pack(http, pid)
    assert restored["is_customized"] is False
    assert restored["title"] == "Pack Solo Fun Maxo"
