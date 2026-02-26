import "@/index.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import HelpButton from "@/components/HelpButton";
import HomePage from "@/pages/HomePage";
import MenuPage from "@/pages/MenuPage";
import GamesPage from "@/pages/GamesPage";
import BookingPage from "@/pages/BookingPage";
import ConfirmationPage from "@/pages/ConfirmationPage";
import AdminLoginPage from "@/pages/AdminLoginPage";
import AdminPage from "@/pages/AdminPage";
import TestimonialsPage from "@/pages/TestimonialsPage";
import LocationPage from "@/pages/LocationPage";
import ReschedulePage from "@/pages/ReschedulePage";
import WalletPage from "@/pages/WalletPage";
import DeliveryPage from "@/pages/DeliveryPage";
import JoinUsPage from "@/pages/JoinUsPage";
import TableReservationPage from "@/pages/TableReservationPage";

function App() {
  return (
    <div className="min-h-screen bg-dark-bg">
      <BrowserRouter>
        <Navbar />
        <main>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/menu" element={<MenuPage />} />
            <Route path="/games" element={<GamesPage />} />
            <Route path="/booking" element={<BookingPage />} />
            <Route path="/booking/confirmation" element={<ConfirmationPage />} />
            <Route path="/admin" element={<AdminLoginPage />} />
            <Route path="/admin/dashboard" element={<AdminPage />} />
            <Route path="/avis" element={<TestimonialsPage />} />
            <Route path="/location" element={<LocationPage />} />
            <Route path="/reprogrammer" element={<ReschedulePage />} />
            <Route path="/provision" element={<WalletPage />} />
            <Route path="/livraison" element={<DeliveryPage />} />
            <Route path="/rejoindre" element={<JoinUsPage />} />
            <Route path="/reserver-table" element={<TableReservationPage />} />
          </Routes>
        </main>
        <Footer />
        <HelpButton />
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </div>
  );
}

export default App;
