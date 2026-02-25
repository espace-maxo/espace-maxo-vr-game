"""
Espace Maxo - Export Router
CSV/Excel export for bookings and location requests
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
import csv
import io
import logging

from config import db
from auth import get_current_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/export", tags=["Export"])


@router.get("/bookings/csv")
async def export_bookings_csv(is_admin: bool = Depends(get_current_admin)):
    """Export all bookings to CSV"""
    try:
        bookings = await db.bookings.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=1000)
        
        if not bookings:
            raise HTTPException(status_code=404, detail="Aucune réservation à exporter")
        
        # Create CSV in memory
        output = io.StringIO()
        
        # Define CSV headers
        fieldnames = [
            "ID", "Client", "Téléphone", "Type de Jeu", "Date", "Créneau",
            "Joueurs", "Parties", "Prix Total", "Frais Réservation", 
            "Montant Payé", "Statut Paiement", "Statut Réservation",
            "Reprogrammé", "Créé le"
        ]
        
        writer = csv.DictWriter(output, fieldnames=fieldnames, delimiter=';')
        writer.writeheader()
        
        for booking in bookings:
            game_type = "VR 360°" if booking.get("game_type") == "VR_360" else "Simulateur"
            writer.writerow({
                "ID": booking.get("id", "")[:8],
                "Client": booking.get("customer_name", ""),
                "Téléphone": booking.get("customer_phone", ""),
                "Type de Jeu": game_type,
                "Date": booking.get("date", ""),
                "Créneau": booking.get("time_slot", ""),
                "Joueurs": booking.get("number_of_players", 0),
                "Parties": booking.get("number_of_games", 0),
                "Prix Total": f"{booking.get('total_game_price', 0)} FCFA",
                "Frais Réservation": f"{booking.get('reservation_fee', 0)} FCFA",
                "Montant Payé": f"{booking.get('amount_to_pay', 0)} FCFA",
                "Statut Paiement": "Payé" if booking.get("payment_status") == "paid" else "En attente",
                "Statut Réservation": booking.get("booking_status", "active"),
                "Reprogrammé": "Oui" if booking.get("has_been_rescheduled") else "Non",
                "Créé le": booking.get("created_at", "")[:19].replace("T", " ")
            })
        
        output.seek(0)
        
        # Generate filename with date
        filename = f"reservations_espace_maxo_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
        
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Content-Type": "text/csv; charset=utf-8"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting bookings: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de l'export")


@router.get("/location-requests/csv")
async def export_location_requests_csv(is_admin: bool = Depends(get_current_admin)):
    """Export all location requests to CSV"""
    try:
        requests = await db.location_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=1000)
        
        if not requests:
            raise HTTPException(status_code=404, detail="Aucune demande à exporter")
        
        # Create CSV in memory
        output = io.StringIO()
        
        # Define CSV headers
        fieldnames = [
            "ID", "Nom", "Téléphone", "Email", "Entreprise",
            "Type Événement", "Date", "Heure Début", "Heure Fin",
            "Nombre Invités", "Formule", "Budget", "Services",
            "Message", "Statut", "Créé le"
        ]
        
        writer = csv.DictWriter(output, fieldnames=fieldnames, delimiter=';')
        writer.writeheader()
        
        formula_labels = {
            "location_simple": "Location simple",
            "location_restauration": "Location + Restauration",
            "location_boissons": "Location + Boissons",
            "personnalisee": "Formule personnalisée"
        }
        
        status_labels = {
            "pending": "En attente",
            "contacted": "Contacté",
            "confirmed": "Confirmé",
            "rejected": "Rejeté",
            "cancelled": "Annulé"
        }
        
        for req in requests:
            services = ", ".join(req.get("services", [])) if req.get("services") else ""
            writer.writerow({
                "ID": req.get("id", "")[:8],
                "Nom": req.get("fullName", ""),
                "Téléphone": req.get("phone", ""),
                "Email": req.get("email", ""),
                "Entreprise": req.get("company", ""),
                "Type Événement": req.get("eventType", ""),
                "Date": req.get("eventDate", ""),
                "Heure Début": req.get("startTime", ""),
                "Heure Fin": req.get("endTime", ""),
                "Nombre Invités": req.get("guestCount", ""),
                "Formule": formula_labels.get(req.get("formula", ""), req.get("formula", "")),
                "Budget": req.get("budget", ""),
                "Services": services,
                "Message": req.get("message", "")[:200],
                "Statut": status_labels.get(req.get("status", ""), req.get("status", "")),
                "Créé le": req.get("created_at", "")[:19].replace("T", " ")
            })
        
        output.seek(0)
        
        # Generate filename with date
        filename = f"demandes_location_espace_maxo_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
        
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Content-Type": "text/csv; charset=utf-8"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting location requests: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de l'export")


@router.get("/loyalty/csv")
async def export_loyalty_accounts_csv(is_admin: bool = Depends(get_current_admin)):
    """Export all loyalty accounts to CSV"""
    try:
        accounts = await db.loyalty_accounts.find({}, {"_id": 0}).sort("total_points", -1).to_list(length=1000)
        
        if not accounts:
            raise HTTPException(status_code=404, detail="Aucun compte fidélité à exporter")
        
        # Create CSV in memory
        output = io.StringIO()
        
        # Define CSV headers
        fieldnames = [
            "Téléphone", "Nom", "Points Total", "Points Disponibles",
            "Parties Jouées", "Parties Gratuites Gagnées", "Parties Gratuites Utilisées",
            "Créé le", "Mis à jour le"
        ]
        
        writer = csv.DictWriter(output, fieldnames=fieldnames, delimiter=';')
        writer.writeheader()
        
        for account in accounts:
            writer.writerow({
                "Téléphone": account.get("phone", ""),
                "Nom": account.get("customer_name", ""),
                "Points Total": account.get("total_points", 0),
                "Points Disponibles": account.get("available_points", 0),
                "Parties Jouées": account.get("total_games_played", 0),
                "Parties Gratuites Gagnées": account.get("free_games_earned", 0),
                "Parties Gratuites Utilisées": account.get("free_games_used", 0),
                "Créé le": account.get("created_at", "")[:19].replace("T", " "),
                "Mis à jour le": account.get("updated_at", "")[:19].replace("T", " ")
            })
        
        output.seek(0)
        
        # Generate filename with date
        filename = f"fidelite_espace_maxo_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
        
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Content-Type": "text/csv; charset=utf-8"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting loyalty accounts: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de l'export")
