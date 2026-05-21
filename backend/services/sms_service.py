"""
Espace Maxo - SMS Services
Twilio SMS + WhatsApp integration for admin notifications.

Channels preference:
  1) WhatsApp (whatsapp:+14155238886 sandbox by default). Reliable for Benin.
  2) SMS fallback if WhatsApp fails (e.g. recipient not joined sandbox yet, error 63015).

For each admin number to receive WhatsApp:
  - Admin must open WhatsApp on their phone
  - Send message "join <sandbox-code>" to +1 415 523 8886
  - Sandbox code is visible in Twilio Console → Messaging → Try it out → Send a WhatsApp message
"""
import os
import logging
from twilio.rest import Client as TwilioClient
from twilio.base.exceptions import TwilioRestException

logger = logging.getLogger(__name__)

# Admin phone numbers for notifications (Benin format +229)
ADMIN_PHONE_NUMBERS = ["+22997720808", "+22966269565", "+22941530000"]

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


def _whatsapp_from() -> str:
    # Twilio sandbox by default
    return os.environ.get('TWILIO_WHATSAPP_FROM', 'whatsapp:+14155238886')


def _whatsapp_enabled() -> bool:
    return os.environ.get('USE_WHATSAPP_CHANNEL', 'true').lower() == 'true'


def _clean_sms_message(message: str) -> str:
    return (message
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


async def _send_whatsapp_to(client: TwilioClient, admin_phone: str, message: str) -> bool:
    """Try sending WhatsApp. Returns True on success, False if the recipient
    hasn't joined sandbox (error 63015) or any other delivery failure.

    Strategy: create the message, then poll status briefly. Sandbox failures
    surface as status='failed' with error_code=63015 a few ms after queuing.
    """
    import asyncio
    try:
        wa_from = _whatsapp_from()
        to_wa = f"whatsapp:{admin_phone}"
        resp = client.messages.create(body=message[:1600], to=to_wa, from_=wa_from)
        sid = resp.sid
        # Short poll to catch sandbox rejection quickly
        for _ in range(4):
            await asyncio.sleep(0.6)
            m = client.messages(sid).fetch()
            if m.status in ("failed", "undelivered"):
                logger.warning(f"WhatsApp delivery failed for {to_wa} (code {m.error_code}): {m.error_message}")
                return False
            if m.status in ("delivered", "read", "sent"):
                logger.info(f"WhatsApp delivered to {to_wa}, SID: {sid}, Status: {m.status}")
                return True
        # Still queued / accepted — assume in-flight success
        logger.info(f"WhatsApp accepted for {to_wa}, SID: {sid} (status still {m.status})")
        return True
    except TwilioRestException as e:
        logger.warning(f"WhatsApp send failed for {admin_phone} (code {e.code}): {e.msg}")
        return False
    except Exception as e:
        logger.warning(f"WhatsApp send error for {admin_phone}: {e}")
        return False


async def _send_sms_to(client: TwilioClient, admin_phone: str, message: str) -> bool:
    """Try sending SMS. Returns True on success."""
    from_num = _twilio_from_number()
    if not from_num:
        logger.error("Twilio phone number not configured for SMS")
        return False
    try:
        clean = _clean_sms_message(message)
        resp = client.messages.create(body=clean[:1600], to=admin_phone, from_=from_num)
        logger.info(f"SMS notification sent to {admin_phone}, SID: {resp.sid}")
        return True
    except Exception as e:
        logger.error(f"SMS send error for {admin_phone}: {e}")
        return False


def _notifications_enabled() -> bool:
    """Kill-switch global : si TWILIO_NOTIFICATIONS_ENABLED n'est pas
    explicitement à true/1/yes, toutes les notifications Twilio (admin et client)
    sont silencieusement ignorées.
    """
    return os.environ.get('TWILIO_NOTIFICATIONS_ENABLED', '').lower() in ('1', 'true', 'yes')


async def send_admin_sms_notification(message: str) -> bool:
    """Send admin notification via WhatsApp (preferred) with SMS fallback.

    Function name kept for backward compatibility — now dual-channel.
    Désactivé tant que TWILIO_NOTIFICATIONS_ENABLED n'est pas activé.
    """
    if not _notifications_enabled():
        logger.debug("Twilio notifications disabled (admin) — skipping")
        return False

    client = _get_twilio_client()
    if not client:
        logger.warning("Twilio not configured, skipping notification")
        return False

    use_wa = _whatsapp_enabled()
    success_count = 0
    for admin_phone in ADMIN_PHONE_NUMBERS:
        delivered = False
        if use_wa:
            delivered = await _send_whatsapp_to(client, admin_phone, message)
            if not delivered:
                logger.info(f"WhatsApp failed for {admin_phone} → fallback SMS")
                delivered = await _send_sms_to(client, admin_phone, message)
        else:
            delivered = await _send_sms_to(client, admin_phone, message)

        if delivered:
            success_count += 1

    return success_count > 0


async def send_client_sms_confirmation(phone: str, message: str) -> bool:
    """Send SMS confirmation to client via Twilio.
    Désactivé tant que TWILIO_NOTIFICATIONS_ENABLED n'est pas activé.
    """
    if not _notifications_enabled():
        logger.debug(f"Twilio notifications disabled (client {phone}) — skipping")
        return False

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
