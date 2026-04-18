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
