"""
Espace Maxo - Services
"""
from .sms_service import (
    send_admin_sms_notification,
    send_client_sms_confirmation,
    send_otp_sms,
    verify_otp_sms,
    ADMIN_PHONE_NUMBERS
)
