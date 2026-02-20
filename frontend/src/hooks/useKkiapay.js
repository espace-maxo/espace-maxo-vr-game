import { useEffect, useCallback } from "react";

// Kkiapay Widget Hook
export const useKkiapay = () => {
  useEffect(() => {
    // Load Kkiapay script if not already loaded
    if (!document.querySelector('script[src="https://cdn.kkiapay.me/k.js"]')) {
      const script = document.createElement("script");
      script.src = "https://cdn.kkiapay.me/k.js";
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  const openPayment = useCallback(({ amount, reason, name, phone, email, bookingId, publicKey, sandbox, onSuccess, onFailed }) => {
    if (typeof window.openKkiapayWidget === "function") {
      // Set up success listener
      if (typeof window.addSuccessListener === "function") {
        window.addSuccessListener((response) => {
          if (onSuccess) {
            onSuccess({
              transactionId: response.transactionId,
              bookingId: bookingId
            });
          }
        });
      }

      // Set up failed listener
      if (typeof window.addFailedListener === "function") {
        window.addFailedListener((response) => {
          if (onFailed) {
            onFailed(response);
          }
        });
      }

      // Open the widget
      window.openKkiapayWidget({
        amount: amount,
        api_key: publicKey,
        sandbox: sandbox,
        phone: phone || "",
        email: email || "",
        name: name || "",
        reason: reason || "Réservation Espace Maxo",
        data: bookingId
      });
    } else {
      console.error("Kkiapay widget not loaded");
      if (onFailed) {
        onFailed({ error: "Widget not loaded" });
      }
    }
  }, []);

  return { openPayment };
};

export default useKkiapay;
