"""
Espace Maxo - SMS Services
Twilio SMS integration for notifications and OTP
"""
import os
import logging
from twilio.rest import Client as TwilioClient

logger = logging.getLogger(__name__)

# Admin phone numbers for notifications
ADMIN_PHONE_NUMBERS = ["+22997720808", "+22991005084"]

_twilio_client = None


def _get_twilio_client():
    """Lazy Twilio client — reads env at call time so .env loaded after module import still works."""
    global _twilio_client
    if _twilio_client is not None:
        return _twilio_client
    sid = os.environ.get('TWILIO_ACCOUNT_SID', '')
    token = os.environ.get('TWILIO_AUTH_TOKEN', '')
    if sid and token:
        _twilio_client = TwilioClient(sid, token)
    return _twilio_client


def _twilio_from_number() -> str:
    return os.environ.get('TWILIO_PHONE_NUMBER', '')


async def send_admin_sms_notification(message: str) -> bool:
    """Send SMS notification to admin phone numbers via Twilio"""
    client = _get_twilio_client()
    if not client:
        logger.warning("Twilio not configured, skipping SMS notification")
        return False

    from_num = _twilio_from_number()
    if not from_num:
        logger.error("Twilio phone number not configured")
        return False

    success_count = 0
    for admin_phone in ADMIN_PHONE_NUMBERS:
        try:
            # Clean the message for SMS
            clean_message = (message
                .replace("*", "")
                .replace("👤", "")
                .replace("⭐", "*")
                .replace("💬", "")
                .replace("👉", "->")
                .replace("🆕", "[NOUVEAU]")
                .replace("🎮", "[JEUX]")
                .replace("📅", "")
                .replace("⏰", "")
                .replace("👥", "")
                .replace("💰", "")
                .replace("📱", "Tel:")
                .replace("📍", "")
                .replace("🏠", "[LOCATION]")
                .replace("📝", "")
            )

            message_response = client.messages.create(
                body=clean_message[:1600],
                to=admin_phone,
                from_=from_num
            )
            logger.info(f"SMS notification sent to {admin_phone}, SID: {message_response.sid}")
            success_count += 1
        except Exception as e:
            logger.error(f"Error sending SMS to {admin_phone}: {e}")

    return success_count > 0


async def send_client_sms_confirmation(phone: str, message: str) -> bool:
    """Send SMS confirmation to client via Twilio"""
    client = _get_twilio_client()
    if not client:
        logger.warning("Twilio not configured, skipping client SMS")
        return False

    from_num = _twilio_from_number()
    if not from_num:
        logger.error("Twilio phone number not configured")
        return False

    clean_phone = phone.replace(" ", "").replace("+229", "")
    formatted_phone = f"+229{clean_phone}"

    try:
        clean_message = (message
            .replace("✅", "[OK]")
            .replace("🎮", "")
            .replace("📅", "")
            .replace("⏰", "")
            .replace("👥", "")
            .replace("💰", "")
            .replace("📍", "")
            .replace("🎯", "")
        )

        msg_response = client.messages.create(
            body=clean_message[:1600],
            to=formatted_phone,
            from_=from_num
        )
        logger.info(f"Client SMS sent to {formatted_phone}, SID: {msg_response.sid}")
        return True
    except Exception as e:
        logger.error(f"Error sending SMS to client {formatted_phone}: {e}")
        return False


def send_otp_sms(phone: str) -> dict:
    """Send OTP via Twilio Verify"""
    client = _get_twilio_client()
    service_sid = os.environ.get('TWILIO_VERIFY_SERVICE_SID', '')
    if not client or not service_sid:
        raise Exception("Twilio Verify not configured")

    clean_phone = phone.replace(" ", "").replace("+229", "")
    formatted_phone = f"+229{clean_phone}" if not clean_phone.startswith("+") else clean_phone

    verification = client.verify.v2.services(service_sid) \
        .verifications.create(to=formatted_phone, channel="sms")

    return {"status": verification.status, "phone": clean_phone}


def verify_otp_sms(phone: str, code: str) -> bool:
    """Verify OTP via Twilio Verify"""
    client = _get_twilio_client()
    service_sid = os.environ.get('TWILIO_VERIFY_SERVICE_SID', '')
    if not client or not service_sid:
        raise Exception("Twilio Verify not configured")

    clean_phone = phone.replace(" ", "").replace("+229", "")
    formatted_phone = f"+229{clean_phone}" if not clean_phone.startswith("+") else clean_phone

    verification_check = client.verify.v2.services(service_sid) \
        .verification_checks.create(to=formatted_phone, code=code)

    return verification_check.status == "approved"
