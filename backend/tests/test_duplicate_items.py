"""Unit tests for fuzzy duplicate item matching in forecasts router."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import importlib.util
spec = importlib.util.spec_from_file_location(
    "forecasts_mod",
    os.path.join(os.path.dirname(__file__), '..', 'routers', 'forecasts.py')
)
forecasts_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(forecasts_mod)
_normalize_item_name = forecasts_mod._normalize_item_name
_items_match = forecasts_mod._items_match


def test_normalize_strips_accents_and_plurals():
    assert _normalize_item_name("Tomates") == "tomate"
    assert _normalize_item_name("Oignons") == "oignon"
    assert _normalize_item_name("Pâte de tomate") == "pate tomate"


def test_normalize_strips_stopwords():
    assert _normalize_item_name("Location nappe") == "nappe"
    assert _normalize_item_name("Achat de bouteille") == "bouteille"


def test_match_plural_forms():
    assert _items_match(_normalize_item_name("Tomate"), _normalize_item_name("Tomates"))
    assert _items_match(_normalize_item_name("Oignon"), _normalize_item_name("Oignons"))


def test_match_location_prefix():
    assert _items_match(_normalize_item_name("Nappe"), _normalize_item_name("Location nappe"))
    assert _items_match(_normalize_item_name("Location nappe"), _normalize_item_name("Nappes jetables"))


def test_match_accents():
    assert _items_match(_normalize_item_name("Poulet rôti"), _normalize_item_name("poulet roti"))


def test_no_false_positive_boeuf_oeuf():
    # 'oeuf' should NOT match 'abats de boeuf'
    assert not _items_match(_normalize_item_name("Oeuf"), _normalize_item_name("Abats de boeuf"))


def test_no_false_positive_table_jetables():
    # 'table' should NOT match 'nappes jetables'
    assert not _items_match(_normalize_item_name("Table"), _normalize_item_name("Nappes jetables"))


def test_no_false_positive_unrelated():
    assert not _items_match(_normalize_item_name("Poisson"), _normalize_item_name("Poulet"))
    assert not _items_match(_normalize_item_name("Riz"), _normalize_item_name("Huile"))


def test_empty_strings():
    assert not _items_match("", "nappe")
    assert not _items_match("nappe", "")
    assert not _items_match("", "")


def test_intra_list_duplicate_detection():
    """Simulate the intra-list grouping logic as used in expenses_analysis."""
    items = [
        {"name": "Tomate", "quantity": 2, "unit_price": 1000, "amount": 2000},
        {"name": "Oignon", "quantity": 1, "unit_price": 500, "amount": 500},
        {"name": "Tomates", "quantity": 3, "unit_price": 1200, "amount": 3600},
        {"name": "Nappe", "quantity": 5, "unit_price": 500, "amount": 2500},
        {"name": "Location nappe", "quantity": 8, "unit_price": 500, "amount": 4000},
        {"name": "Poulet", "quantity": 2, "unit_price": 2500, "amount": 5000},
    ]
    cur_items_norm = [
        {"index": i, "raw": it["name"], "norm": _normalize_item_name(it["name"]),
         "quantity": it["quantity"], "unit_price": it["unit_price"], "amount": it["amount"]}
        for i, it in enumerate(items) if _normalize_item_name(it["name"])
    ]
    intra = []
    seen = set()
    for i in range(len(cur_items_norm)):
        if cur_items_norm[i]["index"] in seen:
            continue
        group = [cur_items_norm[i]]
        for j in range(i + 1, len(cur_items_norm)):
            if cur_items_norm[j]["index"] in seen:
                continue
            if _items_match(cur_items_norm[i]["norm"], cur_items_norm[j]["norm"]):
                group.append(cur_items_norm[j])
                seen.add(cur_items_norm[j]["index"])
        if len(group) >= 2:
            seen.add(cur_items_norm[i]["index"])
            intra.append([g["raw"] for g in group])

    # Expected: Tomate/Tomates grouped, Nappe/Location nappe grouped
    assert len(intra) == 2
    groups_flat = {tuple(sorted(g)) for g in intra}
    assert ("Tomate", "Tomates") in groups_flat
    assert ("Location nappe", "Nappe") in groups_flat
    # Oignon and Poulet should NOT be in any group (alone)
    all_items = [x for g in intra for x in g]
    assert "Oignon" not in all_items
    assert "Poulet" not in all_items
