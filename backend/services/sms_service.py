"""
Espace Maxo - SMS Services
Twilio SMS integration for notifications and OTP
"""
import os
import logging
from twilio.rest import Client as TwilioClient

logger = logging.getLogger(__name__)

# Twilio configuration
TWILIO_ACCOUNT_SID = os.environ.get('TWILIO_ACCOUNT_SID', '')
TWILIO_AUTH_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN', '')
TWILIO_VERIFY_SERVICE_SID = os.environ.get('TWILIO_VERIFY_SERVICE_SID', '')
TWILIO_PHONE_NUMBER = os.environ.get('TWILIO_PHONE_NUMBER', '')

# Admin phone numbers for notifications
ADMIN_PHONE_NUMBERS = ["+22997720808", "+22991005084"]

# Initialize Twilio client
twilio_client = None
if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
    twilio_client = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)


async def send_admin_sms_notification(message: str) -> bool:
    """Send SMS notification to admin phone numbers via Twilio"""
    if not twilio_client:
        logger.warning("Twilio not configured, skipping SMS notification")
        return False
    
    if not TWILIO_PHONE_NUMBER:
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
            
            message_response = twilio_client.messages.create(
                body=clean_message[:1600],
                to=admin_phone,
                from_=TWILIO_PHONE_NUMBER
            )
            logger.info(f"SMS notification sent to {admin_phone}, SID: {message_response.sid}")
            success_count += 1
        except Exception as e:
            logger.error(f"Error sending SMS to {admin_phone}: {e}")
    
    return success_count > 0


async def send_client_sms_confirmation(phone: str, message: str) -> bool:
    """Send SMS confirmation to client via Twilio"""
    if not twilio_client:
        logger.warning("Twilio not configured, skipping client SMS")
        return False
    
    if not TWILIO_PHONE_NUMBER:
        logger.error("Twilio phone number not configured")
        return False
    
    # Format phone number for Benin
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
        
        msg_response = twilio_client.messages.create(
            body=clean_message[:1600],
            to=formatted_phone,
            from_=TWILIO_PHONE_NUMBER
        )
        logger.info(f"Client SMS sent to {formatted_phone}, SID: {msg_response.sid}")
        return True
    except Exception as e:
        logger.error(f"Error sending SMS to client {formatted_phone}: {e}")
        return False


def send_otp_sms(phone: str) -> dict:
    """Send OTP via Twilio Verify"""
    if not twilio_client or not TWILIO_VERIFY_SERVICE_SID:
        raise Exception("Twilio Verify not configured")
    
    # Format phone number
    clean_phone = phone.replace(" ", "").replace("+229", "")
    formatted_phone = f"+229{clean_phone}" if not clean_phone.startswith("+") else clean_phone
    
    verification = twilio_client.verify.v2.services(TWILIO_VERIFY_SERVICE_SID) \
        .verifications.create(to=formatted_phone, channel="sms")
    
    return {"status": verification.status, "phone": clean_phone}


def verify_otp_sms(phone: str, code: str) -> bool:
    """Verify OTP via Twilio Verify"""
    if not twilio_client or not TWILIO_VERIFY_SERVICE_SID:
        raise Exception("Twilio Verify not configured")
    
    clean_phone = phone.replace(" ", "").replace("+229", "")
    formatted_phone = f"+229{clean_phone}" if not clean_phone.startswith("+") else clean_phone
    
    verification_check = twilio_client.verify.v2.services(TWILIO_VERIFY_SERVICE_SID) \
        .verification_checks.create(to=formatted_phone, code=code)
    
    return verification_check.status == "approved"
