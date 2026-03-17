"""
Caisse Pro - API Routers
"""
from .invoices import router as invoices_router
from .users import router as users_router
from .products import router as products_router
from .clients import router as clients_router
from .tables import router as tables_router
from .requests import router as requests_router
from .service_reports import router as service_reports_router

__all__ = [
    'invoices_router',
    'users_router', 
    'products_router',
    'clients_router',
    'tables_router',
    'requests_router',
    'service_reports_router'
]
